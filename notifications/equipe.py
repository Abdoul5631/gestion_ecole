"""Communication interne de l'école : le directeur écrit à son équipe, et les rôles se préviennent entre eux.

Tout reste dans l'école de l'expéditeur : un message n'atteint jamais le personnel d'une autre école.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from accounts.permissions import EcoleAccesPermission, roles_autorises
from accounts.roles import ROLES_PERSONNEL
from config.tenancy import ecole_of

# Rôles que le directeur peut joindre
ROLES_EQUIPE = ('ENSEIGNANT',) + ROLES_PERSONNEL
LIBELLES = {
    'ENSEIGNANT': 'les enseignants', 'SECRETAIRE': 'les secrétaires',
    'COMPTABLE': 'les comptables', 'SURVEILLANT': 'les surveillants', 'COMMUNICATION': 'les responsables du site',
}


def notifier_roles(ecole, roles, titre, message, lien='', exclure=None):
    """Crée une notification pour chaque compte actif de l'école ayant l'un de ces rôles. Retourne le nombre."""
    from notifications.models import Notification
    if ecole is None:
        return 0
    from accounts.roles import q_roles
    comptes = User.objects.filter(q_roles(roles), ecole=ecole, is_active=True, is_plateforme=False).distinct()
    if exclure is not None:
        comptes = comptes.exclude(pk=getattr(exclure, 'pk', exclure))
    Notification.objects.bulk_create([
        Notification(destinataire=u, type='INFO', titre=titre[:160], message=message, lien=lien, ecole=ecole)
        for u in comptes
    ])
    return comptes.count()


def prevenir_comptable_inscription(inscription):
    """Une inscription ouvre un dossier de frais : le comptable est prévenu (jamais bloquant)."""
    try:
        from caisse.models import DossierScolarite
        dossier = DossierScolarite.objects.filter(inscription=inscription).first()
        eleve = inscription.eleve
        classe = inscription.classe.nom if inscription.classe_id else 'sans classe'
        montant = f" Montant dû : {int(dossier.montant_du):,} F.".replace(',', ' ') if dossier else ''
        notifier_roles(
            inscription.ecole or eleve.ecole, ['COMPTABLE'],
            'Nouvelle inscription : dossier de frais ouvert',
            f'{eleve.prenom} {eleve.nom} est inscrit(e) en {classe}.{montant}',
            lien='/admin/caisse',
        )
    except Exception:
        pass


@api_view(['POST'])
@permission_classes([IsAuthenticated, EcoleAccesPermission, roles_autorises('ADMIN')])
def message_equipe(request):
    """POST /api/equipe/message/ — {destinataires: ['TOUS'] ou une liste de rôles, titre, message}."""
    ecole = ecole_of(request.user)
    titre = (request.data.get('titre') or '').strip()
    message = (request.data.get('message') or '').strip()
    demandes = request.data.get('destinataires') or []
    if isinstance(demandes, str):
        demandes = [demandes]
    if not titre or not message:
        return Response({'detail': 'Écrivez un titre et un message.'}, status=400)
    if len(titre) > 160 or len(message) > 2000:
        return Response({'detail': 'Message trop long (titre 160 caractères, message 2000).'}, status=400)
    roles = list(ROLES_EQUIPE) if 'TOUS' in demandes else [r for r in demandes if r in ROLES_EQUIPE]
    if not roles:
        return Response({'detail': 'Choisissez au moins un destinataire.'}, status=400)
    envoyes = notifier_roles(ecole, roles, titre, message, exclure=request.user)
    return Response({'envoyes': envoyes, 'detail': f'Message envoyé à {envoyes} personne(s).'})


@api_view(['POST'])
@permission_classes([IsAuthenticated, EcoleAccesPermission, roles_autorises('ENSEIGNANT')])
def message_secretariat(request):
    """POST /api/equipe/message-secretariat/ — {titre, message} : l'enseignant prévient les secrétaires de son école."""
    ecole = ecole_of(request.user)
    titre = (request.data.get('titre') or '').strip()
    message = (request.data.get('message') or '').strip()
    if not titre or not message:
        return Response({'detail': 'Écrivez un titre et un message.'}, status=400)
    if len(titre) > 160 or len(message) > 2000:
        return Response({'detail': 'Message trop long (titre 160 caractères, message 2000).'}, status=400)
    expediteur = request.user.get_full_name().strip() or request.user.username
    envoyes = notifier_roles(
        ecole, ['SECRETAIRE'], f'{titre} — de {expediteur}'[:160], f'De {expediteur} (enseignant) :\n{message}',
        lien='/messages',
    )
    if not envoyes:
        return Response({'detail': "Aucune secrétaire n'est enregistrée dans votre école."}, status=400)
    return Response({'envoyes': envoyes, 'detail': 'Message envoyé à la secrétaire.'})
