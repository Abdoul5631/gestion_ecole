from rest_framework import serializers
from .models import Eleve, Presence, AppelJournalier


class EleveSerializer(serializers.ModelSerializer):
    niveau_actuel = serializers.SerializerMethodField(read_only=True)
    classe_actuelle = serializers.SerializerMethodField(read_only=True)
    classe_examen = serializers.SerializerMethodField(read_only=True)
    username = serializers.SerializerMethodField(read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)
    age = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Eleve
        fields = [
            'id', 'matricule', 'nom', 'prenom',
            'date_naissance', 'age', 'lieu_naissance', 'sexe',
            'nom_parent', 'prenom_parent', 'telephone_parent',
            'photo', 'photo_url',
            'is_active', 'niveau_actuel', 'classe_actuelle', 'classe_examen', 'username'
        ]
        read_only_fields = ['id', 'niveau_actuel', 'classe_actuelle', 'classe_examen', 'username', 'photo_url', 'age']
        extra_kwargs = {'photo': {'required': False, 'allow_null': True},
                        'matricule': {'required': False, 'allow_blank': True}}

    def validate_matricule(self, value):
        """Un matricule est unique dans l'école (majuscules ou minuscules, peu importe) : message clair au lieu d'une erreur serveur.
        À l'ajout, un matricule vide est attribué automatiquement (initiales de l'école + numéro)."""
        value = (value or '').strip()
        if not value:
            if self.instance is None:
                return ''
            raise serializers.ValidationError('Le matricule est obligatoire.')
        request = self.context.get('request')
        ecole_id = getattr(getattr(request, 'user', None), 'ecole_id', None)
        deja = Eleve.objects.filter(matricule__iexact=value, ecole_id=ecole_id)
        if self.instance is not None:
            deja = deja.exclude(pk=self.instance.pk)
        autre = deja.first()
        if autre:
            raise serializers.ValidationError(
                f"Le matricule {autre.matricule} est déjà attribué à {autre.prenom} {autre.nom}. Choisissez un autre matricule.")
        return value

    def get_age(self, obj):
        from scolarite.utils import calculer_age
        return calculer_age(obj.date_naissance)

    def get_photo_url(self, obj):
        if obj.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.photo.url)
            return obj.photo.url
        return None

    def _inscription_annee(self, obj):
        prefetched = getattr(obj, 'inscriptions_annee', None)
        if prefetched is not None:
            return prefetched[0] if prefetched else None

        annee = self.context.get('annee')
        if 'annee' not in self.context:
            from scolarite.utils import get_annee_active
            request = self.context.get('request')
            ecole = getattr(getattr(request, 'user', None), 'ecole', None) or getattr(obj, 'ecole', None)
            annee = get_annee_active(ecole)
            self.context['annee'] = annee
        qs = obj.inscriptions.select_related('classe__niveau')
        if annee:
            qs = qs.filter(annee_scolaire=annee)
        return qs.first()

    def get_niveau_actuel(self, obj):
        ins = self._inscription_annee(obj)
        if ins and ins.classe:
            return ins.classe.niveau.nom
        return None

    def get_classe_examen(self, obj):
        ins = self._inscription_annee(obj)
        return bool(ins and ins.classe and ins.classe.niveau and ins.classe.niveau.is_classe_examen)

    def get_classe_actuelle(self, obj):
        ins = self._inscription_annee(obj)
        if ins and ins.classe:
            return ins.classe.nom
        return None

    def get_username(self, obj):
        prefetched = getattr(obj, 'comptes_eleve', None)
        if prefetched is not None:
            return prefetched[0].username if prefetched else None
        try:
            compte = obj.comptes.filter(role='ELEVE').first()
            return compte.username if compte else None
        except Exception:
            return None


class PresenceSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    matiere_nom = serializers.CharField(source='classe_matiere.matiere.nom', read_only=True)
    niveau_nom = serializers.CharField(
        source='classe_matiere.classe.niveau.nom', read_only=True, allow_null=True, default=None
    )

    class Meta:
        model = Presence
        fields = '__all__'
        read_only_fields = ['id', 'justifiee', 'motif_justification', 'justifiee_par', 'justifiee_le']

    def validate_statut(self, value):
        user = getattr(self.context.get('request'), 'user', None)
        if getattr(user, 'role', None) == 'ENSEIGNANT' and value not in ('PRESENT', 'ABSENT'):
            raise serializers.ValidationError("L'enseignant indique seulement présent ou absent.")
        return value

    def validate_date(self, value):
        # un enseignant fait l'appel pendant son cours : ni dans le passé, ni dans l'avenir
        user = getattr(self.context.get('request'), 'user', None)
        if getattr(user, 'role', None) == 'ENSEIGNANT':
            from django.utils import timezone
            if value != timezone.localdate():
                raise serializers.ValidationError("L'appel se fait uniquement le jour même, pendant le cours.")
        return value


class AppelJournalierSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='eleve.matricule', read_only=True)
    classe_nom = serializers.CharField(source='classe.nom', read_only=True)

    class Meta:
        model = AppelJournalier
        fields = [
            'id', 'eleve', 'eleve_nom', 'eleve_prenom', 'eleve_matricule',
            'classe', 'classe_nom', 'date', 'statut', 'ecole',
        ]
        read_only_fields = ['id', 'ecole']
