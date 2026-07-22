from rest_framework import serializers
from .models import Eleve, Presence


class EleveSerializer(serializers.ModelSerializer):
    niveau_actuel = serializers.SerializerMethodField(read_only=True)
    classe_actuelle = serializers.SerializerMethodField(read_only=True)
    username = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Eleve
        fields = [
            'id', 'matricule', 'nom', 'prenom',
            'date_naissance', 'lieu_naissance', 'sexe',
            'nom_parent', 'prenom_parent', 'telephone_parent',
            'is_active', 'niveau_actuel', 'classe_actuelle', 'username'
        ]
        read_only_fields = ['id', 'niveau_actuel', 'classe_actuelle', 'username']

    def get_niveau_actuel(self, obj):
        ins = obj.inscriptions.select_related('classe__niveau').first()
        if ins and ins.classe:
            return ins.classe.niveau.nom
        return None

    def get_classe_actuelle(self, obj):
        ins = obj.inscriptions.select_related('classe__niveau').first()
        if ins and ins.classe:
            return ins.classe.nom
        return None

    def get_username(self, obj):
        try:
            compte = obj.comptes.filter(role='ELEVE').first()
            return compte.username if compte else None
        except Exception:
            return None


class PresenceSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    matiere_nom = serializers.CharField(source='classe_matiere.matiere.nom', read_only=True)
    niveau_nom = serializers.CharField(source='classe_matiere.niveau.nom', read_only=True)

    class Meta:
        model = Presence
        fields = '__all__'
        read_only_fields = ['id']
