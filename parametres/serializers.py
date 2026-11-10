from rest_framework import serializers
from accounts.models import User
from .models import Parametres


class CreerEcoleSerializer(serializers.Serializer):
    """Demande de création d'une école : son identité et son directeur. Pas de mot de passe : il est donné à la validation."""
    nom_ecole = serializers.CharField(max_length=200)
    statut_juridique = serializers.ChoiceField(choices=Parametres.STATUTS_JURIDIQUES)
    ordre_enseignement = serializers.ChoiceField(choices=Parametres.ORDRES)
    annee_creation = serializers.CharField(max_length=10, required=False, allow_blank=True)
    numero_autorisation = serializers.CharField(max_length=80, required=False, allow_blank=True)
    ville = serializers.CharField(max_length=100)
    adresse = serializers.CharField(max_length=300, required=False, allow_blank=True)
    direction_regionale = serializers.CharField(max_length=200, required=False, allow_blank=True)
    direction_provinciale = serializers.CharField(max_length=200, required=False, allow_blank=True)
    telephone = serializers.CharField(max_length=30)
    email = serializers.EmailField()
    directeur = serializers.CharField(max_length=150)
    telephone_directeur = serializers.CharField(max_length=30)

    def validate_nom_ecole(self, v):
        v = v.strip()
        if len(v) < 3:
            raise serializers.ValidationError("Indiquez le nom complet de l'école.")
        return v

    def validate_annee_creation(self, v):
        v = (v or '').strip()
        if v and not (v.isdigit() and 1900 <= int(v) <= 2100):
            raise serializers.ValidationError('Année sur 4 chiffres, ex. 2008.')
        return v

    def _telephone(self, v):
        from notifications.services import normalize_bf_phone, telephone_valide_bf
        n = normalize_bf_phone(v)
        if telephone_valide_bf(n):
            return n
        raise serializers.ValidationError(
            'Numéro invalide. Au Burkina Faso : 8 chiffres, ex. 70 12 34 56. Autre pays : commencez par + et l’indicatif, ex. +225 07 12 34 56 78.')

    def validate_telephone(self, v):
        return self._telephone(v)

    def validate_telephone_directeur(self, v):
        return self._telephone(v)


class ParametresSerializer(serializers.ModelSerializer):
    logo_url      = serializers.SerializerMethodField(read_only=True)
    signature_url = serializers.SerializerMethodField(read_only=True)
    tampon_url    = serializers.SerializerMethodField(read_only=True)
    vitrine_photo_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model  = Parametres
        fields = [
            'id', 'nom_ecole', 'slogan', 'adresse', 'ville', 'telephone',
            'email', 'directeur', 'devise', 'logo', 'logo_url', 'couleur_primaire', 'modele_carte', 'couleur_carte',
            'direction_regionale', 'direction_provinciale', 'boite_postale', 'annee_creation',
            'signature', 'signature_url',
            'tampon', 'tampon_url',
            'seuil_passage', 'mot_de_passe_defaut_eleves', 'mot_de_passe_defaut_parents',
            'mot_de_passe_defaut_enseignants',
            'slug', 'presentation_vitrine', 'vitrine_active',
            'vitrine_photo', 'vitrine_photo_url', 'vitrine_atouts', 'vitrine_horaires', 'vitrine_whatsapp',
            'vitrine_facebook', 'vitrine_carte', 'vitrine_afficher_tarifs', 'vitrine_afficher_classes',
        ]
        read_only_fields = ['slug']

    def validate_vitrine_atouts(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Liste attendue.')
        propres = []
        for a in value[:4]:
            if not isinstance(a, dict):
                continue
            titre = str(a.get('titre') or '').strip()[:60]
            texte = str(a.get('texte') or '').strip()[:220]
            if titre:
                propres.append({'titre': titre, 'texte': texte})
        return propres

    def validate_vitrine_photo(self, f):
        if f and f.size > 4 * 1024 * 1024:
            raise serializers.ValidationError('Photo trop lourde (4 Mo maximum).')
        return f

    def get_vitrine_photo_url(self, obj):
        if obj.vitrine_photo:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.vitrine_photo.url) if request else obj.vitrine_photo.url
        return None

    def validate_modele_carte(self, value):
        from eleves.carte import CODES
        if value and value not in CODES:
            raise serializers.ValidationError('Modèle de carte inconnu.')
        return value or 'classique'

    def validate_couleur_carte(self, value):
        from eleves.carte import couleur_valide
        if value and not couleur_valide(value):
            raise serializers.ValidationError('Couleur invalide (format #RRGGBB).')
        return value

    def validate_mot_de_passe_defaut_enseignants(self, value):
        return self.validate_mot_de_passe_defaut_eleves(value)

    def validate_mot_de_passe_defaut_parents(self, value):
        return self.validate_mot_de_passe_defaut_eleves(value)

    def validate_mot_de_passe_defaut_eleves(self, value):
        value = (value or '').strip()
        if value and len(value) < 6:
            raise serializers.ValidationError('Au moins 6 caractères.')
        from accounts.passwords import MOT_DE_PASSE_PARTAGE_INTERDIT
        if value == MOT_DE_PASSE_PARTAGE_INTERDIT:
            raise serializers.ValidationError('Ce mot de passe est trop connu, choisissez-en un autre.')
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Visible uniquement par l'admin de l'école (jamais élèves / parents / enseignants)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not (user and getattr(user, 'role', None) == 'ADMIN'):
            data.pop('mot_de_passe_defaut_eleves', None)
            data.pop('mot_de_passe_defaut_parents', None)
            data.pop('mot_de_passe_defaut_enseignants', None)
        return data

    def get_logo_url(self, obj):
        if obj.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None

    def get_signature_url(self, obj):
        if obj.signature:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.signature.url)
            return obj.signature.url
        return None

    def get_tampon_url(self, obj):
        if obj.tampon:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.tampon.url)
            return obj.tampon.url
        return None


class EcolePlateformeSerializer(ParametresSerializer):
    nb_utilisateurs = serializers.SerializerMethodField()
    directeur_username = serializers.SerializerMethodField()
    statut_libelle = serializers.CharField(source='get_statut_display', read_only=True)

    class Meta(ParametresSerializer.Meta):
        fields = ParametresSerializer.Meta.fields + [
            'statut', 'statut_libelle', 'motif', 'date_demande', 'date_statut',
            'nb_utilisateurs', 'directeur_username', 'directeur_email',
            'statut_juridique', 'statut_juridique_libelle', 'ordre_enseignement', 'ordre_enseignement_libelle',
            'numero_autorisation', 'telephone_directeur',
        ]

    statut_juridique_libelle = serializers.CharField(source='get_statut_juridique_display', read_only=True)
    ordre_enseignement_libelle = serializers.CharField(source='get_ordre_enseignement_display', read_only=True)
    directeur_email = serializers.SerializerMethodField()

    def get_directeur_email(self, obj):
        admin = User.objects.filter(ecole=obj, role='ADMIN', is_plateforme=False).order_by('id').first()
        return admin.email if admin else None

    def get_nb_utilisateurs(self, obj):
        return User.objects.filter(ecole=obj).count()

    def get_directeur_username(self, obj):
        admin = (
            User.objects.filter(ecole=obj, role='ADMIN', is_plateforme=False)
            .order_by('id')
            .first()
        )
        return admin.username if admin else None
