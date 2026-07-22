from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Enseignant, Matiere, ClasseMatiere, EmploiDuTemps
from .serializers import EnseignantSerializer, MatiereSerializer, ClasseMatiereSerializer, EmploiDuTempsSerializer
from accounts.permissions import IsAdmin


class EnseignantViewSet(viewsets.ModelViewSet):
    serializer_class = EnseignantSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['nom']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'ADMIN':
            return Enseignant.objects.all()
        if user.role == 'ENSEIGNANT' and user.enseignant:
            return Enseignant.objects.filter(id=user.enseignant.id)
        return Enseignant.objects.all()

    @action(detail=True, methods=['get'])
    def matieres(self, request, pk=None):
        enseignant = self.get_object()
        classe_matieres = ClasseMatiere.objects.filter(enseignant=enseignant)
        serializer = ClasseMatiereSerializer(classe_matieres, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['patch'], permission_classes=[IsAuthenticated],
            url_path='ma-signature')
    def ma_signature(self, request):
        if not request.user.enseignant:
            return Response({'detail': 'Aucun profil enseignant lié à ce compte.'}, status=400)
        if 'signature' not in request.FILES:
            return Response({'detail': 'Fichier signature requis.'}, status=400)
        enseignant = request.user.enseignant
        enseignant.signature = request.FILES['signature']
        enseignant.save()
        serializer = self.get_serializer(enseignant, context={'request': request})
        return Response(serializer.data)


class MatiereViewSet(viewsets.ModelViewSet):
    queryset = Matiere.objects.all()
    serializer_class = MatiereSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['nom']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]


class ClasseMatiereViewSet(viewsets.ModelViewSet):
    serializer_class = ClasseMatiereSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['matiere__nom', 'classe__nom', 'enseignant__nom']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = ClasseMatiere.objects.select_related('classe__niveau', 'matiere', 'enseignant')
        classe_id = self.request.query_params.get('classe_id')
        niveau_id = self.request.query_params.get('niveau_id')
        if classe_id:
            qs = qs.filter(classe_id=classe_id)
        elif niveau_id:
            qs = qs.filter(classe__niveau_id=niveau_id)
        if user.role == 'ENSEIGNANT' and user.enseignant:
            return qs.filter(enseignant=user.enseignant)
        return qs


class EmploiDuTempsViewSet(viewsets.ModelViewSet):
    serializer_class = EmploiDuTempsSerializer

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        qs = EmploiDuTemps.objects.select_related(
            'classe_matiere__classe', 'classe_matiere__matiere', 'classe_matiere__enseignant'
        )
        classe_id = self.request.query_params.get('classe_id')
        enseignant_id = self.request.query_params.get('enseignant_id')
        if classe_id:
            qs = qs.filter(classe_matiere__classe_id=classe_id)
        if enseignant_id:
            qs = qs.filter(classe_matiere__enseignant_id=enseignant_id)
        if user.role == 'ENSEIGNANT' and user.enseignant:
            qs = qs.filter(classe_matiere__enseignant=user.enseignant)
        return qs
