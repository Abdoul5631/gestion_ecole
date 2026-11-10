"""Matricules automatiques : initiales de l'école + numéro (Complexe Scolaire Charles de Gaulle → CSCG1, CSCG2…)."""
import re
import string
import unicodedata

MOTS_VIDES = {'de', 'du', 'des', 'd', 'la', 'le', 'les', 'l', 'et', 'en', 'au', 'aux', 'a', 'sur', 'pour'}
LONGUEUR_MAX = 6


def _sans_accents(texte):
    return ''.join(c for c in unicodedata.normalize('NFD', texte or '') if unicodedata.category(c) != 'Mn')


def prefixe_depuis_nom(nom):
    """Initiales des mots significatifs ; un nom d'un seul mot donne ses premières lettres."""
    mots = [m for m in re.split(r'[^A-Za-z0-9]+', _sans_accents(nom)) if m]
    utiles = [m for m in mots if m.lower() not in MOTS_VIDES] or mots
    prefixe = ''.join(m[0] for m in utiles).upper()
    if len(prefixe) < 3 and utiles:
        prefixe = (''.join(utiles).upper())[:4]
    return (prefixe or 'ELV')[:LONGUEUR_MAX]


def prefixe_ecole(ecole):
    """Préfixe propre à l'école, calculé une fois puis conservé. Deux écoles n'ont jamais le même préfixe
    (l'identifiant de connexion d'un élève est son matricule) : en cas d'homonymie on ajoute une lettre."""
    from parametres.models import Parametres
    if ecole.prefixe_matricule:
        return ecole.prefixe_matricule
    base = prefixe_depuis_nom(ecole.nom_ecole)
    autres = Parametres.objects.exclude(pk=ecole.pk)
    candidat, lettres = base, iter(string.ascii_uppercase)
    while autres.filter(prefixe_matricule=candidat).exists():
        candidat = f'{base}{next(lettres)}'
    ecole.prefixe_matricule = candidat
    Parametres.objects.filter(pk=ecole.pk).update(prefixe_matricule=candidat)
    return candidat


def prochain_matricule(ecole):
    """Prochain numéro libre de l'école : le plus grand déjà donné + 1, sans jamais réutiliser un matricule."""
    from .models import Eleve
    prefixe = prefixe_ecole(ecole)
    motif = re.compile(rf'^{re.escape(prefixe)}(\d+)$', re.IGNORECASE)
    dernier = 0
    for mat in Eleve.objects.filter(ecole=ecole, matricule__istartswith=prefixe).values_list('matricule', flat=True):
        trouve = motif.match(mat or '')
        if trouve:
            dernier = max(dernier, int(trouve.group(1)))
    n = dernier + 1
    while Eleve.objects.filter(ecole=ecole, matricule__iexact=f'{prefixe}{n}').exists():
        n += 1
    return f'{prefixe}{n}'
