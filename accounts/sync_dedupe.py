"""Déduplication des mutations offline via client_id."""
from rest_framework.response import Response

from .models import ClientSyncReceipt


def extract_client_id(request):
    data = getattr(request, 'data', None) or {}
    cid = None
    if hasattr(data, 'get'):
        cid = data.get('client_id')
    if not cid:
        cid = request.headers.get('X-Client-Id') or request.META.get('HTTP_X_CLIENT_ID')
    if cid:
        return str(cid)[:64]
    return None


def replay_if_seen(request):
    """Retourne une Response si ce client_id a déjà été traité, sinon None."""
    cid = extract_client_id(request)
    if not cid:
        return None
    receipt = ClientSyncReceipt.objects.filter(client_id=cid).first()
    if not receipt:
        return None
    return Response(receipt.response_json, status=receipt.status_code)


def store_receipt(request, response):
    """Mémorise la réponse pour un client_id (succès uniquement)."""
    cid = extract_client_id(request)
    if not cid:
        return
    if response.status_code < 200 or response.status_code >= 300:
        return
    try:
        body = response.data if hasattr(response, 'data') else {}
        if not isinstance(body, (dict, list)):
            body = {'detail': str(body)}
        ClientSyncReceipt.objects.get_or_create(
            client_id=cid,
            defaults={
                'user': request.user if getattr(request.user, 'is_authenticated', False) else None,
                'path': (request.path or '')[:255],
                'status_code': response.status_code,
                'response_json': body if isinstance(body, dict) else {'results': body},
            },
        )
    except Exception:
        pass
