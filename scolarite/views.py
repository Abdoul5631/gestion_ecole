from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import AnneeScolaire, Niveau, Trimestre, Inscription
from .serializers import (
    AnneeScolaireSerializer, NiveauSerializer,
    TrimestreSerializer, InscriptionSerializer
)


class AnneeScolaireViewSet(viewsets.ModelViewSet):
    queryset = AnneeScolaire.objects.all()
    serializer_class = AnneeScolaireSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['libelle', 'date_debut']

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Retourne l'année scolaire active"""
        annee = AnneeScolaire.objects.filter(est_active=True).first()
        if annee:
            serializer = self.get_serializer(annee)
            return Response(serializer.data)
        return Response({'detail': 'Aucune année active trouvée.'}, status=404)


class NiveauViewSet(viewsets.ModelViewSet):
    queryset = Niveau.objects.all()
    serializer_class = NiveauSerializer
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ['ordre', 'nom']


class TrimestreViewSet(viewsets.ModelViewSet):
    queryset = Trimestre.objects.all()
    serializer_class = TrimestreSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['nom', 'annee__libelle']
    ordering_fields = ['annee', 'nom']


class InscriptionViewSet(viewsets.ModelViewSet):
    queryset = Inscription.objects.all()
    serializer_class = InscriptionSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']
    ordering_fields = ['date_inscription', 'statut']

    @action(detail=False, methods=['get'])
    def par_niveau(self, request):
        """Retourne le nombre d'élèves par niveau"""
        from django.db.models import Count
        data = (
            Inscription.objects
            .values('niveau__nom')
            .annotate(total=Count('id'))
            .order_by('niveau__ordre')
        )
        return Response(list(data))