"""Journal d'activité : qui a fait quoi, et quand. Consulté par le directeur, jamais modifiable.

Fonctionnement :
  * l'authentification JWT note l'auteur de la requête (JWTAvecJournal) ; le middleware l'oublie à la fin ;
  * les signaux pre_save / post_save / post_delete des modèles SUIVIS écrivent une ligne par changement,
    avec l'ancienne et la nouvelle valeur de chaque champ modifié ;
  * sans auteur (commandes, migrations, données de démonstration), rien n'est écrit ;
  * une erreur du journal n'empêche jamais l'opération elle-même.

Paiements et dépenses n'y figurent pas : ils sont déjà tracés (reçu, journal de caisse, « reçu par »)
et le directeur n'a pas accès à la caisse.
"""
import logging
import threading

from django.db.models.signals import post_delete, post_save, pre_save
from rest_framework_simplejwt.authentication import JWTAuthentication

logger = logging.getLogger(__name__)
_local = threading.local()

# modèle suivi → libellé affiché
SUIVIS = {
    'eleves.Eleve': 'Élève',
    'eleves.DocumentEleve': 'Pièce du dossier',
    'scolarite.Inscription': 'Affectation en classe',
    'scolarite.DemandeInscription': 'Inscription en ligne',
    'scolarite.Classe': 'Classe',
    'scolarite.Niveau': 'Niveau',
    'scolarite.AnneeScolaire': 'Année scolaire',
    'scolarite.Trimestre': 'Trimestre',
    'scolarite.Actualite': 'Actualité',
    'scolarite.ResultatExamenNational': 'Résultat BEPC / BAC',
    'scolarite.PassageAnnee': "Passage d'année",
    'cours.Enseignant': 'Enseignant',
    'cours.Matiere': 'Matière',
    'cours.ClasseMatiere': 'Matière de classe',
    'cours.EmploiDuTemps': 'Emploi du temps',
    'cours.Exercice': 'Exercice',
    'evaluations.Evaluation': 'Devoir / composition',
    'evaluations.Note': 'Note',
    'evaluations.CalendrierComposition': 'Calendrier des compositions',
    'evaluations.CalendrierExamenBlanc': "Calendrier d'examen blanc",
    'evaluations.Deliberation': 'Délibération',
    'caisse.TarifNiveau': 'Frais de scolarité',
    'accounts.User': 'Compte',
    'parametres.Parametres': "Paramètres de l'école",
}

# champs jamais montrés (secrets, horodatages techniques)
CHAMPS_IGNORES = {'password', 'last_login', 'date_joined', 'updated_at', 'created_at', 'date_modification', 'modifie_le'}


def _ignore(nom):
    return nom in CHAMPS_IGNORES or 'password' in nom or 'mot_de_passe' in nom or 'token' in nom


# ── auteur de la requête en cours ────────────────────────────────────────────────────────────
def definir_auteur(user, ip=None):
    _local.user, _local.ip = user, ip


def effacer_auteur():
    _local.user, _local.ip = None, None


def auteur():
    return getattr(_local, 'user', None)


def _ip(request):
    fwd = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (fwd.split(',')[0].strip() or request.META.get('REMOTE_ADDR') or None) if request else None


class JWTAvecJournal(JWTAuthentication):
    """Authentification JWT habituelle, qui retient en plus l'auteur pour le journal."""

    def authenticate(self, request):
        resultat = super().authenticate(request)
        if resultat:
            definir_auteur(resultat[0], _ip(request))
        return resultat


class JournalMiddleware:
    """Oublie l'auteur avant et après chaque requête (les fils du serveur sont réutilisés)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        effacer_auteur()
        try:
            return self.get_response(request)
        finally:
            effacer_auteur()


# ── écriture ─────────────────────────────────────────────────────────────────────────────────
def _nom(user):
    return (f'{user.first_name} {user.last_name}'.strip() or user.username) if user else ''


def noter(action, objet_type='', objet_libelle='', objet_id='', details=None, user=None, ecole=None, ip=None):
    """Écrit une ligne du journal (appel direct : connexion, action groupée…). Ne lève jamais d'erreur."""
    from .models import JournalAction
    user = user or auteur()
    if user is None:
        return None
    try:
        return JournalAction.objects.create(
            ecole=ecole or getattr(user, 'ecole', None),
            utilisateur=user, nom_utilisateur=_nom(user)[:150], role=' + '.join(user.roles)[:60],
            action=action, objet_type=objet_type[:60], objet_id=str(objet_id or '')[:40],
            objet_libelle=str(objet_libelle or '')[:255], details=details or [],
            ip=ip if ip is not None else getattr(_local, 'ip', None),
        )
    except Exception:  # le journal ne doit jamais bloquer le travail
        logger.exception("Journal d'activité : écriture impossible")
        return None


def _cle(instance):
    return f'{instance._meta.app_label}.{instance._meta.object_name}'


def _valeur(field, brut):
    """Valeur lisible d'un champ (nom de la classe plutôt que son numéro, Oui/Non, …)."""
    if brut is None or brut == '':
        return '—'
    if field.is_relation and (field.many_to_one or field.one_to_one):
        try:
            obj = field.related_model._base_manager.filter(pk=brut).first()
            return str(obj) if obj is not None else f'n° {brut}'
        except Exception:
            return f'n° {brut}'
    if field.choices:
        return str(dict(field.flatchoices).get(brut, brut))
    if isinstance(brut, bool):
        return 'Oui' if brut else 'Non'
    if hasattr(brut, 'name'):  # fichier / image
        return brut.name.rsplit('/', 1)[-1] or '—'
    return str(brut)[:200]


def _champs(instance):
    return [f for f in instance._meta.concrete_fields if not f.primary_key and not _ignore(f.name)]


def _etat(instance):
    return {f.attname: getattr(instance, f.attname) for f in _champs(instance)}


def _ecole_de(instance, user):
    if _cle(instance) == 'parametres.Parametres':
        return instance
    return getattr(instance, 'ecole', None) or getattr(user, 'ecole', None)


def _avant_enregistrement(sender, instance, raw=False, **kwargs):
    if raw or auteur() is None or _cle(instance) not in SUIVIS or instance.pk is None:
        return
    try:
        ancien = type(instance)._base_manager.filter(pk=instance.pk).first()
        instance._journal_avant = _etat(ancien) if ancien is not None else None
    except Exception:
        instance._journal_avant = None


def _apres_enregistrement(sender, instance, created=False, raw=False, **kwargs):
    user = auteur()
    if raw or user is None or _cle(instance) not in SUIVIS:
        return
    type_ = SUIVIS[_cle(instance)]
    if created:
        noter('CREATION', type_, str(instance), instance.pk, user=user, ecole=_ecole_de(instance, user))
        return
    avant = getattr(instance, '_journal_avant', None)
    if avant is None:
        return
    details, actif = [], None
    for f in _champs(instance):
        a, b = avant.get(f.attname), getattr(instance, f.attname)
        if a == b or (a in (None, '') and b in (None, '')):
            continue
        if f.name == 'is_active':
            actif = b
            continue
        details.append({'champ': str(f.verbose_name).capitalize(), 'avant': _valeur(f, a), 'apres': _valeur(f, b)})
    if actif is not None and not details:
        action = 'REACTIVATION' if actif else 'SUSPENSION'
    elif details:
        action = 'MODIFICATION'
    else:
        return  # rien de visible n'a changé
    noter(action, type_, str(instance), instance.pk, details=details, user=user, ecole=_ecole_de(instance, user))
    instance._journal_avant = _etat(instance)


def _apres_suppression(sender, instance, **kwargs):
    user = auteur()
    if user is None or _cle(instance) not in SUIVIS:
        return
    noter('SUPPRESSION', SUIVIS[_cle(instance)], str(instance), instance.pk, user=user, ecole=_ecole_de(instance, user))


def brancher():
    """Appelé une fois au démarrage (AccountsConfig.ready)."""
    pre_save.connect(_avant_enregistrement, dispatch_uid='journal_avant')
    post_save.connect(_apres_enregistrement, dispatch_uid='journal_apres')
    post_delete.connect(_apres_suppression, dispatch_uid='journal_suppression')
