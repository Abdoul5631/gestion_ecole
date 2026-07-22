from rest_framework.permissions import BasePermission, SAFE_METHODS


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