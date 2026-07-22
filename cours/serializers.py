from rest_framework import serializers
from .models import Enseignant, Matiere, ClasseMatiere, EmploiDuTemps


class EnseignantSerializer(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    user_id = serializers.SerializerMethodField()
    signature_url = serializers.SerializerMethodField(read_only=True)

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
        fields = ['id', 'nom', 'prenom', 'is_active', 'username', 'email', 'user_id', 'signature', 'signature_url']
        read_only_fields = ['id', 'username', 'email', 'user_id', 'signature_url']


class MatiereSerializer(serializers.ModelSerializer):
    class Meta:
        model = Matiere
        fields = '__all__'
        read_only_fields = ['id']


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
            'jour', 'heure_debut', 'heure_fin', 'salle',
        ]
