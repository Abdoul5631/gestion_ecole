from django.contrib import admin
from config.tenancy import is_plateforme
from .models import Parametres


@admin.register(Parametres)
class ParametresAdmin(admin.ModelAdmin):
    list_display = ['id', 'nom_ecole', 'ville', 'statut', 'telephone', 'email', 'directeur']
    list_filter = ['statut', 'ville']
    search_fields = ['nom_ecole', 'ville', 'email']
    readonly_fields = ['date_demande', 'date_statut']

    def has_delete_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if is_plateforme(request.user):
            return qs
        if getattr(request.user, 'ecole_id', None):
            return qs.filter(pk=request.user.ecole_id)
        return qs.none()
