from rest_framework import serializers
from .models import AnneeScolaire, Niveau, Trimestre, Inscription


class AnneeScolaireSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnneeScolaire
        fields = '__all__'


class NiveauSerializer(serializers.ModelSerializer):
    class Meta:
        model = Niveau
        fields = '__all__'


class TrimestreSerializer(serializers.ModelSerializer):
    annee_libelle = serializers.CharField(source='annee.libelle', read_only=True)

    class Meta:
        model = Trimestre
        fields = '__all__'


class InscriptionSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='eleve.matricule', read_only=True)
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    annee_libelle = serializers.CharField(source='annee.libelle', read_only=True)

    class Meta:
        model = Inscription
        fields = '__all__'