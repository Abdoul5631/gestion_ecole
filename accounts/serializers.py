from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User
from eleves.models import Eleve
from .roles import ROLES_PERSONNEL


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT : identifiant = username (matricule élève) OU email."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['roles'] = list(user.roles)
        token['username'] = user.username
        token['email'] = user.email
        token['ecole_id'] = user.ecole_id
        token['is_plateforme'] = bool(getattr(user, 'is_plateforme', False) or user.role == 'SUPER_ADMIN')
        ecole = getattr(user, 'ecole', None)
        token['ecole_statut'] = ecole.statut if ecole else None
        return token

    def _resolve_login_identifier(self, identifier, password=None):
        identifier = (identifier or '').strip()
        if not identifier:
            return identifier

        user = User.objects.filter(username=identifier).first()
        if user is None:
            user = User.objects.filter(username__iexact=identifier).first()
        if user is None and '@' in identifier:
            matches = User.objects.filter(email__iexact=identifier)
            if matches.count() == 1:
                user = matches.first()
        if user is None and sum(ch.isdigit() for ch in identifier) >= 8 and '@' not in identifier:
            # Parent : numéro de téléphone saisi avec espaces, +226, 0 devant, etc.
            from notifications.services import normalize_bf_phone, telephone_valide_bf
            numero = normalize_bf_phone(identifier)
            if telephone_valide_bf(numero):
                # Comptes parent ou enseignant dont l'identifiant est le numéro, ou enseignant dont la fiche porte ce numéro
                candidats = list(
                    (User.objects.filter(role__in=['PARENT', 'ENSEIGNANT', *ROLES_PERSONNEL], username=numero)
                     | User.objects.filter(role__in=['PARENT', 'ENSEIGNANT', *ROLES_PERSONNEL], username__startswith=f"{numero}.")
                     | User.objects.filter(role='ENSEIGNANT', enseignant__telephone=numero)).filter(is_active=True).distinct()
                )
                if len(candidats) == 1:
                    user = candidats[0]
                elif len(candidats) > 1 and password:
                    # même numéro pour un parent et un enseignant : le mot de passe départage
                    user = next((c for c in candidats if c.check_password(password)), None)
                if user is None:
                    # Compte parent plus ancien (identifiant libre) : on retrouve le parent par le téléphone
                    # enregistré sur la fiche de son enfant, s'il n'y a qu'un seul compte concerné.
                    from eleves.models import Eleve
                    motif = '[^0-9]*'.join(numero[-8:])
                    eleves_ids = list(Eleve.objects.filter(telephone_parent__regex=motif).values_list('id', flat=True))
                    if eleves_ids:
                        lies = User.objects.filter(role='PARENT', is_active=True, enfants__in=eleves_ids).distinct()
                        if lies.count() == 1:
                            user = lies.first()

        return user.username if user is not None else identifier

    def validate(self, attrs):
        login_field = self.username_field
        attrs[login_field] = self._resolve_login_identifier(attrs.get(login_field), attrs.get('password'))
        data = super().validate(attrs)
        data['role'] = self.user.role
        data['roles'] = list(self.user.roles)
        data['username'] = self.user.username
        data['email'] = self.user.email
        data['id'] = self.user.id
        from rest_framework.exceptions import AuthenticationFailed
        from config.tenancy import ecole_of, ecole_session_payload, is_plateforme, setup_needed

        if not is_plateforme(self.user):
            ecole = ecole_of(self.user)
            if ecole is not None:
                if ecole.statut == 'REFUSEE':
                    msg = "Votre demande d'école a été refusée."
                    if ecole.motif:
                        msg += f" Motif : {ecole.motif}"
                    raise AuthenticationFailed(msg)
                if ecole.statut == 'SUSPENDUE':
                    msg = "Votre école est suspendue."
                    if ecole.motif:
                        msg += f" Motif : {ecole.motif}"
                    raise AuthenticationFailed(msg)

        data.update(ecole_session_payload(self.user))
        data['setup_needed'] = setup_needed(self.user)
        data['must_change_password'] = bool(getattr(self.user, 'must_change_password', False))
        from .journal import noter, _ip
        noter('CONNEXION', user=self.user, ip=_ip(self.context.get('request')))
        return data


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    mot_de_passe_temporaire = serializers.SerializerMethodField(read_only=True)
    enseignant_nom = serializers.SerializerMethodField(read_only=True)
    eleve_nom = serializers.SerializerMethodField(read_only=True)
    enfants = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Eleve.objects.all(),
        required=False
    )
    enfants_details = serializers.SerializerMethodField(read_only=True)
    ecole_id = serializers.IntegerField(read_only=True)
    ecole_nom = serializers.CharField(source='ecole.nom_ecole', read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'role', 'roles_supplementaires', 'password', 'enseignant', 'eleve',
                  'enseignant_nom', 'eleve_nom', 'is_active', 'enfants', 'enfants_details',
                  'ecole_id', 'ecole_nom', 'is_plateforme', 'must_change_password',
                  'mot_de_passe_temporaire']
        read_only_fields = ['ecole_id', 'ecole_nom', 'is_plateforme', 'must_change_password',
                            'mot_de_passe_temporaire']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and getattr(user, 'ecole_id', None):
            self.fields['enfants'].queryset = Eleve.objects.filter(ecole_id=user.ecole_id)

    def get_enseignant_nom(self, obj):
        if obj.enseignant:
            return obj.enseignant.nom
        return None

    def get_eleve_nom(self, obj):
        if obj.eleve:
            return f"{obj.eleve.prenom} {obj.eleve.nom}"
        return None

    def get_enfants_details(self, obj):
        return [
            {'id': e.id, 'nom': e.nom, 'prenom': e.prenom, 'matricule': e.matricule}
            for e in obj.enfants.all()
        ]

    def get_mot_de_passe_temporaire(self, obj):
        return getattr(obj, 'mot_de_passe_temporaire', None)

    def validate_role(self, value):
        if value == 'SUPER_ADMIN':
            raise serializers.ValidationError(
                "Le rôle Super administrateur ne peut pas être assigné via l'interface."
            )
        if value == 'ADMIN':
            if self.instance and self.instance.role == 'ADMIN':
                return value
            raise serializers.ValidationError(
                "Le rôle Administrateur ne peut pas être assigné via l'interface."
            )
        return value

    def validate(self, attrs):
        from .roles import CUMULS_AUTORISES
        role = attrs.get('role') or getattr(self.instance, 'role', None)
        extras = attrs.get('roles_supplementaires')
        if extras is None:
            # changement de rôle principal : on retire les cumuls devenus impossibles
            if 'role' in attrs and self.instance is not None:
                attrs['roles_supplementaires'] = [
                    r for r in (self.instance.roles_supplementaires or []) if r in CUMULS_AUTORISES.get(role, ())
                ]
            return attrs
        if not isinstance(extras, list) or not all(isinstance(r, str) for r in extras):
            raise serializers.ValidationError({'roles_supplementaires': 'Liste de rôles attendue.'})
        permis = CUMULS_AUTORISES.get(role, ())
        refuses = [r for r in extras if r != role and r not in permis]
        if refuses:
            raise serializers.ValidationError({'roles_supplementaires': (
                "Cumuls possibles : secrétaire + comptable, ou secrétaire + responsable du site public." if permis
                else "Ce rôle ne peut pas être cumulé avec un autre."
            )})
        attrs['roles_supplementaires'] = [r for r in dict.fromkeys(extras) if r != role]
        return attrs

    def create(self, validated_data):
        from .passwords import generer_mot_de_passe_temporaire, mot_de_passe_a_generer
        password = validated_data.pop('password', None)
        enfants = validated_data.pop('enfants', [])
        request = self.context.get('request')
        if request and getattr(request.user, 'ecole_id', None) and not validated_data.get('ecole'):
            validated_data['ecole'] = request.user.ecole
        generated = mot_de_passe_a_generer(password)
        if generated:
            from .passwords import mot_de_passe_defaut_pour_role
            defaut = mot_de_passe_defaut_pour_role(validated_data.get('role'), validated_data.get('ecole'))
            password = defaut or generer_mot_de_passe_temporaire()
        user = User(**validated_data)
        if password:
            user.set_password(password)
        if generated or user.role in ('ELEVE', 'ENSEIGNANT', 'PARENT', *ROLES_PERSONNEL):
            user.must_change_password = True
        user.save()
        if enfants:
            user.enfants.set(enfants)
        if generated:
            user.mot_de_passe_temporaire = password
        return user

    def to_representation(self, instance):
        data = super().to_representation(instance)
        pwd = getattr(instance, 'mot_de_passe_temporaire', None)
        if pwd:
            data['mot_de_passe_temporaire'] = pwd
        else:
            data.pop('mot_de_passe_temporaire', None)
        return data

    def update(self, instance, validated_data):
        # le mot de passe appartient à son titulaire : seul le directeur peut en redonner un à son équipe
        # (enseignants, secrétaires, comptables, surveillants) ; jamais à un élève ou un parent
        password = validated_data.pop('password', None)
        enfants = validated_data.pop('enfants', None)
        demandeur = getattr(self.context.get('request'), 'user', None)
        if not (password and getattr(demandeur, 'role', None) == 'ADMIN' and not getattr(demandeur, 'is_plateforme', False)
                and instance.role in ('ENSEIGNANT', *ROLES_PERSONNEL) and instance.pk != demandeur.pk):
            password = None
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
            instance.must_change_password = True
        instance.save()
        if password:
            from .passwords import revoquer_sessions
            from .journal import noter
            revoquer_sessions(instance)
            noter('AUTRE', 'Compte', f'Mot de passe redonné par le directeur à {instance.username}')
        if enfants is not None:
            instance.enfants.set(enfants)
        return instance