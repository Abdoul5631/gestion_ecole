from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'role', 'ecole', 'is_plateforme', 'is_active']
    list_filter = ['role', 'is_active', 'is_plateforme', 'ecole']
    fieldsets = UserAdmin.fieldsets + (
        ('Rôle & Liens', {'fields': ('role', 'enseignant', 'eleve', 'ecole', 'is_plateforme')}),
    )

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        from config.tenancy import is_plateforme
        if is_plateforme(request.user):
            return qs
        if getattr(request.user, 'ecole_id', None):
            return qs.filter(ecole_id=request.user.ecole_id)
        return qs.none()