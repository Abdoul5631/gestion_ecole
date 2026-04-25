from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Eleve, Presence
from .serializers import EleveSerializer, EleveListSerializer, PresenceSerializer


class EleveViewSet(viewsets.ModelViewSet):
    queryset = Eleve.objects.all()
    serializer_class = EleveSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['matricule', 'nom', 'prenom']
    ordering_fields = ['nom', 'prenom', 'matricule']

    def get_serializer_class(self):
        if self.action == 'list':
            return EleveListSerializer
        return EleveSerializer

    @action(detail=True, methods=['get'])
    def presences(self, request, pk=None):
        """Retourne toutes les présences d'un élève"""
        eleve = self.get_object()
        presences = Presence.objects.filter(eleve=eleve)
        serializer = PresenceSerializer(presences, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def inscriptions(self, request, pk=None):
        """Retourne toutes les inscriptions d'un élève"""
        from scolarite.models import Inscription
        from scolarite.serializers import InscriptionSerializer
        eleve = self.get_object()
        inscriptions = Inscription.objects.filter(eleve=eleve)
        serializer = InscriptionSerializer(inscriptions, many=True)
        return Response(serializer.data)


class PresenceViewSet(viewsets.ModelViewSet):
    queryset = Presence.objects.all()
    serializer_class = PresenceSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['eleve__nom', 'eleve__prenom']
    ordering_fields = ['date', 'statut']