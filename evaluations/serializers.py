from rest_framework import serializers
from .models import (Evaluation, Note, CalendrierComposition, ProgrammeComposition,
                      CalendrierExamenBlanc, ProgrammeExamenBlanc, Deliberation)


class EvaluationSerializer(serializers.ModelSerializer):
    trimestre_nom = serializers.CharField(source='trimestre.nom', read_only=True)
    matiere_nom = serializers.CharField(source='classe_matiere.matiere.nom', read_only=True)
    classe_nom = serializers.CharField(source='classe_matiere.classe.nom', read_only=True)
    niveau_nom = serializers.CharField(source='classe_matiere.classe.niveau.nom', read_only=True)

    class Meta:
        model = Evaluation
        fields = '__all__'
        read_only_fields = ['id']

    def validate(self, attrs):
        eval_type = attrs.get('type', getattr(self.instance, 'type', None))
        classe_matiere = attrs.get('classe_matiere', getattr(self.instance, 'classe_matiere', None))
        if eval_type == 'EXAMEN_BLANC' and classe_matiere and not classe_matiere.classe.niveau.is_classe_examen:
            raise serializers.ValidationError({
                'type': "L'Examen Blanc n'est disponible que pour les classes d'examen (3ème, Terminale)."
            })
        return attrs


class NoteSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source='eleve.nom', read_only=True)
    eleve_prenom = serializers.CharField(source='eleve.prenom', read_only=True)
    eleve_matricule = serializers.CharField(source='eleve.matricule', read_only=True)
    matiere = serializers.CharField(source='evaluation.classe_matiere.matiere.nom', read_only=True)
    type_evaluation = serializers.CharField(source='evaluation.type', read_only=True)
    coefficient = serializers.FloatField(source='evaluation.coefficient', read_only=True)

    class Meta:
        model = Note
        fields = '__all__'
        read_only_fields = ['id']


class BulletinNoteSerializer(serializers.ModelSerializer):
    matiere = serializers.CharField(source='evaluation.classe_matiere.matiere.nom', read_only=True)
    coefficient = serializers.FloatField(source='evaluation.coefficient', read_only=True)
    type_evaluation = serializers.CharField(source='evaluation.type', read_only=True)

    class Meta:
        model = Note
        fields = ['id', 'valeur', 'matiere', 'coefficient', 'type_evaluation']


class ProgrammeCompositionSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='matiere.nom', read_only=True)

    class Meta:
        model = ProgrammeComposition
        fields = ['id', 'calendrier', 'matiere', 'matiere_nom', 'contenu']


class CalendrierCompositionSerializer(serializers.ModelSerializer):
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    trimestre_nom = serializers.CharField(source='trimestre.nom', read_only=True)
    annee_libelle = serializers.CharField(source='trimestre.annee_scolaire.libelle', read_only=True)
    programmes = ProgrammeCompositionSerializer(many=True, read_only=True)

    class Meta:
        model = CalendrierComposition
        fields = ['id', 'niveau', 'niveau_nom', 'trimestre', 'trimestre_nom',
                  'annee_libelle', 'date_debut', 'date_fin', 'programmes']


class ProgrammeExamenBlancSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source='matiere.nom', read_only=True)

    class Meta:
        model = ProgrammeExamenBlanc
        fields = ['id', 'calendrier', 'matiere', 'matiere_nom', 'contenu']


class CalendrierExamenBlancSerializer(serializers.ModelSerializer):
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    trimestre_nom = serializers.CharField(source='trimestre.nom', read_only=True)
    annee_libelle = serializers.CharField(source='trimestre.annee_scolaire.libelle', read_only=True)
    programmes = ProgrammeExamenBlancSerializer(many=True, read_only=True)

    class Meta:
        model = CalendrierExamenBlanc
        fields = ['id', 'niveau', 'niveau_nom', 'trimestre', 'trimestre_nom',
                  'annee_libelle', 'date_debut', 'date_fin', 'programmes']

    def validate_niveau(self, value):
        if not value.is_classe_examen:
            raise serializers.ValidationError(
                "Le calendrier d'Examen Blanc n'est disponible que pour les niveaux d'examen (3ème, Terminale)."
            )
        return value


class DeliberationSerializer(serializers.ModelSerializer):
    niveau_nom = serializers.CharField(source='niveau.nom', read_only=True)
    trimestre_nom = serializers.CharField(source='trimestre.nom', read_only=True)
    decide_par_nom = serializers.CharField(source='decide_par.username', read_only=True)

    class Meta:
        model = Deliberation
        fields = ['id', 'niveau', 'niveau_nom', 'trimestre', 'trimestre_nom',
                  'date_deliberation', 'decide_par', 'decide_par_nom']
        read_only_fields = ['id', 'date_deliberation', 'decide_par']

    def validate_niveau(self, value):
        if not value.is_classe_examen:
            raise serializers.ValidationError(
                "La délibération d'Examen Blanc n'est disponible que pour les niveaux d'examen (3ème, Terminale)."
            )
        return value
