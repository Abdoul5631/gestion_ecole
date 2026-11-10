"""Configuration du comptable : nom, prénom et signature, imprimés automatiquement sur ses reçus."""
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import EcoleAccesPermission, roles_autorises

TAILLE_MAX = 1_500_000  # 1,5 Mo : une signature photographiée puis recadrée est bien plus légère


def url_signature(user, request=None):
    if not user or not user.signature:
        return None
    return request.build_absolute_uri(user.signature.url) if request else user.signature.url


def _etat(user, request):
    return {
        'first_name': user.first_name, 'last_name': user.last_name,
        'nom_complet': f"{user.first_name} {user.last_name}".strip() or user.username,
        'signature_url': url_signature(user, request),
    }


@api_view(['GET', 'POST', 'DELETE'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([IsAuthenticated, EcoleAccesPermission, roles_autorises('COMPTABLE')])
def ma_signature(request):
    """GET : état actuel. POST (multipart) : prénom, nom et/ou fichier `signature`. DELETE : retire la signature."""
    user = request.user
    if request.method == 'GET':
        return Response(_etat(user, request))

    if request.method == 'DELETE':
        if user.signature:
            user.signature.delete(save=False)
            user.signature = None
            user.save(update_fields=['signature'])
        return Response(_etat(user, request))

    champs = []
    for cle in ('first_name', 'last_name'):
        if cle in request.data:
            valeur = str(request.data.get(cle) or '').strip()[:150]
            setattr(user, cle, valeur)
            champs.append(cle)
    if not (user.first_name and user.last_name):
        return Response({'detail': 'Indiquez votre nom et votre prénom : ils figurent sur les reçus.'}, status=400)

    fichier = request.FILES.get('signature')
    if fichier:
        if fichier.size > TAILLE_MAX:
            return Response({'detail': 'Image trop lourde (1,5 Mo maximum).'}, status=400)
        try:
            from PIL import Image
            img = Image.open(fichier)
            img.verify()
            if img.format not in ('PNG', 'JPEG', 'WEBP'):
                raise ValueError(img.format)
            fichier.seek(0)
        except Exception:
            return Response({'detail': 'Fichier invalide : envoyez une image PNG, JPEG ou WEBP.'}, status=400)
        if user.signature:
            user.signature.delete(save=False)
        user.signature = fichier
        champs.append('signature')
    if champs:
        user.save(update_fields=champs)
    return Response(_etat(user, request))
