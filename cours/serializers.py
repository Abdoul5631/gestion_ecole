from rest_framework import serializers
from .models import Enseignant, Matiere, ClasseMatiere


class EnseignantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Enseignant
        fields = '__all__'


class EnseignantListSerializer(serializers.ModelSerializer):
    """Serializer allégé pour les listes"""
    class Meta:
        model = Enseignant
        fields = ['id', 'nom', 'prenom', 'email', 'est_actif']


class MatiereSerializer(serializers.ModelSerializer):
    class Meta:
        model = Matiere
        fields = '__all__'


class ClasseMatiereSerializer(serializers.ModelSerializer):
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    matiere_nom = serializers.CharField(source='matiere.nom', read_only=True)
    matiere_code = serializers.CharField(source='matiere.code', read_only=True)
    enseignant_nom = serializers.CharField(source='enseignant.nom', read_only=True)
    enseignant_prenom = serializers.CharField(source='enseignant.prenom', read_only=True)
    annee_libelle = serializers.CharField(source='annee.libelle', read_only=True)

    class Meta:
        model = ClasseMatiere
        fields = '__all__'