from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from accounts.permissions import IsAdmin, IsPlateforme
from config.tenancy import ecole_of, ecole_session_payload, is_plateforme
from scolarite.utils import annee_scolaire_courante
from .models import Parametres
from .serializers import ParametresSerializer, CreerEcoleSerializer, EcolePlateformeSerializer


def _notifier_admins_ecole(ecole, titre, message):
    try:
        from notifications.models import Notification
    except Exception:
        return
    admins = User.objects.filter(ecole=ecole, role='ADMIN', is_plateforme=False, is_active=True)
    for admin in admins:
        Notification.objects.create(
            destinataire=admin,
            type='INFO',
            titre=titre,
            message=message,
            ecole=ecole,
        )


class IsAdminOuSitePublic(BasePermission):
    """Le directeur, ou le membre de l'équipe à qui il a confié le site public."""
    def has_permission(self, request, view):
        u = request.user
        from accounts.roles import a_un_role
        return bool(u and u.is_authenticated and a_un_role(u, 'ADMIN', 'COMMUNICATION'))


class ParametresView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    # Champs que le responsable du site public peut modifier (rien d'autre : ni identité, ni bulletin, ni mots de passe)
    CHAMPS_SITE_PUBLIC = {
        'presentation_vitrine', 'vitrine_active', 'vitrine_photo', 'vitrine_atouts', 'vitrine_horaires',
        'vitrine_whatsapp', 'vitrine_facebook', 'vitrine_carte', 'vitrine_afficher_tarifs', 'vitrine_afficher_classes',
    }

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAdminOuSitePublic()]

    def _ecole(self, request):
        ecole = ecole_of(request.user)
        if ecole is None and not is_plateforme(request.user):
            return None
        return ecole

    def get(self, request):
        ecole = self._ecole(request)
        if ecole is None:
            return Response({'detail': 'Aucune école liée à ce compte.'}, status=404)
        serializer = ParametresSerializer(ecole, context={'request': request})
        return Response(serializer.data)

    def put(self, request):
        from accounts.sync_dedupe import replay_if_seen, store_receipt
        existing = replay_if_seen(request)
        if existing is not None:
            return existing
        ecole = self._ecole(request)
        if ecole is None:
            return Response({'detail': 'Aucune école liée à ce compte.'}, status=404)
        if request.user.role != 'ADMIN':
            interdits = sorted(set(request.data.keys()) - self.CHAMPS_SITE_PUBLIC - {'client_id'})
            if interdits:
                return Response({'detail': "Vous pouvez seulement modifier le site public de l'école "
                                           "(présentation, photo, atouts, contacts, affichage)."}, status=403)
        serializer = ParametresSerializer(
            ecole, data=request.data, partial=True, context={'request': request}
        )
        if serializer.is_valid():
            serializer.save()
            response = Response(serializer.data)
            store_receipt(request, response)
            return response
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CreerEcoleView(APIView):
    """Inscription publique : crée l'école EN_ATTENTE + le premier compte directeur (ADMIN)."""
    permission_classes = [AllowAny]
    from config.throttles import DepotPublic
    throttle_classes = [DepotPublic]

    def post(self, request):
        serializer = CreerEcoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        email = data['email'].strip().lower()
        if User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).exists():
            return Response({'email': ["Cet e-mail est déjà utilisé par un compte. Utilisez une autre adresse."]}, status=400)
        if Parametres.objects.filter(nom_ecole__iexact=data['nom_ecole'], ville__iexact=data['ville'],
                                     statut__in=(Parametres.STATUT_EN_ATTENTE, Parametres.STATUT_VALIDEE)).exists():
            return Response({'nom_ecole': ["Une école de ce nom existe déjà dans cette ville (ou sa demande est en cours)."]}, status=400)

        ecole = Parametres.objects.create(
            nom_ecole=data['nom_ecole'], ville=data['ville'].strip(), adresse=data.get('adresse', '').strip(),
            telephone=data['telephone'], email=email, directeur=data['directeur'].strip(),
            telephone_directeur=data['telephone_directeur'], statut_juridique=data['statut_juridique'],
            ordre_enseignement=data['ordre_enseignement'], annee_creation=data.get('annee_creation', ''),
            numero_autorisation=data.get('numero_autorisation', '').strip(),
            direction_regionale=data.get('direction_regionale', '').strip(),
            direction_provinciale=data.get('direction_provinciale', '').strip(),
            statut=Parametres.STATUT_EN_ATTENTE,
        )
        noms = data['directeur'].strip().split(' ', 1)
        user = User(
            username=email, email=email, role='ADMIN', ecole=ecole,
            first_name=noms[0][:150], last_name=(noms[1] if len(noms) > 1 else '')[:150],
            is_staff=True, is_superuser=False, is_plateforme=False, is_active=True, must_change_password=True,
        )
        user.set_unusable_password()  # le mot de passe provisoire est créé à la validation
        user.save()

        libelle, _ = annee_scolaire_courante()
        from scolarite.models import AnneeScolaire, Trimestre
        annee = AnneeScolaire.objects.create(libelle=libelle, is_active=True, ecole=ecole)
        for nom in ('Trimestre 1', 'Trimestre 2', 'Trimestre 3'):
            Trimestre.objects.create(nom=nom, annee_scolaire=annee, is_active=True, ecole=ecole)

        # le super admin est prévenu tout de suite
        try:
            from notifications.models import Notification
            for sa in User.objects.filter(is_plateforme=True, is_active=True):
                Notification.objects.create(destinataire=sa, type='INFO', lien='/plateforme/ecoles',
                                            titre=f'Nouvelle école à valider — {ecole.nom_ecole}'[:160],
                                            message=f'{ecole.nom_ecole} ({ecole.ville}) · directeur {ecole.directeur} · {email} · {ecole.telephone_directeur}')
        except Exception:
            pass
        return Response({
            'ecole': ecole.nom_ecole, 'email': email,
            'message': "Demande envoyée. Après vérification, la plateforme valide l'école et vous communique un mot de passe "
                       "provisoire. Vous vous connecterez avec votre e-mail.",
        }, status=status.HTTP_201_CREATED)


class ListeEcolesView(APIView):
    """Liste des écoles — réservée au super admin plateforme."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request):
        qs = Parametres.objects.all().order_by('statut', 'nom_ecole')
        statut = request.query_params.get('statut')
        if statut:
            qs = qs.filter(statut=statut)
        return Response(EcolePlateformeSerializer(qs, many=True, context={'request': request}).data)


class EcoleActionView(APIView):
    """Valider / refuser / suspendre / réactiver — jamais de suppression définitive."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    ACTIONS = {'valider', 'refuser', 'suspendre', 'reactiver'}

    def post(self, request, pk, action):
        if action not in self.ACTIONS:
            return Response({'detail': 'Action inconnue.'}, status=400)
        ecole = get_object_or_404(Parametres, pk=pk)
        motif = (request.data.get('motif') or '').strip()
        now = timezone.now()

        if action == 'valider':
            ecole.statut = Parametres.STATUT_VALIDEE
            ecole.motif = ''
            ecole.date_statut = now
            ecole.validee_par = request.user
            ecole.vitrine_active = True
            ecole.ensure_slug()
            titre = 'École validée'
            message = f"Votre établissement « {ecole.nom_ecole} » a été validé. Vous pouvez l'utiliser."
        elif action == 'refuser':
            if not motif:
                return Response({'motif': ['Indiquez le motif du refus.']}, status=400)
            ecole.statut = Parametres.STATUT_REFUSEE
            ecole.motif = motif
            ecole.date_statut = now
            ecole.validee_par = request.user
            titre = 'École refusée'
            message = f"Votre demande pour « {ecole.nom_ecole} » a été refusée. Motif : {motif}"
        elif action == 'suspendre':
            ecole.statut = Parametres.STATUT_SUSPENDUE
            ecole.motif = motif
            ecole.date_statut = now
            ecole.validee_par = request.user
            titre = 'École suspendue'
            message = f"L'établissement « {ecole.nom_ecole} » est suspendu."
            if motif:
                message += f" Motif : {motif}"
        else:
            ecole.statut = Parametres.STATUT_VALIDEE
            ecole.motif = ''
            ecole.date_statut = now
            ecole.validee_par = request.user
            ecole.vitrine_active = True
            ecole.ensure_slug()
            titre = 'École réactivée'
            message = f"L'établissement « {ecole.nom_ecole} » a été réactivé."

        ecole.save()
        _notifier_admins_ecole(ecole, titre, message)
        donnees = dict(EcolePlateformeSerializer(ecole, context={'request': request}).data)
        if action in ('valider', 'reactiver'):
            donnees['identifiants'] = _identifiants_directeur(ecole)
        return Response(donnees)


def _identifiants_directeur(ecole):
    """À la première validation, le directeur reçoit un mot de passe provisoire (à changer à sa première connexion).
    Il est montré au super admin et envoyé par SMS au directeur si la passerelle est active."""
    from accounts.journal import noter
    from accounts.passwords import generer_mot_de_passe_temporaire
    directeur = User.objects.filter(ecole=ecole, role='ADMIN', is_plateforme=False).order_by('id').first()
    if directeur is None or directeur.has_usable_password():
        return None
    mdp = generer_mot_de_passe_temporaire()
    directeur.set_password(mdp)
    directeur.must_change_password = True
    directeur.save(update_fields=['password', 'must_change_password'])
    noter('MODIFICATION', 'Compte', f'Mot de passe provisoire créé pour le directeur {directeur.email}')
    sms = None
    if ecole.telephone_directeur:
        try:
            from notifications.services import envoyer_sms
            r = envoyer_sms(ecole.telephone_directeur,
                            f"{ecole.nom_ecole} est validée. Connexion : {directeur.email} / mot de passe provisoire : {mdp} "
                            "(à changer à la première connexion).", type='INFO')
            sms = getattr(r, 'statut', None)
        except Exception:
            sms = None
    return {'email': directeur.email, 'mot_de_passe_temporaire': mdp, 'telephone': ecole.telephone_directeur, 'sms': sms}



class EcoleComptesView(APIView):
    """Comptes d'une école (recherche) — réservé au super admin, pour retrouver quelqu'un qui a perdu son accès."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request, pk):
        ecole = get_object_or_404(Parametres, pk=pk)
        q = (request.query_params.get('q') or '').strip()
        qs = User.objects.filter(ecole=ecole, is_plateforme=False).select_related('eleve', 'enseignant')
        if q:
            from django.db.models import Q
            qs = qs.filter(Q(username__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q)
                           | Q(eleve__nom__icontains=q) | Q(eleve__prenom__icontains=q) | Q(enseignant__nom__icontains=q))
        elif not qs.exists():
            return Response([])
        return Response([
            {'id': u.id, 'username': u.username, 'role': u.role, 'actif': u.is_active,
             'nom': (f'{u.eleve.prenom} {u.eleve.nom}' if u.eleve_id else u.enseignant.nom if u.enseignant_id
                     else f'{u.first_name} {u.last_name}'.strip())}
            for u in qs.order_by('role', 'username')[:15]
        ])


class SuspendreCompteParentView(APIView):
    """Suspend ou réactive le compte d'un parent : décision de la plateforme, jamais de l'école."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def post(self, request, pk, user_id, action):
        from accounts.journal import noter
        from accounts.passwords import revoquer_sessions
        if action not in ('suspendre', 'reactiver'):
            return Response({'detail': 'Action inconnue.'}, status=400)
        cible = get_object_or_404(User, pk=user_id, ecole_id=pk, is_plateforme=False)
        if cible.role != 'PARENT':
            return Response({'detail': "Seuls les comptes de parents se suspendent ici. Les autres comptes sont gérés par l'école."},
                            status=400)
        motif = (request.data.get('motif') or '').strip()[:200]
        if action == 'suspendre' and not motif:
            return Response({'motif': ['Indiquez le motif de la suspension.']}, status=400)
        cible.is_active = action == 'reactiver'
        cible.save(update_fields=['is_active'])
        if action == 'suspendre':
            revoquer_sessions(cible)
        noter('MODIFICATION', 'Compte',
              f"Compte du parent {cible.username} {'suspendu' if action == 'suspendre' else 'réactivé'} par la plateforme"
              + (f' — {motif}' if motif else ''))
        return Response({'username': cible.username, 'actif': cible.is_active})


class ReinitialiserMotDePasseView(APIView):
    """Donne un mot de passe provisoire à un compte : le titulaire devra en choisir un nouveau à sa connexion."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def post(self, request, pk, user_id):
        from accounts.journal import noter
        from accounts.passwords import generer_mot_de_passe_temporaire, revoquer_sessions
        cible = get_object_or_404(User, pk=user_id, ecole_id=pk, is_plateforme=False)
        pwd = generer_mot_de_passe_temporaire()
        cible.set_password(pwd)
        cible.must_change_password = True
        cible.save(update_fields=['password', 'must_change_password'])
        revoquer_sessions(cible)
        noter('AUTRE', 'Compte', f'Mot de passe réinitialisé par la plateforme pour {cible.username}')
        return Response({'username': cible.username, 'mot_de_passe_temporaire': pwd})
