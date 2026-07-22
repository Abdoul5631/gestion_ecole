from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from .models import User
from .serializers import CustomTokenObtainPairSerializer, UserSerializer


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        if self.action in ['list', 'retrieve', 'update', 'partial_update', 'destroy']:
            from accounts.permissions import IsAdmin
            return [IsAdmin()]
        return [IsAuthenticated()]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    data = UserSerializer(user).data

    # Construire la liste des enfants pour un PARENT
    enfants_m2m = list(user.enfants.all())
    # Rétrocompatibilité : si le M2M est vide mais que l'ancien FK eleve est défini
    if user.role == 'PARENT' and not enfants_m2m and user.eleve:
        enfants_m2m = [user.eleve]

    data['enfants_list'] = [
        {'id': e.id, 'nom': e.nom, 'prenom': e.prenom, 'matricule': e.matricule}
        for e in enfants_m2m
    ]
    return Response(data)