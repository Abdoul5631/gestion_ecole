"""Rang d'un niveau scolaire : du plus petit (maternelle) au plus grand (terminale)."""
import re
import unicodedata

# (motif sur le nom sans accents ni espaces, rang)
_RANGS = [
    (r'^(creche|garderie)', 0),
    (r'^(maternelle|petitesection|ps)', 5),
    (r'^(moyennesection|ms)', 6),
    (r'^(grandesection|gs)', 7),
    (r'^(cp|coursprepa)1?$', 10),
    (r'^cp2$', 11),
    (r'^(ce|coursel)1$', 12),
    (r'^(ce|coursel)2$', 13),
    (r'^(cm|coursmoy)1$', 14),
    (r'^(cm|coursmoy)2$', 15),
    (r'^(6|sixieme)', 20),
    (r'^(5|cinquieme)', 21),
    (r'^(4|quatrieme)', 22),
    (r'^(3|troisieme)', 23),
    (r'^(2nde|2de|seconde|2ndeb|2e$)', 30),
    (r'^(1ere|1re|premiere|1e$)', 31),
    (r'^(tle|term)', 32),
]
RANG_INCONNU = 500


def rang_niveau(nom):
    n = unicodedata.normalize('NFD', (nom or '').lower())
    n = ''.join(c for c in n if unicodedata.category(c) != 'Mn')
    n = re.sub(r'[\s._-]+', '', n)
    for motif, rang in _RANGS:
        if re.match(motif, n):
            return rang
    m = re.match(r'^(\d+)', n)  # inconnu mais numéroté : après les connus, dans l'ordre du chiffre
    return RANG_INCONNU + int(m.group(1)) if m else RANG_INCONNU + 99
