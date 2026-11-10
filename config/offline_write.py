"""Mixin DRF : déduplique les écritures offline via client_id / X-Client-Id."""
from accounts.sync_dedupe import replay_if_seen, store_receipt


class OfflineWriteMixin:
    """À combiner avec ModelViewSet / SoftDeleteMixin pour create / update / patch."""

    def create(self, request, *args, **kwargs):
        existing = replay_if_seen(request)
        if existing is not None:
            return existing
        response = super().create(request, *args, **kwargs)
        store_receipt(request, response)
        return response

    def update(self, request, *args, **kwargs):
        existing = replay_if_seen(request)
        if existing is not None:
            return existing
        response = super().update(request, *args, **kwargs)
        store_receipt(request, response)
        return response

    def partial_update(self, request, *args, **kwargs):
        existing = replay_if_seen(request)
        if existing is not None:
            return existing
        response = super().partial_update(request, *args, **kwargs)
        store_receipt(request, response)
        return response
