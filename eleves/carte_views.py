"""Cartes scolaires : modèles, aperçus et choix du modèle (réservé au secrétariat)."""
from types import SimpleNamespace
from datetime import date

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import EcoleAccesPermission, roles_autorises
from config.tenancy import ecole_of, scoped
from scolarite.utils import get_annee_active
from . import carte
from .models import Eleve


@api_view(['GET'])
@permission_classes([IsAuthenticated, EcoleAccesPermission, roles_autorises('SECRETAIRE')])
def modeles_cartes(request):
    modele, couleur = carte.reglages_carte(ecole_of(request.user))
    return Response({
        'modele': modele, 'couleur': couleur,
        'modeles': [{'code': m.code, 'nom': m.nom, 'description': m.description} for m in carte.MODELES.values()],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated, EcoleAccesPermission, roles_autorises('SECRETAIRE')])
def apercu_carte(request):
    """PNG d'un modèle avec l'élève demandé (?eleve_id=) ou un élève d'exemple, aux couleurs de l'école."""
    ecole = ecole_of(request.user)
    modele = request.query_params.get('modele')
    couleur = request.query_params.get('couleur')
    eleve = None
    eid = request.query_params.get('eleve_id')
    if eid and eid.isdigit():
        eleve = scoped(Eleve.objects.all(), request.user).filter(pk=int(eid)).first()
    classe = SimpleNamespace(nom='Tle D')
    if eleve is None:
        eleve = SimpleNamespace(nom='Ouédraogo', prenom='Aminata', matricule='E000123', photo=None,
                                date_naissance=date(2007, 3, 14), lieu_naissance='Ouagadougou')
    try:
        echelle = min(5, max(1, int(request.query_params.get('echelle', 3))))
    except ValueError:
        echelle = 3
    annee = get_annee_active(ecole)
    png = carte.apercu_png(eleve, classe, ecole, annee.libelle if annee else '2026-2027', modele, couleur, echelle)
    rep = HttpResponse(png, content_type='image/png')
    rep['Cache-Control'] = 'no-store'
    return rep


@api_view(['PUT'])
@permission_classes([IsAuthenticated, EcoleAccesPermission, roles_autorises('SECRETAIRE')])
def choisir_modele_carte(request):
    """Enregistre le modèle et la couleur des cartes de l'école (rien d'autre dans les paramètres)."""
    from parametres.serializers import ParametresSerializer
    ecole = ecole_of(request.user)
    donnees = {k: request.data[k] for k in ('modele_carte', 'couleur_carte') if k in request.data}
    serializer = ParametresSerializer(ecole, data=donnees, partial=True, context={'request': request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    modele, couleur = carte.reglages_carte(ecole)
    return Response({'modele': modele, 'couleur': couleur})
