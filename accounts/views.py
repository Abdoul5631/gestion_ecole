from rest_framework import viewsets, filters, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from config.pagination import StandardPagination
from config.throttles import ChangementMotDePasse
from config.tenancy import scoped, ecole_of, setup_needed
from config.soft_delete import SoftDeleteMixin
from .models import User
from .serializers import CustomTokenObtainPairSerializer, UserSerializer
from accounts.permissions import IsAdmin, DroitsParAction


def est_dernier_admin_ecole(user):
    """True si c'est le dernier administrateur actif de son école."""
    if getattr(user, 'role', None) != 'ADMIN' or getattr(user, 'is_plateforme', False):
        return False
    qs = User.objects.filter(role='ADMIN', is_active=True, is_plateforme=False)
    if user.ecole_id:
        qs = qs.filter(ecole_id=user.ecole_id)
    else:
        qs = qs.filter(ecole__isnull=True)
    return not qs.exclude(pk=user.pk).exists()


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    # Freine les essais répétés de mots de passe (compte visé + adresse IP)
    from config.throttles import ConnexionParIdentifiant, ConnexionParAdresse, lever_trop_de_tentatives
    throttle_classes = [ConnexionParIdentifiant, ConnexionParAdresse]

    def throttled(self, request, wait):
        self.lever_trop_de_tentatives(wait)

    lever_trop_de_tentatives = staticmethod(lever_trop_de_tentatives)


class UserViewSet(DroitsParAction, SoftDeleteMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    pagination_class = StandardPagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['username', 'email', 'role', 'first_name', 'last_name', 'enfants__nom', 'enfants__prenom', 'enfants__matricule']

    def get_queryset(self):
        qs = User.objects.select_related('enseignant', 'eleve', 'ecole').prefetch_related('enfants')
        qs = scoped(qs, self.request.user)
        role = self.request.query_params.get('role')
        exclude_role = self.request.query_params.get('exclude_role')
        if role:
            qs = qs.filter(role=role)
        if exclude_role:
            qs = qs.exclude(role=exclude_role)
        return qs.order_by('username')

    def create(self, request, *args, **kwargs):
        if not request.user or not request.user.is_authenticated or request.user.role != 'ADMIN':
            return Response(
                {'detail': "La création de comptes n'est pas publique. Utilisez « Créer mon école »."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        ecole = ecole_of(self.request.user)
        extra = {}
        if ecole is not None:
            extra['ecole'] = ecole
        serializer.save(**extra)

    def peut_suspendre(self, instance):
        if instance.role == 'PARENT':
            return {'detail': "La suspension d'un compte de parent relève de la plateforme (super admin), pas de l'école.",
                    'status': status.HTTP_403_FORBIDDEN}
        if est_dernier_admin_ecole(instance):
            return {
                'detail': (
                    "Impossible de suspendre le dernier administrateur actif de cette école."
                ),
                'bloque': True,
            }
        return None

    @action(detail=True, methods=['post'])
    def reactiver(self, request, pk=None):
        if self.get_object().role == 'PARENT':
            return Response({'detail': "La réactivation d'un compte de parent relève de la plateforme (super admin)."},
                            status=status.HTTP_403_FORBIDDEN)
        return super().reactiver(request, pk)

    def perform_update(self, serializer):
        instance = serializer.instance
        new_active = serializer.validated_data.get('is_active', instance.is_active)
        if instance.role == 'PARENT' and new_active != instance.is_active:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("La suspension d'un compte de parent relève de la plateforme (super admin).")
        if instance.is_active and new_active is False and est_dernier_admin_ecole(instance):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'detail': "Impossible de suspendre le dernier administrateur actif de cette école."
            })
        serializer.save()


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    data = UserSerializer(user, context={'request': request}).data

    enfants_m2m = list(user.enfants.all())
    if user.role == 'PARENT' and not enfants_m2m and user.eleve:
        enfants_m2m = [user.eleve]

    data['enfants_list'] = [
        {'id': e.id, 'nom': e.nom, 'prenom': e.prenom, 'matricule': e.matricule}
        for e in enfants_m2m
    ]
    from config.tenancy import ecole_session_payload
    data.update(ecole_session_payload(user))
    data['setup_needed'] = setup_needed(user)
    data['must_change_password'] = bool(getattr(user, 'must_change_password', False))
    data['roles'] = list(user.roles)
    return Response(data)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
@throttle_classes([ChangementMotDePasse])
def mon_compte(request):
    """Son propre compte : nom, prénom, e-mail. Changer d'e-mail demande le mot de passe actuel ; la connexion se fait
    ensuite avec le nouvel e-mail et le même mot de passe. Le changement d'e-mail d'un directeur est signalé à la plateforme."""
    from accounts.journal import noter
    from django.core.validators import validate_email
    from django.core.exceptions import ValidationError as ErreurValidation
    user = request.user

    def donnees():
        return {'username': user.username, 'prenom': user.first_name, 'nom': user.last_name, 'email': user.email,
                'role': user.role, 'ecole': user.ecole.nom_ecole if user.ecole_id else None,
                'connexion_par_email': user.username.lower() == (user.email or '').lower() or user.role == 'ADMIN'}

    if request.method == 'GET':
        return Response(donnees())
    d = request.data
    changes = []
    for champ, attr in (('prenom', 'first_name'), ('nom', 'last_name')):
        if champ in d:
            v = str(d.get(champ) or '').strip()[:150]
            if v != getattr(user, attr):
                setattr(user, attr, v)
                changes.append(attr)
    ancien = user.email
    if 'email' in d and str(d.get('email') or '').strip().lower() != (ancien or '').lower():
        nouveau = str(d.get('email') or '').strip().lower()
        try:
            validate_email(nouveau)
        except ErreurValidation:
            return Response({'email': ['Adresse e-mail invalide.']}, status=400)
        if not user.check_password(str(d.get('mot_de_passe') or '')):
            return Response({'mot_de_passe': ['Mot de passe actuel incorrect.']}, status=400)
        if User.objects.filter(email__iexact=nouveau).exclude(pk=user.pk).exists() or \
                User.objects.filter(username__iexact=nouveau).exclude(pk=user.pk).exists():
            return Response({'email': ['Cet e-mail est déjà utilisé par un autre compte.']}, status=400)
        if (user.username or '').lower() == (ancien or '').lower():
            user.username = nouveau  # l'identifiant était l'e-mail : il suit
            changes.append('username')
        user.email = nouveau
        changes.append('email')
    if changes:
        user.save(update_fields=changes)
    if 'email' in changes:
        noter('MODIFICATION', 'Compte', f'E-mail changé : {ancien or "(aucun)"} → {user.email}')
        if user.role == 'ADMIN':
            try:
                from notifications.models import Notification
                ecole = user.ecole.nom_ecole if user.ecole_id else ''
                for sa in User.objects.filter(is_plateforme=True, is_active=True):
                    Notification.objects.create(
                        destinataire=sa, type='INFO', lien='/plateforme/comptes',
                        titre=f"Changement d'e-mail du directeur — {ecole}"[:160],
                        message=f"{user.first_name} {user.last_name} ({ecole}) se connecte désormais avec {user.email} "
                                f"(ancien : {ancien or 'aucun'}).")
            except Exception:
                pass
    return Response(donnees())


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([ChangementMotDePasse])
def change_password(request):
    """Changement de son propre mot de passe (obligatoire à la première connexion)."""
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError as ErreurValidation
    from accounts.journal import noter
    from accounts.passwords import revoquer_sessions
    ancien = request.data.get('old_password') or request.data.get('ancien') or ''
    nouveau = str(request.data.get('new_password') or request.data.get('nouveau') or '')
    user = request.user
    if not user.must_change_password:
        if not ancien or not user.check_password(ancien):
            return Response({'detail': 'Mot de passe actuel incorrect.'}, status=400)
    if user.check_password(nouveau):
        return Response({'detail': 'Choisissez un mot de passe différent de l’actuel.'}, status=400)
    try:
        validate_password(nouveau, user)
    except ErreurValidation as e:
        return Response({'detail': ' '.join(e.messages)}, status=400)
    user.set_password(nouveau)
    user.must_change_password = False
    user.save(update_fields=['password', 'must_change_password'])
    # les autres appareils (et un éventuel curieux) sont déconnectés ; celui-ci reste ouvert
    garder = None
    try:
        from rest_framework_simplejwt.tokens import RefreshToken
        garder = RefreshToken(request.data.get('refresh')).get('jti') if request.data.get('refresh') else None
    except Exception:
        garder = None
    revoquer_sessions(user, garder=garder)
    noter('AUTRE', 'Compte', 'Mot de passe modifié par son titulaire')
    return Response({'detail': 'Mot de passe modifié.', 'must_change_password': False})
