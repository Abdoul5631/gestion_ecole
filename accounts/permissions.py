from rest_framework.permissions import BasePermission, SAFE_METHODS

from config.tenancy import ecole_of, is_plateforme


class IsAdmin(BasePermission):
    """Seul l'admin peut accéder"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'ADMIN'
        )


class IsEnseignant(BasePermission):
    """Seul l'enseignant peut accéder"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'ENSEIGNANT'
        )


class IsAdminOrEnseignant(BasePermission):
    """Admin ou Enseignant peuvent accéder"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ['ADMIN', 'ENSEIGNANT']
        )


class IsAdminOrReadOnly(BasePermission):
    """Admin peut tout faire, les autres peuvent seulement lire"""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.role == 'ADMIN':
            return True
        return request.method in SAFE_METHODS


class IsOwnerEleve(BasePermission):
    """L'élève/parent ne peut voir que ses propres données"""
    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == 'ADMIN':
            return True
        if user.role == 'ENSEIGNANT':
            return True
        if user.role in ['ELEVE', 'PARENT']:
            if hasattr(obj, 'eleve'):
                return user.eleve and obj.eleve.id == user.eleve.id
            if hasattr(obj, 'id') and hasattr(user, 'eleve'):
                return user.eleve and obj.id == user.eleve.id
        return False


class IsPlateforme(BasePermission):
    """Réservé au super admin de la plateforme (pas l'admin d'une école)."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and is_plateforme(request.user))


class EcoleAccesPermission(BasePermission):
    """Pédagogie / caisse uniquement si l'école est VALIDEE. Plateforme : /ecoles et auth."""

    message = "Votre école est en attente de validation."

    def has_permission(self, request, view):
        user = request.user
        if not user or not getattr(user, 'is_authenticated', False):
            return True

        path = request.path or ''
        auth_ok = (
            path.startswith('/api/auth/me')
            or path.startswith('/api/auth/refresh')
            or path.startswith('/api/auth/login')
            or path.startswith('/api/auth/change-password')
            or path.startswith('/api/annonces-actives')
            or path.startswith('/api/auth/mon-compte')
            or path.startswith('/api/erreur-client')
        )
        ecoles_ok = path.startswith('/api/ecoles') or path.startswith('/api/notifications') or path.startswith('/api/maintenance')
        sauvegarde_ok = path.startswith('/api/sauvegarde')
        # vue ouverte à la plateforme (journal d'activité de toutes les écoles)
        journal_ok = getattr(view, 'acces_plateforme', False)

        if is_plateforme(user):
            return auth_ok or ecoles_ok or sauvegarde_ok or journal_ok

        ecole = ecole_of(user)
        if ecole and ecole.statut == 'VALIDEE':
            return True

        if ecole and ecole.statut == 'REFUSEE':
            self.message = "Votre demande d'école a été refusée."
            if ecole.motif:
                self.message += f" Motif : {ecole.motif}"
        elif ecole and ecole.statut == 'SUSPENDUE':
            self.message = "Votre école est suspendue."
            if ecole.motif:
                self.message += f" Motif : {ecole.motif}"
        else:
            self.message = "Votre école est en attente de validation."

        return auth_ok


# ─── Droits d'accès : refusé par défaut, déclaré dans config/droits.py ─────────────────────────────

class RolesAutorises(BasePermission):
    """Autorise uniquement les comptes dont le rôle figure dans `roles` (SUPER_ADMIN seulement s'il est listé)."""

    def __init__(self, roles=()):
        self.roles = tuple(roles)

    def has_permission(self, request, view):
        from .roles import roles_de
        user = request.user
        return bool(user and user.is_authenticated and any(r in self.roles for r in roles_de(user)))


class RefuserTout(BasePermission):
    """Action non déclarée dans la politique de droits : accès interdit."""
    message = "Accès non autorisé."

    def has_permission(self, request, view):
        return False


def roles_autorises(*roles):
    """Fabrique une classe de permission utilisable dans @permission_classes([...])."""
    class _Roles(RolesAutorises):
        def __init__(self):
            super().__init__(roles)
    _Roles.__name__ = 'Roles_' + '_'.join(r.lower() for r in roles)
    return _Roles


def _objets_lies(valeur):
    """Instances de modèles contenues dans une valeur validée (instance ou liste d'instances)."""
    from django.db.models import Model
    if isinstance(valeur, Model):
        yield valeur
    elif isinstance(valeur, (list, tuple, set)):
        for v in valeur:
            if isinstance(v, Model):
                yield v


class DroitsParAction:
    """Mixin de ViewSet : droits déclarés par action dans config/droits.py, **refusé si non déclaré**.

    - utilisateur connecté + école validée (EcoleAccesPermission) toujours exigés ;
    - le rôle doit figurer dans la liste déclarée pour l'action ;
    - une action absente de la table est interdite ;
    - à l'écriture, tout objet lié (FK, M2M) doit appartenir à l'école de l'utilisateur.
    """

    def get_permissions(self):
        from rest_framework.settings import api_settings
        from config.droits import droits_de
        base = [p() for p in api_settings.DEFAULT_PERMISSION_CLASSES]
        action = getattr(self, 'action', None)
        if action in (None, 'metadata'):  # OPTIONS
            return base
        roles = droits_de(type(self).__name__).get(action)
        if roles is None:
            return base + [RefuserTout()]
        return base + [RolesAutorises(roles)]

    def get_serializer(self, *args, **kwargs):
        serializer = super().get_serializer(*args, **kwargs)
        if kwargs.get('data') is not None and not getattr(serializer, '_tenant_controle', False):
            serializer._tenant_controle = True
            valide = serializer.is_valid

            def is_valid(*a, **kw):
                ok = valide(*a, **kw)
                if ok:
                    self._verifier_ecole_objets_lies(serializer)
                return ok
            serializer.is_valid = is_valid
        return serializer

    def _verifier_ecole_objets_lies(self, serializer):
        """Refuse tout objet lié qui appartient à une autre école (injection d'identifiant)."""
        from rest_framework.exceptions import ValidationError
        user = self.request.user
        if is_plateforme(user):
            return
        mon_ecole = getattr(user, 'ecole_id', None)
        for champ, valeur in (serializer.validated_data or {}).items():
            for obj in _objets_lies(valeur):
                ecole_obj = getattr(obj, 'ecole_id', None)
                if ecole_obj is not None and ecole_obj != mon_ecole:
                    raise ValidationError({champ: ['Objet introuvable.']})
