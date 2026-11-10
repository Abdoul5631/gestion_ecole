from rest_framework import serializers
from .models import Enseignant, Matiere, ClasseMatiere, EmploiDuTemps, Exercice


class EnseignantSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    user_id = serializers.SerializerMethodField()
    signature_url = serializers.SerializerMethodField(read_only=True)
    classes = serializers.SerializerMethodField()

    def get_classes(self, obj):
        """Classes où l'enseignant intervient : [{id, nom, matieres: [...], principal: bool}]."""
        affectations = getattr(obj, 'affectations_actives', None)
        if affectations is None:
            affectations = obj.classe_matieres.filter(is_active=True).select_related('classe', 'matiere')
        par_classe = {}
        for cm in affectations:
            if not cm.classe_id:
                continue
            c = par_classe.setdefault(cm.classe_id, {
                'id': cm.classe_id, 'nom': cm.classe.nom, 'matieres': [], 'principal': False,
            })
            if cm.matiere_id and cm.matiere.nom not in c['matieres']:
                c['matieres'].append(cm.matiere.nom)
        for classe in obj.classes_principales.all():
            c = par_classe.setdefault(classe.id, {'id': classe.id, 'nom': classe.nom, 'matieres': [], 'principal': False})
            c['principal'] = True
        return sorted(par_classe.values(), key=lambda c: c['nom'])

    def validate_telephone(self, value):
        """Numéro normalisé (226XXXXXXXX au Burkina, +indicatif ailleurs), unique parmi les enseignants de l'école."""
        from notifications.services import normalize_bf_phone, telephone_valide_bf
        value = (value or '').strip()
        if not value:
            return ''
        numero = normalize_bf_phone(value)
        if not telephone_valide_bf(numero):
            raise serializers.ValidationError('Numéro de téléphone invalide : 8 chiffres au Burkina (ex. 70 12 34 56), ou avec votre indicatif (ex. +225 07 12 34 56 78).')
        request = self.context.get('request')
        ecole = getattr(getattr(request, 'user', None), 'ecole', None)
        deja = Enseignant.objects.filter(telephone=numero, ecole=ecole)
        if self.instance:
            deja = deja.exclude(pk=self.instance.pk)
        if deja.exists():
            raise serializers.ValidationError('Ce numéro est déjà utilisé par un autre enseignant.')
        return numero

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        voit_contacts = bool(user and user.is_authenticated and (
            user.role == 'ADMIN' or getattr(user, 'enseignant_id', None) == instance.id
        ))
        if not voit_contacts:
            for champ in ('telephone', 'email', 'username', 'user_id'):
                data.pop(champ, None)
        return data

    def get_username(self, obj):
        try:
            return obj.user.username
        except Exception:
            return None

    def get_email(self, obj):
        try:
            return obj.user.email or ''
        except Exception:
            return ''

    def get_user_id(self, obj):
        try:
            return obj.user.id
        except Exception:
            return None

    def get_signature_url(self, obj):
        if obj.signature:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.signature.url)
            return obj.signature.url
        return None

    class Meta:
        model = Enseignant
        fields = ['id', 'nom', 'prenom', 'telephone', 'is_active', 'username', 'email', 'user_id', 'signature', 'signature_url', 'classes']
        read_only_fields = ['id', 'username', 'email', 'user_id', 'signature_url', 'classes']


class MatiereSerializer(serializers.ModelSerializer):
    nb_affectations = serializers.SerializerMethodField()

    def get_nb_affectations(self, obj):
        return obj.classe_matieres.count()

    class Meta:
        model = Matiere
        fields = '__all__'
        extra_kwargs = {'ecole': {'read_only': True}}
        read_only_fields = ['id', 'nb_affectations']


class ClasseMatiereSerializer(serializers.ModelSerializer):
    classe_nom = serializers.SerializerMethodField()
    niveau_nom = serializers.SerializerMethodField()
    niveau_id  = serializers.IntegerField(source='classe.niveau.id', read_only=True, allow_null=True)
    matiere_nom = serializers.CharField(source='matiere.nom', read_only=True)
    matiere_type = serializers.CharField(source='matiere.type', read_only=True)
    enseignant_nom = serializers.SerializerMethodField()
    niveau_is_classe_examen = serializers.SerializerMethodField()

    def get_classe_nom(self, obj):
        return obj.classe.nom if obj.classe else None

    def get_niveau_nom(self, obj):
        if obj.classe and obj.classe.niveau:
            return obj.classe.niveau.nom
        return None

    def get_niveau_is_classe_examen(self, obj):
        if obj.classe and obj.classe.niveau:
            return obj.classe.niveau.is_classe_examen
        return False

    def get_enseignant_nom(self, obj):
        return obj.enseignant.nom if obj.enseignant else None

    class Meta:
        model = ClasseMatiere
        fields = '__all__'


class EmploiDuTempsSerializer(serializers.ModelSerializer):
    matiere_nom    = serializers.CharField(source='classe_matiere.matiere.nom', read_only=True)
    matiere_type   = serializers.CharField(source='classe_matiere.matiere.type', read_only=True)
    enseignant_nom = serializers.SerializerMethodField()
    classe_nom     = serializers.CharField(source='classe_matiere.classe.nom', read_only=True)
    classe_id      = serializers.IntegerField(source='classe_matiere.classe.id', read_only=True)

    def get_enseignant_nom(self, obj):
        e = obj.classe_matiere.enseignant
        return e.nom if e else None

    class Meta:
        model = EmploiDuTemps
        fields = [
            'id', 'classe_matiere', 'matiere_nom', 'matiere_type',
            'enseignant_nom', 'classe_nom', 'classe_id',
            'jour', 'heure_debut', 'heure_fin', 'salle', 'is_active',
        ]

    def validate(self, attrs):
        classe_matiere = attrs.get('classe_matiere') or getattr(self.instance, 'classe_matiere', None)
        jour = attrs.get('jour') or getattr(self.instance, 'jour', None)
        heure_debut = attrs.get('heure_debut') or getattr(self.instance, 'heure_debut', None)
        heure_fin = attrs.get('heure_fin') or getattr(self.instance, 'heure_fin', None)

        if not all([classe_matiere, jour, heure_debut, heure_fin]):
            return attrs

        if heure_fin <= heure_debut:
            raise serializers.ValidationError({
                'heure_fin': "L'heure de fin doit être après l'heure de début.",
            })

        jour_label = dict(EmploiDuTemps.JOURS).get(jour, jour)
        debut_s = heure_debut.strftime('%H:%M') if hasattr(heure_debut, 'strftime') else str(heure_debut)[:5]
        fin_s = heure_fin.strftime('%H:%M') if hasattr(heure_fin, 'strftime') else str(heure_fin)[:5]

        qs = EmploiDuTemps.objects.filter(
            jour=jour,
            is_active=True,
            heure_debut__lt=heure_fin,
            heure_fin__gt=heure_debut,
        ).select_related(
            'classe_matiere__classe',
            'classe_matiere__enseignant',
            'classe_matiere__matiere',
        )

        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        else:
            # Même créneau exact = upsert (create remplace) : pas un conflit
            same_slot = EmploiDuTemps.objects.filter(
                classe_matiere=classe_matiere,
                jour=jour,
                heure_debut=heure_debut,
            ).first()
            if same_slot:
                qs = qs.exclude(pk=same_slot.pk)

        classe = classe_matiere.classe
        enseignant = classe_matiere.enseignant
        classe_id = classe.id if classe else None
        enseignant_id = enseignant.id if enseignant else None

        for emp in qs:
            emp_cm = emp.classe_matiere
            matiere_nom = emp_cm.matiere.nom if emp_cm.matiere_id else 'cours'
            emp_debut = emp.heure_debut.strftime('%H:%M')
            emp_fin = emp.heure_fin.strftime('%H:%M')

            if classe_id and emp_cm.classe_id == classe_id:
                raise serializers.ValidationError(
                    f"Conflit : la classe {classe.nom} a déjà « {matiere_nom} » "
                    f"le {jour_label} de {emp_debut} à {emp_fin} "
                    f"(vous voulez {debut_s}–{fin_s})."
                )
            if enseignant_id and emp_cm.enseignant_id == enseignant_id:
                autre_classe = emp_cm.classe.nom if emp_cm.classe_id else 'une autre classe'
                ens_nom = f"{enseignant.prenom} {enseignant.nom}".strip() or enseignant.nom
                raise serializers.ValidationError(
                    f"Conflit : l'enseignant {ens_nom} a déjà « {matiere_nom} » "
                    f"({autre_classe}) le {jour_label} de {emp_debut} à {emp_fin} "
                    f"(vous voulez {debut_s}–{fin_s})."
                )

        return attrs

    def create(self, validated_data):
        lookup = {
            'classe_matiere': validated_data['classe_matiere'],
            'jour': validated_data['jour'],
            'heure_debut': validated_data['heure_debut'],
        }
        existing = EmploiDuTemps.objects.filter(**lookup).first()
        if existing:
            for key, value in validated_data.items():
                setattr(existing, key, value)
            existing.is_active = True
            existing.save()
            return existing
        return super().create(validated_data)


class ExerciceSerializer(serializers.ModelSerializer):
    classe_id = serializers.IntegerField(source='classe_matiere.classe_id', read_only=True)
    classe_nom = serializers.CharField(source='classe_matiere.classe.nom', read_only=True)
    matiere_nom = serializers.CharField(source='classe_matiere.matiere.nom', read_only=True)
    enseignant_nom = serializers.SerializerMethodField()
    fichier_url = serializers.SerializerMethodField()
    fichier_nom = serializers.SerializerMethodField()

    class Meta:
        model = Exercice
        fields = [
            'id', 'classe_matiere', 'classe_id', 'classe_nom', 'matiere_nom', 'enseignant_nom',
            'titre', 'consigne', 'fichier', 'fichier_url', 'fichier_nom', 'date_limite',
            'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'is_active', 'created_at']
        extra_kwargs = {'fichier': {'write_only': True, 'required': False, 'allow_null': True}}

    def get_enseignant_nom(self, obj):
        ens = obj.classe_matiere.enseignant
        if not ens:
            return ''
        return f"{ens.prenom} {ens.nom}".strip()

    def get_fichier_url(self, obj):
        if not obj.fichier:
            return None
        request = self.context.get('request')
        return request.build_absolute_uri(obj.fichier.url) if request else obj.fichier.url

    def get_fichier_nom(self, obj):
        return obj.fichier.name.rsplit('/', 1)[-1] if obj.fichier else None

    def validate_classe_matiere(self, cm):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user is not None and user.role == 'ENSEIGNANT':
            if not user.enseignant_id or cm.enseignant_id != user.enseignant_id:
                raise serializers.ValidationError("Vous n'enseignez pas cette matière dans cette classe.")
        if user is not None and cm.ecole_id and getattr(user, 'ecole_id', None) != cm.ecole_id:
            raise serializers.ValidationError('Classe / matière introuvable.')
        return cm

    def validate_fichier(self, f):
        if f and f.size > 10 * 1024 * 1024:
            raise serializers.ValidationError('Fichier trop lourd (10 Mo maximum).')
        return f
