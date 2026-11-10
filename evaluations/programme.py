"""Programme des compositions : commun à tout le niveau au collège (6ème à 3ème), propre à chaque classe au lycée
(2nde, 1ère, Terminale), où les séries n'ont ni les mêmes matières ni les mêmes jours."""

NIVEAUX_PAR_CLASSE = {'2nde', '1ère', 'Terminale'}


def programme_par_classe(niveau):
    from scolarite.passage import normaliser_niveau
    return normaliser_niveau(getattr(niveau, 'nom', '')) in NIVEAUX_PAR_CLASSE


def examen_blanc_par_classe(niveau):
    """Examen blanc : programme propre à chaque série en Terminale (Tle A ≠ Tle D) ; commun à toutes les classes en 3ème."""
    from scolarite.passage import normaliser_niveau
    return normaliser_niveau(getattr(niveau, 'nom', '')) == 'Terminale'
