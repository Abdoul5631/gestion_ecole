from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Evaluation, Note
from .serializers import (
    EvaluationSerializer, NoteSerializer, BulletinNoteSerializer
)


class EvaluationViewSet(viewsets.ModelViewSet):
    queryset = Evaluation.objects.all()
    serializer_class = EvaluationSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['libelle', 'classe_matiere__matiere__nom']
    ordering_fields = ['date', 'type']

    @action(detail=True, methods=['get'])
    def notes(self, request, pk=None):
        """Retourne toutes les notes d'une évaluation"""
        evaluation = self.get_object()
        notes = Note.objects.filter(evaluation=evaluation)
        serializer = NoteSerializer(notes, many=True)
        return Response(serializer.data)


class NoteViewSet(viewsets.ModelViewSet):
    queryset = Note.objects.all()
    serializer_class = NoteSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']
    ordering_fields = ['valeur', 'saisie_le']

    @action(detail=False, methods=['get'])
    def bulletin(self, request):
        """Retourne le bulletin d'un élève pour un trimestre"""
        eleve_id = request.query_params.get('eleve_id')
        trimestre_id = request.query_params.get('trimestre_id')

        if not eleve_id or not trimestre_id:
            return Response(
                {'detail': 'eleve_id et trimestre_id sont requis.'},
                status=400
            )

        notes = Note.objects.filter(
            eleve_id=eleve_id,
            evaluation__trimestre_id=trimestre_id
        ).select_related(
            'evaluation__classe_matiere__matiere',
            'evaluation__trimestre'
        )

        serializer = BulletinNoteSerializer(notes, many=True)

        # Calcul de la moyenne générale
        total_points = 0
        total_coef = 0
        for note in notes:
            coef = float(note.evaluation.classe_matiere.matiere.coefficient)
            valeur = float(note.valeur)
            note_sur = float(note.evaluation.note_sur)
            total_points += (valeur / note_sur * 20) * coef
            total_coef += coef

        moyenne = round(total_points / total_coef, 2) if total_coef > 0 else 0

        return Response({
            'eleve_id': eleve_id,
            'trimestre_id': trimestre_id,
            'moyenne_generale': moyenne,
            'notes': serializer.data
        })