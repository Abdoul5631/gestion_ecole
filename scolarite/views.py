from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from .models import AnneeScolaire, Niveau, Classe, Trimestre, Inscription
from .serializers import (
    AnneeScolaireSerializer, NiveauSerializer, ClasseSerializer,
    TrimestreSerializer, InscriptionSerializer
)
from accounts.permissions import IsAdmin


class AnneeScolaireViewSet(viewsets.ModelViewSet):
    queryset = AnneeScolaire.objects.all()
    serializer_class = AnneeScolaireSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]


class NiveauViewSet(viewsets.ModelViewSet):
    queryset = Niveau.objects.all()
    serializer_class = NiveauSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]


class ClasseViewSet(viewsets.ModelViewSet):
    serializer_class = ClasseSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['nom', 'niveau__nom']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Classe.objects.select_related('niveau', 'professeur_principal')
        niveau_id = self.request.query_params.get('niveau_id')
        if niveau_id:
            qs = qs.filter(niveau_id=niveau_id)
        return qs


class TrimestreViewSet(viewsets.ModelViewSet):
    queryset = Trimestre.objects.all()
    serializer_class = TrimestreSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = Trimestre.objects.all()
        annee_id = self.request.query_params.get('annee_id')
        if annee_id:
            qs = qs.filter(annee_scolaire_id=annee_id)
        return qs


class InscriptionViewSet(viewsets.ModelViewSet):
    serializer_class = InscriptionSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['eleve__nom', 'eleve__prenom', 'eleve__matricule']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = Inscription.objects.select_related('eleve', 'classe__niveau')

        classe_id = self.request.query_params.get('classe_id')
        niveau_id = self.request.query_params.get('niveau_id')
        if classe_id:
            qs = qs.filter(classe_id=classe_id)
        elif niveau_id:
            qs = qs.filter(classe__niveau_id=niveau_id)

        if user.role == 'ADMIN' or user.role == 'ENSEIGNANT':
            return qs
        if user.role in ['ELEVE', 'PARENT'] and user.eleve:
            return qs.filter(eleve=user.eleve)
        return Inscription.objects.none()
