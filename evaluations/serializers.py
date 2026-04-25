from rest_framework import serializers
from .models import Evaluation, Note


class EvaluationSerializer(serializers.ModelSerializer):
    trimestre_nom = serializers.CharField(source='trimestre.nom', read_only=True)
    matiere_nom = serializers.CharField(
        source='classe_matiere.matiere.nom', read_only=True
    )
    niveau_nom = serializers.CharField(
        source='classe_matiere.niveau.nom', read_only=True
    )

    class Meta:
        model = Evaluation
        fields = '__all__'


class NoteSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='eleve.matricule', read_only=True)
    evaluation_type = serializers.CharField(source='evaluation.type', read_only=True)
    evaluation_note_sur = serializers.DecimalField(
        source='evaluation.note_sur',
        max_digits=5, decimal_places=2,
        read_only=True
    )

    class Meta:
        model = Note
        fields = '__all__'


class BulletinNoteSerializer(serializers.ModelSerializer):
    """Serializer spécial pour le bulletin de notes"""
    matiere = serializers.CharField(
        source='evaluation.classe_matiere.matiere.nom', read_only=True
    )
    matiere_code = serializers.CharField(
        source='evaluation.classe_matiere.matiere.code', read_only=True
    )
    coefficient = serializers.DecimalField(
        source='evaluation.classe_matiere.matiere.coefficient',
        max_digits=4, decimal_places=2,
        read_only=True
    )
    trimestre = serializers.CharField(
        source='evaluation.trimestre.nom', read_only=True
    )
    type_evaluation = serializers.CharField(
        source='evaluation.type', read_only=True
    )
    note_sur = serializers.DecimalField(
        source='evaluation.note_sur',
        max_digits=5, decimal_places=2,
        read_only=True
    )

    class Meta:
        model = Note
        fields = [
            'id', 'valeur', 'est_absent', 'observation',
            'matiere', 'matiere_code', 'coefficient',
            'trimestre', 'type_evaluation', 'note_sur'
        ]
