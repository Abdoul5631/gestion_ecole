from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Enseignant, Matiere, ClasseMatiere
from .serializers import (
    EnseignantSerializer, EnseignantListSerializer,
    MatiereSerializer, ClasseMatiereSerializer
)


class EnseignantViewSet(viewsets.ModelViewSet):
    queryset = Enseignant.objects.all()
    serializer_class = EnseignantSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nom', 'prenom', 'email']
    ordering_fields = ['nom', 'prenom']

    def get_serializer_class(self):
        if self.action == 'list':
            return EnseignantListSerializer
        return EnseignantSerializer

    @action(detail=True, methods=['get'])
    def matieres(self, request, pk=None):
        """Retourne toutes les matières d'un enseignant"""
        enseignant = self.get_object()
        classe_matieres = ClasseMatiere.objects.filter(enseignant=enseignant)
        serializer = ClasseMatiereSerializer(classe_matieres, many=True)
        return Response(serializer.data)


class MatiereViewSet(viewsets.ModelViewSet):
    queryset = Matiere.objects.all()
    serializer_class = MatiereSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['code', 'nom']
    ordering_fields = ['nom', 'coefficient']


class ClasseMatiereViewSet(viewsets.ModelViewSet):
    queryset = ClasseMatiere.objects.all()
    serializer_class = ClasseMatiereSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['matiere__nom', 'niveau__nom', 'enseignant__nom']
    ordering_fields = ['niveau', 'matiere']

    @action(detail=False, methods=['get'])
    def par_annee(self, request):
        """Filtrer les affectations par année"""
        annee_id = request.query_params.get('annee_id')
        if annee_id:
            qs = ClasseMatiere.objects.filter(annee_id=annee_id)
        else:
            qs = ClasseMatiere.objects.all()
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)