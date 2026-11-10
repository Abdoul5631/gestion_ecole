"""Pilotage de la plateforme (super admin) : fiche d'une école, trafic, annonces ; et, pour tous, les annonces
en cours, la remontée des erreurs du navigateur et l'adresse de santé publique."""
from datetime import timedelta

from django.db import connection
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AnnoncePlateforme, IncidentServeur, JournalAction, Maintenance, StatRequetes, User
from accounts.permissions import IsPlateforme
from config.throttles import ErreurClient


class FicheEcoleView(APIView):
    """GET /api/plateforme/ecoles/<pk>/ — tout ce qu'il faut savoir d'une école pour l'aider ou la dépanner."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request, pk):
        from parametres.models import Parametres
        from scolarite.models import AnneeScolaire, Classe, Inscription
        e = get_object_or_404(Parametres, pk=pk)
        maintenant = timezone.now()
        annee = AnneeScolaire.objects.filter(ecole=e, is_active=True).first()
        ins = (Inscription.objects.filter(ecole=e, annee_scolaire=annee, is_active=True, statut='INSCRIT')
               if annee else Inscription.objects.none())
        par_niveau = list(ins.values('classe__niveau__nom').annotate(n=Count('id')).order_by('classe__niveau__nom'))
        roles = dict(User.objects.filter(ecole=e, is_active=True, is_plateforme=False).values_list('role').annotate(n=Count('id')))
        directeurs = [{'username': u.username, 'nom': f'{u.first_name} {u.last_name}'.strip(), 'email': u.email,
                       'actif': u.is_active, 'derniere_connexion': u.last_login}
                      for u in User.objects.filter(ecole=e, role='ADMIN', is_plateforme=False).order_by('-is_active', 'username')]
        debut = timezone.localtime(maintenant - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
        connexions = {}
        for d in JournalAction.objects.filter(ecole=e, action='CONNEXION', date__gte=debut).values_list('date', flat=True):
            j = timezone.localtime(d).date().isoformat()
            connexions[j] = connexions.get(j, 0) + 1
        jours = [(debut + timedelta(days=i)).date().isoformat() for i in range(30)]
        evenements = [{'date': j.date, 'qui': j.nom_utilisateur, 'role': j.role, 'action': j.get_action_display(),
                       'objet': ' '.join(x for x in (j.objet_type, j.objet_libelle) if x)}
                      for j in JournalAction.objects.filter(ecole=e).order_by('-date')[:15]]
        try:
            from notifications.models import SmsOutbox
            sms = SmsOutbox.objects.filter(ecole=e, created_at__gte=maintenant - timedelta(days=30))
            sms_info = {'envoyes': sms.count(), 'echecs': sms.filter(statut='FAILED').count()}
        except Exception:
            sms_info = {'envoyes': 0, 'echecs': 0}
        try:
            from caisse.models import Paiement
            nb_paiements = Paiement.objects.filter(dossier__inscription__annee_scolaire=annee).count() if annee else 0
        except Exception:
            nb_paiements = 0
        return Response({
            'id': e.id, 'nom': e.nom_ecole, 'ville': e.ville, 'adresse': e.adresse, 'telephone': e.telephone,
            'email': e.email, 'directeur': e.directeur, 'statut': e.statut, 'motif': e.motif,
            'date_demande': e.date_demande, 'date_statut': e.date_statut, 'slug': e.slug, 'vitrine_active': e.vitrine_active,
            'annee_en_cours': annee.libelle if annee else None,
            'eleves': ins.count(), 'classes': Classe.objects.filter(ecole=e, is_active=True).count(),
            'effectifs_par_niveau': [{'niveau': x['classe__niveau__nom'] or '—', 'eleves': x['n']} for x in par_niveau],
            'comptes': roles, 'directeurs': directeurs,
            'connexions_30j': [{'jour': j, 'connexions': connexions.get(j, 0)} for j in jours],
            'evenements': evenements,
            'incidents_ouverts': IncidentServeur.objects.filter(ecole=e, resolu=False).count(),
            'sms_30j': sms_info, 'paiements_annee': nb_paiements,
        })


class TraficView(APIView):
    """GET /api/plateforme/trafic/?jours=7&ecole= — requêtes, erreurs et temps de réponse, jour par jour."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request):
        from config.supervision import vider
        vider()  # les compteurs encore en mémoire
        try:
            jours = max(1, min(30, int(request.query_params.get('jours') or 7)))
        except ValueError:
            jours = 7
        debut = timezone.localtime(timezone.now() - timedelta(days=jours - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
        qs = StatRequetes.objects.filter(heure__gte=debut)
        if request.query_params.get('ecole'):
            qs = qs.filter(ecole_id=request.query_params['ecole'])
        vide = {'requetes': 0, 'erreurs': 0, 'lentes': 0, 'duree_totale_ms': 0, 'duree_max_ms': 0}
        par_jour = {}
        for s in qs:
            j = timezone.localtime(s.heure).date().isoformat()
            d = par_jour.setdefault(j, dict(vide))
            d['requetes'] += s.requetes
            d['erreurs'] += s.erreurs
            d['lentes'] += s.lentes
            d['duree_totale_ms'] += s.duree_totale_ms
            d['duree_max_ms'] = max(d['duree_max_ms'], s.duree_max_ms)
        serie = []
        for i in range(jours):
            j = (debut + timedelta(days=i)).date().isoformat()
            d = par_jour.get(j, vide)
            serie.append({'jour': j, 'requetes': d['requetes'], 'erreurs': d['erreurs'], 'lentes': d['lentes'],
                          'temps_moyen_ms': round(d['duree_totale_ms'] / d['requetes']) if d['requetes'] else 0,
                          'temps_max_ms': d['duree_max_ms']})
        return Response({'jours': serie})


def _annonce_json(a):
    maintenant = timezone.now()
    ecoles = list(a.ecoles.values_list('id', 'nom_ecole'))
    return {'id': a.id, 'titre': a.titre, 'message': a.message, 'niveau': a.niveau, 'cible': a.cible,
            'debut': a.debut, 'fin': a.fin, 'active': a.active, 'cree_le': a.cree_le,
            'ecoles': [{'id': i, 'nom': n} for i, n in ecoles],
            'en_cours': a.active and a.debut <= maintenant and (a.fin is None or a.fin > maintenant)}


def _notifier_destinataires(a):
    """Une notification dans la cloche (et la page Messages) de chaque personne concernée, en plus du bandeau."""
    from notifications.models import Notification
    qs = User.objects.filter(is_active=True, is_plateforme=False, ecole__isnull=False)
    ids_ecoles = list(a.ecoles.values_list('id', flat=True))
    if ids_ecoles:
        qs = qs.filter(ecole_id__in=ids_ecoles)
    if a.cible == 'DIRECTION':
        qs = qs.filter(role__in=('ADMIN', 'SECRETAIRE', 'COMPTABLE', 'SURVEILLANT', 'COMMUNICATION'))
    type_notif = 'INFO'
    lot = [Notification(destinataire_id=u_id, ecole_id=e_id, type=type_notif, titre=a.titre[:160], message=a.message, lien='')
           for u_id, e_id in qs.values_list('id', 'ecole_id')]
    Notification.objects.bulk_create(lot, batch_size=500)
    return len(lot)


class AnnoncesView(APIView):
    """GET / POST /api/plateforme/annonces/ — messages affichés en bandeau dans les écoles."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request):
        return Response({'results': [_annonce_json(a) for a in AnnoncePlateforme.objects.all()[:100]]})

    def post(self, request):
        from django.utils.dateparse import parse_datetime
        from accounts.journal import noter
        d = request.data
        titre, message = (d.get('titre') or '').strip(), (d.get('message') or '').strip()
        if not titre or not message:
            return Response({'detail': 'Le titre et le message sont obligatoires.'}, status=400)
        debut = parse_datetime(d['debut']) if d.get('debut') else timezone.now()
        fin = parse_datetime(d['fin']) if d.get('fin') else None
        if debut and timezone.is_naive(debut):
            debut = timezone.make_aware(debut)
        if fin and timezone.is_naive(fin):
            fin = timezone.make_aware(fin)
        if debut is None:
            return Response({'detail': 'Date de début invalide.'}, status=400)
        if fin and fin <= debut:
            return Response({'detail': 'La fin doit être après le début.'}, status=400)
        from parametres.models import Parametres
        a = AnnoncePlateforme.objects.create(
            titre=titre[:120], message=message[:600],
            niveau=d.get('niveau') if d.get('niveau') in ('info', 'warning', 'error') else 'info',
            cible=d.get('cible') if d.get('cible') in ('TOUS', 'DIRECTION') else 'TOUS',
            debut=debut, fin=fin, cree_par=request.user)
        ids = [i for i in (d.get('ecoles') or []) if str(i).isdigit()]
        if ids:
            a.ecoles.set(Parametres.objects.filter(pk__in=ids, statut='VALIDEE'))
        notifies = _notifier_destinataires(a) if debut <= timezone.now() else 0  # une annonce programmée prévient à son heure
        noter('CREATION', 'Annonce plateforme', f"{a.titre} — " + (f"{a.ecoles.count()} école(s)" if ids else 'toutes les écoles'))
        data = _annonce_json(a)
        data['notifies'] = notifies
        return Response(data, status=201)


class AnnonceDetailView(APIView):
    """PATCH /api/plateforme/annonces/<pk>/ {active} — arrêter ou relancer une annonce."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def patch(self, request, pk):
        a = get_object_or_404(AnnoncePlateforme, pk=pk)
        if 'active' in request.data:
            a.active = bool(request.data['active'])
            a.save(update_fields=['active'])
        return Response(_annonce_json(a))


class AnnoncesActivesView(APIView):
    """GET /api/annonces-actives/ — les annonces en cours, pour le bandeau de chaque utilisateur."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from accounts.roles import roles_de
        maintenant = timezone.now()
        qs = AnnoncePlateforme.objects.filter(active=True, debut__lte=maintenant).filter(Q(fin__isnull=True) | Q(fin__gt=maintenant))
        direction = bool({'ADMIN', 'SECRETAIRE', 'COMPTABLE', 'SURVEILLANT', 'COMMUNICATION'} & set(roles_de(request.user)))
        if not direction:
            qs = qs.filter(cible='TOUS')
        # annonce réservée à certaines écoles : seules celles-ci la voient
        ecole_id = getattr(request.user, 'ecole_id', None)
        qs = qs.filter(Q(ecoles__isnull=True) | Q(ecoles__id=ecole_id)).distinct()
        return Response({'results': [{'id': a.id, 'titre': a.titre, 'message': a.message, 'niveau': a.niveau} for a in qs[:3]]})


class _PageApplication:
    """L'incident porte la page de l'application où l'erreur s'est produite, pas l'adresse de l'API."""
    method = 'PAGE'

    def __init__(self, page):
        self.path = page


class ErreurClientView(APIView):
    """POST /api/erreur-client/ — une page plantée dans le navigateur d'un utilisateur arrive dans « Incidents »."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [ErreurClient]

    def post(self, request):
        from config.supervision import _enregistrer
        d = request.data if hasattr(request.data, 'get') else {}
        page = str(d.get('page') or '')[:200]
        message = str(d.get('message') or 'Erreur inconnue')[:400]
        pile = str(d.get('pile') or '')[:5000]
        navigateur = str(d.get('navigateur') or request.META.get('HTTP_USER_AGENT', ''))[:300]
        _enregistrer(_PageApplication(page), 'CLIENT', 0, message, detail=f'{pile}\n\nNavigateur : {navigateur}')
        return Response(status=204)


class SanteView(APIView):
    """GET /api/sante/ — public et léger : un service de surveillance externe l'appelle chaque minute."""
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        try:
            with connection.cursor() as c:
                c.execute('SELECT 1')
            return Response({'ok': True, 'base': 'ok', 'heure': timezone.now()})
        except Exception:
            return Response({'ok': False, 'base': 'injoignable'}, status=503)


def _maintenance_json(m, public=False):
    maintenant = timezone.now()
    d = {'en_cours': m.en_cours(maintenant), 'programmee': m.programmee(maintenant), 'titre': m.titre, 'message': m.message,
         'debut': m.debut, 'fin': m.fin}
    if not public:
        d.update({'actif': m.actif, 'modifie_le': m.modifie_le})
    return d


class MaintenancePublicView(APIView):
    """GET /api/maintenance/ — sans connexion : l'application et le site savent s'ils doivent afficher la page de maintenance."""
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        return Response(_maintenance_json(Maintenance.get(), public=True))


class MaintenancePlateformeView(APIView):
    """GET / PUT /api/plateforme/maintenance/ — le super admin lance, programme ou arrête la maintenance."""
    permission_classes = [IsAuthenticated, IsPlateforme]

    def get(self, request):
        return Response(_maintenance_json(Maintenance.get()))

    def put(self, request):
        from django.utils.dateparse import parse_datetime
        from accounts.journal import noter
        from config.supervision import oublier_cache_maintenance
        m = Maintenance.get()
        d = request.data
        if 'titre' in d:
            m.titre = (str(d.get('titre') or '').strip() or m.titre)[:120]
        if 'message' in d:
            m.message = (str(d.get('message') or '').strip() or m.message)[:600]
        for champ in ('debut', 'fin'):
            if champ in d:
                v = parse_datetime(d[champ]) if d.get(champ) else None
                if v and timezone.is_naive(v):
                    v = timezone.make_aware(v)
                setattr(m, champ, v)
        if m.debut and m.fin and m.fin <= m.debut:
            return Response({'detail': 'La fin doit être après le début.'}, status=400)
        if 'actif' in d:
            m.actif = bool(d['actif'])
            if m.actif and 'debut' not in d and not m.debut:
                m.debut = None
        m.modifie_par = request.user
        m.save()
        oublier_cache_maintenance()
        etat = 'en cours' if m.en_cours() else ('programmée' if m.programmee() else 'arrêtée')
        noter('MODIFICATION', 'Maintenance', f'Maintenance {etat}')
        return Response(_maintenance_json(m))
