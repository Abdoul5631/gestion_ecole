"""Page d'accueil de la plateforme (connexion) : textes, couleur et photos réglés par le super admin.
GET /api/accueil/ est public ; la modification passe par /api/plateforme/accueil/…"""
import io
import re

from django.core.files.base import ContentFile
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsPlateforme
from .models import AccueilPlateforme, PhotoAccueil

# photos livrées avec l'application, utilisées tant que le super admin n'en a pas ajouté
PHOTOS_PAR_DEFAUT = [
    {'url': '/images/accueil-classe.webp', 'credit': 'Doug Linstedt — Unsplash', 'position': '8% 40%'},
    {'url': '/images/accueil-ecriture.webp', 'credit': 'Annie Spratt — Unsplash', 'position': '40% 50%'},
    {'url': '/images/accueil-classe-verte.webp', 'credit': 'Annie Spratt — Unsplash', 'position': '45% 50%'},
    {'url': '/images/accueil-sourires.webp', 'credit': 'TopSphere Media — Unsplash', 'position': '30% 40%'},
]
TAILLE_MAX = 6 * 1024 * 1024


def _photo_json(p, request):
    return {'id': p.id, 'url': request.build_absolute_uri(p.image.url) if p.image else '', 'credit': p.credit,
            'position': p.position, 'ordre': p.ordre, 'active': p.active}


def _accueil_json(request, admin=False):
    a = AccueilPlateforme.get()
    photos = [_photo_json(p, request) for p in a.photos.filter(**({} if admin else {'active': True})).order_by('ordre', 'id')]
    data = {'titre': a.titre, 'sous_titre': a.sous_titre, 'badge': a.badge, 'couleur': a.couleur,
            'photos': photos if (photos or admin) else PHOTOS_PAR_DEFAUT, 'photos_par_defaut': not photos}
    if not admin:
        try:  # quelques chiffres, pour la confiance
            from parametres.models import Parametres
            from scolarite.models import Inscription
            data['chiffres'] = {
                'ecoles': Parametres.objects.filter(statut='VALIDEE').count(),
                'eleves': Inscription.objects.filter(annee_scolaire__is_active=True, is_active=True, statut='INSCRIT',
                                                     ecole__statut='VALIDEE').count(),
            }
        except Exception:
            data['chiffres'] = None
    return data


def _optimiser(fichier):
    """Photo envoyée → WebP de 1920 px au plus : légère à charger, même avec une petite connexion."""
    from PIL import Image, ImageOps
    im = Image.open(fichier)
    im = ImageOps.exif_transpose(im).convert('RGB')
    im.thumbnail((1920, 1920))
    sortie = io.BytesIO()
    im.save(sortie, 'WEBP', quality=74, method=6)
    return ContentFile(sortie.getvalue())


class AccueilPublicView(APIView):
    """GET /api/accueil/ — sans connexion : ce qu'affiche la page de connexion."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(_accueil_json(request))


class AccueilPlateformeView(APIView):
    """GET / PUT /api/plateforme/accueil/ — le super admin règle les textes et la couleur."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request):
        return Response(_accueil_json(request, admin=True))

    def put(self, request):
        from accounts.journal import noter
        a = AccueilPlateforme.get()
        d = request.data
        for champ, maxi in (('titre', 120), ('sous_titre', 300), ('badge', 80)):
            if champ in d:
                v = str(d.get(champ) or '').strip()
                if champ == 'titre' and not v:
                    return Response({'titre': ['Le titre ne peut pas être vide.']}, status=400)
                setattr(a, champ, v[:maxi])
        if 'couleur' in d:
            c = str(d.get('couleur') or '').strip()
            if not re.fullmatch(r'#[0-9a-fA-F]{6}', c):
                return Response({'couleur': ['Couleur attendue au format #RRGGBB.']}, status=400)
            a.couleur = c
        a.save()
        noter('MODIFICATION', "Page d'accueil", 'Textes ou couleur modifiés')
        return Response(_accueil_json(request, admin=True))


class PhotosAccueilView(APIView):
    """POST /api/plateforme/accueil/photos/ (fichier « image », « credit ») — ajoute une photo au défilement."""
    permission_classes = [IsAuthenticated, IsPlateforme]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        from accounts.journal import noter
        f = request.FILES.get('image')
        if not f:
            return Response({'image': ['Choisissez une photo.']}, status=400)
        if f.size > TAILLE_MAX:
            return Response({'image': ['Photo trop lourde (6 Mo au plus).']}, status=400)
        try:
            contenu = _optimiser(f)
        except Exception:
            return Response({'image': ["Ce fichier n'est pas une photo lisible (JPEG, PNG ou WebP)."]}, status=400)
        a = AccueilPlateforme.get()
        if a.photos.count() >= 8:
            return Response({'image': ['8 photos au plus : retirez-en une avant d’en ajouter.']}, status=400)
        p = PhotoAccueil(accueil=a, credit=str(request.data.get('credit') or '')[:120],
                         ordre=(a.photos.order_by('-ordre').values_list('ordre', flat=True).first() or 0) + 1)
        p.image.save('accueil.webp', contenu, save=True)
        noter('CREATION', "Page d'accueil", 'Photo ajoutée')
        return Response(_photo_json(p, request), status=201)


class PhotoAccueilView(APIView):
    """PATCH / DELETE /api/plateforme/accueil/photos/<pk>/ — crédit, cadrage, ordre, affichage ; ou retrait."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def patch(self, request, pk):
        p = get_object_or_404(PhotoAccueil, pk=pk)
        d = request.data
        if 'credit' in d:
            p.credit = str(d['credit'] or '')[:120]
        if 'position' in d and re.fullmatch(r'\d{1,3}% \d{1,3}%', str(d['position'] or '')):
            p.position = d['position']
        if 'ordre' in d:
            try:
                p.ordre = int(d['ordre'])
            except (TypeError, ValueError):
                pass
        if 'active' in d:
            p.active = bool(d['active'])
        p.save()
        return Response(_photo_json(p, request))

    def delete(self, request, pk):
        from accounts.journal import noter
        p = get_object_or_404(PhotoAccueil, pk=pk)
        p.image.delete(save=False)
        p.delete()
        noter('SUPPRESSION', "Page d'accueil", 'Photo retirée')
        return Response(status=204)
