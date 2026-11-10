"""Suspension (soft-delete) : jamais de DELETE physique depuis l'admin."""
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from config.offline_write import OfflineWriteMixin
from accounts.sync_dedupe import replay_if_seen, store_receipt


def veut_inclure_suspendus(request):
    raw = (request.query_params.get('inclure_suspendus') or '').lower()
    return raw in ('1', 'true', 'oui', 'yes')


def filtrer_actifs(qs, request, action=None, extra_lookups=()):
    """Cache les lignes suspendues, sauf retrieve / destroy / reactiver / ?inclure_suspendus=1."""
    if not hasattr(qs.model, 'is_active'):
        return qs
    if action in ('retrieve', 'update', 'partial_update', 'destroy', 'reactiver'):
        return qs
    if request is not None and veut_inclure_suspendus(request):
        return qs
    filtres = {'is_active': True}
    for lookup in extra_lookups:
        filtres[lookup] = True
    return qs.filter(**filtres)


class SoftDeleteMixin(OfflineWriteMixin):
    """destroy() = is_active=False (HTTP 200). reactiver = is_active=True.
    Inclut OfflineWriteMixin pour dédupliquer les écritures hors ligne.
    """
    structure_actif_lookups = ()

    def filter_queryset(self, queryset):
        qs = super().filter_queryset(queryset)
        return filtrer_actifs(
            qs, self.request, getattr(self, 'action', None),
            extra_lookups=getattr(self, 'structure_actif_lookups', ()),
        )

    def extra_suspend_payload(self, instance):
        """Surcharger pour ajouter un avertissement (ex. élèves encore inscrits)."""
        return {}

    def peut_suspendre(self, instance):
        """Retourne un dict d'erreur ou None."""
        return None

    def destroy(self, request, *args, **kwargs):
        existing = replay_if_seen(request)
        if existing is not None:
            return existing
        instance = self.get_object()
        bloque = self.peut_suspendre(instance)
        if bloque:
            return Response(bloque, status=bloque.pop('status', status.HTTP_409_CONFLICT))
        extra = self.extra_suspend_payload(instance) or {}
        instance.is_active = False
        instance.save(update_fields=['is_active'])
        data = self.get_serializer(instance).data
        data['detail'] = extra.get('detail') or 'Élément suspendu.'
        data['suspendu'] = True
        for key, value in extra.items():
            if key != 'detail':
                data[key] = value
        response = Response(data, status=status.HTTP_200_OK)
        store_receipt(request, response)
        return response

    @action(detail=True, methods=['post'])
    def reactiver(self, request, pk=None):
        existing = replay_if_seen(request)
        if existing is not None:
            return existing
        instance = self.get_object()
        instance.is_active = True
        instance.save(update_fields=['is_active'])
        data = self.get_serializer(instance).data
        data['detail'] = 'Élément réactivé.'
        response = Response(data, status=status.HTTP_200_OK)
        store_receipt(request, response)
        return response

