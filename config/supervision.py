"""Supervision de la plateforme : chaque erreur du serveur (et chaque requête très lente) est enregistrée
avec l'école, l'utilisateur et la page concernés, pour que le super admin sache tout de suite d'où vient une panne."""
import threading
import time
import traceback

SEUIL_LENT = 5.0  # secondes
_VIDAGE_S = 30  # les compteurs sont écrits en base au plus toutes les 30 s (pas une écriture par requête)
_compteurs = {}
_verrou = threading.Lock()
_dernier_vidage = [time.monotonic()]


def _compter(ecole_id, duree, erreur, lente):
    from django.utils import timezone
    heure = timezone.now().replace(minute=0, second=0, microsecond=0)
    ms = int(duree * 1000)
    with _verrou:
        c = _compteurs.setdefault((heure, ecole_id), [0, 0, 0, 0, 0])
        c[0] += 1
        c[1] += int(erreur)
        c[2] += int(lente)
        c[3] += ms
        c[4] = max(c[4], ms)
        if time.monotonic() - _dernier_vidage[0] < _VIDAGE_S:
            return
        a_ecrire = dict(_compteurs)
        _compteurs.clear()
        _dernier_vidage[0] = time.monotonic()
    vider(a_ecrire)


def vider(a_ecrire=None):
    """Écrit les compteurs en attente (appelé aussi par les tests et par le tableau de bord)."""
    from django.db.models import F
    from django.db.models.functions import Greatest
    from accounts.models import StatRequetes
    if a_ecrire is None:
        with _verrou:
            a_ecrire = dict(_compteurs)
            _compteurs.clear()
    for (heure, ecole_id), (n, err, lent, total, mx) in a_ecrire.items():
        try:
            obj, cree = StatRequetes.objects.get_or_create(heure=heure, ecole_id=ecole_id, defaults={
                'requetes': n, 'erreurs': err, 'lentes': lent, 'duree_totale_ms': total, 'duree_max_ms': mx})
            if not cree:
                StatRequetes.objects.filter(pk=obj.pk).update(
                    requetes=F('requetes') + n, erreurs=F('erreurs') + err, lentes=F('lentes') + lent,
                    duree_totale_ms=F('duree_totale_ms') + total, duree_max_ms=Greatest(F('duree_max_ms'), mx))
        except Exception:
            pass


def _alerter_si_nouvelle(incident):
    """Première occurrence d'une erreur (même page, même message, dans les dernières 24 h) : notification au super admin."""
    try:
        from datetime import timedelta
        from django.utils import timezone
        from accounts.models import IncidentServeur, User
        from notifications.models import Notification
        if incident.niveau == 'LENT':
            return
        semblables = IncidentServeur.objects.filter(
            niveau=incident.niveau, message=incident.message, resolu=False,
            date__gte=timezone.now() - timedelta(days=1)).exclude(pk=incident.pk)
        if any(i.chemin_type == incident.chemin_type for i in semblables[:50]):
            return
        ou = incident.ecole.nom_ecole if incident.ecole_id else 'la plateforme'
        for sa in User.objects.filter(is_plateforme=True, is_active=True):
            Notification.objects.create(
                destinataire=sa, type='INFO', lien='/plateforme/incidents',
                titre=f"Nouvelle erreur — {ou}"[:160],
                message=f"{incident.message[:300]} · {incident.methode} {incident.chemin_type}"
                        + (f" · {incident.nom_utilisateur} ({incident.role})" if incident.nom_utilisateur else ''),
            )
    except Exception:
        pass


def _enregistrer(request, niveau, statut, message='', detail='', duree=None):
    """N'empêche jamais la réponse d'arriver : une erreur ici est ignorée."""
    try:
        from accounts.journal import auteur
        from accounts.models import IncidentServeur
        user = auteur()
        ecole_id = getattr(user, 'ecole_id', None) if user else None
        incident = IncidentServeur.objects.create(
            niveau=niveau, statut_http=statut or 0,
            methode=(request.method or '')[:8], chemin=(request.path or '')[:255],
            message=str(message or '')[:500], detail=str(detail or '')[:6000],
            duree_ms=int(duree * 1000) if duree is not None else None,
            utilisateur=user if getattr(user, 'pk', None) else None,
            nom_utilisateur=(getattr(user, 'username', '') or '')[:150],
            role=(getattr(user, 'role', '') or '')[:30],
            ecole_id=ecole_id,
        )
        _alerter_si_nouvelle(incident)
        return incident
    except Exception:
        return None


LIBRES_EN_MAINTENANCE = ('/api/maintenance', '/api/sante', '/api/accueil', '/api/auth/login', '/api/auth/refresh')  # le super admin passe partout
_cache_maintenance = {'t': 0.0, 'valeur': None}


def maintenance_en_cours():
    """Lecture de l'état avec un cache de 5 s : une requête de plus toutes les 5 s au plus, pas à chaque appel."""
    if time.monotonic() - _cache_maintenance['t'] > 5:
        try:
            from accounts.models import Maintenance
            m = Maintenance.get()
            _cache_maintenance['valeur'] = m if m.en_cours() else None
        except Exception:
            _cache_maintenance['valeur'] = None
        _cache_maintenance['t'] = time.monotonic()
    return _cache_maintenance['valeur']


def oublier_cache_maintenance():
    _cache_maintenance['t'] = 0.0


class MaintenanceMiddleware:
    """Pendant la maintenance, toute l'API répond « 503 maintenance » sauf pour le super admin (et la connexion, la santé,
    l'accueil). L'application l'affiche en page de maintenance ; les saisies hors ligne attendent et repartent ensuite."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        chemin = request.path or ''
        m = maintenance_en_cours() if chemin.startswith('/api/') else None
        if m is not None and not chemin.startswith(LIBRES_EN_MAINTENANCE):
            from config.ecole_access import _user_from_jwt
            from config.tenancy import is_plateforme
            user = _user_from_jwt(request)
            if user is None or not is_plateforme(user):
                from django.http import JsonResponse
                reponse = JsonResponse({
                    'maintenance': True, 'titre': m.titre, 'message': m.message,
                    'fin': m.fin.isoformat() if m.fin else None,
                    'detail': 'Maintenance en cours.',
                }, status=503)
                reponse['Retry-After'] = '120'
                return reponse
        return self.get_response(request)


class SupervisionMiddleware:
    """À placer après le journal d'activité : l'auteur de la requête est encore connu ici."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not (request.path or '').startswith('/api/'):
            return self.get_response(request)
        debut = time.monotonic()
        request._incident_enregistre = False
        response = self.get_response(request)
        duree = time.monotonic() - debut
        statut = getattr(response, 'status_code', 0)
        try:
            from accounts.journal import auteur
            u = auteur()
            _compter(getattr(u, 'ecole_id', None) if u else None, duree, statut >= 500, duree >= SEUIL_LENT)
        except Exception:
            pass
        if statut >= 500 and not request._incident_enregistre:
            message = ''
            try:
                data = getattr(response, 'data', None)
                message = data.get('detail', '') if isinstance(data, dict) else ''
            except Exception:
                pass
            _enregistrer(request, 'ERREUR', statut, message or f'Réponse {statut}', duree=duree)
        elif duree >= SEUIL_LENT:
            _enregistrer(request, 'LENT', statut, f'Réponse en {duree:.1f} s', duree=duree)
        # une page d'erreur HTML n'a aucun sens pour l'application : on renvoie une phrase claire en français
        if statut in (404, 405) or statut >= 500:
            if 'json' not in (response.get('Content-Type', '') or '').lower() and statut != 503:
                from django.http import JsonResponse
                from config.erreurs import MESSAGE_SERVEUR
                message = ("Cette adresse n'existe pas dans l'application." if statut == 404
                           else "Cette action n'est pas possible à cet endroit." if statut == 405 else MESSAGE_SERVEUR)
                return JsonResponse({'detail': message}, status=statut)
        return response

    def process_exception(self, request, exception):
        request._incident_enregistre = True
        _enregistrer(request, 'ERREUR', 500, f'{type(exception).__name__} : {exception}',
                     detail=''.join(traceback.format_exception(type(exception), exception, exception.__traceback__))[-6000:])
        return None  # Django renvoie sa réponse d'erreur habituelle
