"""Helpers année scolaire (Burkina Faso : septembre N → juillet N+1)."""
from datetime import date, timedelta


def annee_scolaire_courante(today=None):
    """Retourne (libellé, année de début). Ex. 20 sept. 2026 → ('2026-2027', 2026)."""
    today = today or date.today()
    debut = today.year if today.month >= 9 else today.year - 1
    return f"{debut}-{debut + 1}", debut


def get_annee_active(ecole=None):
    """Année scolaire active (celle affichée dans l'interface), limitée à l'école."""
    from .models import AnneeScolaire
    qs = AnneeScolaire.objects.all()
    if ecole is not None:
        qs = qs.filter(ecole=ecole)
    return (
        qs.filter(is_active=True).order_by('-libelle').first()
        or qs.order_by('-libelle').first()
    )


def resolve_annee(request, default_active=True):
    """
    Année à utiliser pour filtrer les listes.
    - ?annee_id=12  → cette année
    - ?annee_id=all → aucune restriction (toutes les années)
    - absent        → année active (si default_active)
    """
    raw = None
    ecole = None
    if request is not None:
        raw = request.query_params.get('annee_id') or request.data.get('annee_id')
        ecole = getattr(getattr(request, 'user', None), 'ecole', None)
    if raw in ('all', 'toutes', '*'):
        return None
    if raw:
        from .models import AnneeScolaire
        qs = AnneeScolaire.objects.all()
        if ecole is not None:
            qs = qs.filter(ecole=ecole)
        try:
            return qs.get(pk=raw)
        except (AnneeScolaire.DoesNotExist, ValueError, TypeError):
            pass
    return get_annee_active(ecole) if default_active else None


def periode_annee(annee):
    """Période sept. N → 31 juil. N+1 pour une année (libellé '2026-2027')."""
    if not annee or not getattr(annee, 'libelle', None):
        return None, None
    try:
        debut = int(str(annee.libelle).split('-')[0])
    except (ValueError, IndexError):
        return None, None
    return date(debut, 9, 1), date(debut + 1, 7, 31)


def inscription_pour(eleve, annee=None, trimestre=None):
    """Inscription de l'élève pour l'année du trimestre, sinon l'année active."""
    from .models import Inscription
    qs = Inscription.objects.select_related('classe__niveau', 'annee_scolaire').filter(eleve=eleve)
    annee_id = None
    if trimestre is not None:
        annee_id = getattr(trimestre, 'annee_scolaire_id', None)
    if annee is not None:
        annee_id = annee.id if hasattr(annee, 'id') else annee
    if annee_id is None:
        ecole = getattr(eleve, 'ecole', None)
        active = get_annee_active(ecole)
        annee_id = active.id if active else None
    if annee_id:
        qs = qs.filter(annee_scolaire_id=annee_id)
    return qs.first()


def ids_enfants(user):
    """Identifiants des enfants d'un parent (M2M + ancien champ eleve)."""
    ids = set()
    if getattr(user, 'eleve_id', None):
        ids.add(user.eleve_id)
    if hasattr(user, 'enfants'):
        ids.update(user.enfants.values_list('id', flat=True))
    return list(ids)


def jours_scolaires_recents(n=12, today=None):
    """n derniers jours de cours (lun–ven), du plus ancien au plus récent."""
    today = today or date.today()
    jours = []
    d = today
    while len(jours) < n:
        if d.weekday() < 5:
            jours.append(d)
        d -= timedelta(days=1)
    jours.reverse()
    return jours


def trimestre_index(nom):
    digits = "".join(ch for ch in (nom or "") if ch.isdigit())
    try:
        return int(digits) if digits else 0
    except ValueError:
        return 0


def est_trimestre_3(trimestre):
    nom = (getattr(trimestre, 'nom', None) or '').lower()
    return trimestre_index(nom) == 3 or '3e' in nom or '3ème' in nom or 'troisieme' in nom.replace('è', 'e').replace('é', 'e')


def annee_suivante_libelle(libelle):
    """2026-2027 → 2027-2028."""
    if not libelle:
        return ''
    try:
        debut = int(str(libelle).split('-')[0])
    except (ValueError, IndexError):
        return ''
    return f"{debut + 1}-{debut + 2}"


def garantir_annee_suivante(annee):
    """Crée l'année suivante + 3 trimestres si besoin (sans l'activer)."""
    from .models import AnneeScolaire, Trimestre
    libelle = annee_suivante_libelle(getattr(annee, 'libelle', '') or '')
    if not libelle:
        return None
    ecole = getattr(annee, 'ecole', None)
    lookup = {'libelle': libelle}
    defaults = {'is_active': False}
    if ecole is not None:
        lookup['ecole'] = ecole
        defaults['ecole'] = ecole
    suivante, _ = AnneeScolaire.objects.get_or_create(**lookup, defaults=defaults)
    for nom in ('Trimestre 1', 'Trimestre 2', 'Trimestre 3'):
        Trimestre.objects.get_or_create(
            nom=nom, annee_scolaire=suivante,
            defaults={'is_active': True, 'ecole': ecole},
        )
    return suivante


def seuil_passage(ecole=None):
    try:
        from parametres.models import Parametres
        params = ecole if ecole is not None else Parametres.get()
        val = float(getattr(params, 'seuil_passage', 10) or 10)
    except Exception:
        val = 10.0
    return val if val > 0 else 10.0


def calculer_age(date_naissance, a_la_date=None):
    """Âge en années révolues à une date (aujourd'hui par défaut) ; None si la date de naissance est inconnue ou future."""
    from datetime import date
    if not date_naissance:
        return None
    ref = a_la_date or date.today()
    age = ref.year - date_naissance.year - ((ref.month, ref.day) < (date_naissance.month, date_naissance.day))
    return age if age >= 0 else None
