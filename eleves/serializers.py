from rest_framework import serializers
from .models import Eleve, Presence


class EleveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Eleve
        fields = '__all__'


class EleveListSerializer(serializers.ModelSerializer):
    """Serializer allégé pour les listes"""
    class Meta:
        model = Eleve
        fields = ['id', 'matricule', 'nom', 'prenom', 'sexe', 'est_actif']


class PresenceSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)

    class Meta:
        model = Presence
        fields = '__all__'