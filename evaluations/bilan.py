"""Bilan pédagogique de l'école : par trimestre ou pour l'année, avec le taux de réussite aux examens nationaux (BEPC, BAC).

Mêmes moyennes de trimestre que les bulletins (evaluations.moyennes) ; la moyenne de l'année ignore les trimestres sans note.
Réussite d'un élève = moyenne supérieure ou égale au seuil de passage de l'école.
"""
from collections import defaultdict

from scolarite.utils import seuil_passage, trimestre_index

STATUTS = ('INSCRIT', 'DIPLOME', 'SORTI')
TRANCHES = [(0, 5, '0 à 5'), (5, 8, '5 à 8'), (8, 10, '8 à 10'), (10, 12, '10 à 12'), (12, 14, '12 à 14'),
            (14, 16, '14 à 16'), (16, 20.01, '16 à 20')]
LIBELLES_EXAMEN = {'BEPC': 'BEPC (3ème)', 'BAC': 'BAC (Terminale)'}


def _stats(moyennes, seuil):
    """Effectif, moyenne, taux de réussite, meilleure et plus faible moyenne d'un groupe d'élèves."""
    vals = [m for m in moyennes if m is not None]
    if not vals:
        return {'effectif': 0, 'moyenne': None, 'taux_reussite': None, 'reussis': 0, 'meilleure': None, 'plus_faible': None}
    reussis = sum(1 for v in vals if v >= seuil)
    return {
        'effectif': len(vals), 'moyenne': round(sum(vals) / len(vals), 2),
        'taux_reussite': round(100 * reussis / len(vals), 1), 'reussis': reussis,
        'meilleure': round(max(vals), 2), 'plus_faible': round(min(vals), 2),
    }


def _moyenne_annee(m, trimestres_notes):
    """Moyenne de l'année d'un élève : seulement les trimestres où il a des notes (un trimestre pas encore commencé
    ne compte pas pour 0, contrairement à la formule du bulletin qui divise toujours par le nombre de trimestres)."""
    vals = [m[f't{i}'] for i in sorted(trimestres_notes) if i in (1, 2, 3) and m.get(f't{i}') is not None]
    return round(sum(vals) / len(vals), 2) if vals else m.get('annuelle')


def _nom(eleve):
    return f'{eleve.nom} {eleve.prenom}'.strip()


def stats_examen(annee, examen):
    """Candidats, admis et taux de réussite d'un examen national pour une année ; taux vide tant que la liste n'est pas saisie."""
    from scolarite.models import ResultatExamenNational
    from scolarite.passage import inscriptions_examen, listes_examen_importees
    inscrits = inscriptions_examen(annee, examen)
    saisie = examen in listes_examen_importees(annee)
    admis_ids = set(ResultatExamenNational.objects.filter(annee_scolaire=annee, examen=examen, admis=True)
                    .values_list('eleve_id', flat=True))
    par_classe = defaultdict(lambda: {'candidats': 0, 'admis': 0})
    for ins in inscrits:
        c = par_classe[ins.classe.nom]
        c['candidats'] += 1
        c['admis'] += 1 if ins.eleve_id in admis_ids else 0
    candidats = len(inscrits)
    admis = sum(1 for ins in inscrits if ins.eleve_id in admis_ids)

    def taux(n, total):
        return round(100 * n / total, 1) if saisie and total else None

    return {
        'examen': examen, 'libelle': LIBELLES_EXAMEN[examen], 'annee': annee.libelle, 'liste_saisie': saisie,
        'candidats': candidats, 'admis': admis if saisie else None, 'non_admis': candidats - admis if saisie else None,
        'taux_reussite': taux(admis, candidats),
        'par_classe': [{'classe': nom, 'candidats': v['candidats'], 'admis': v['admis'] if saisie else None,
                        'taux_reussite': taux(v['admis'], v['candidats'])} for nom, v in sorted(par_classe.items())],
    }


def calcul_bilan(ecole, annee, trimestre=None, classe_id=None):
    """Bilan d'un trimestre (trimestre donné) ou de l'année entière (trimestre=None).

    classe_id=None : tout l'établissement ; sinon, le bilan de cette seule classe."""
    from evaluations.models import Note
    from evaluations.moyennes import moyennes_annuelles_bulk
    from scolarite.models import AnneeScolaire, Inscription

    seuil = seuil_passage(ecole)
    toutes = list(Inscription.objects.filter(annee_scolaire=annee, statut__in=STATUTS, classe__isnull=False)
                  .select_related('eleve', 'classe__niveau'))
    classes_choix = {}
    for ins in toutes:
        classes_choix[ins.classe_id] = {'id': ins.classe_id, 'nom': ins.classe.nom,
                                        'ordre': getattr(ins.classe.niveau, 'ordre', 0)}
    classes_choix = sorted(classes_choix.values(), key=lambda c: (c['ordre'], c['nom']))
    classe_choisie = next((c for c in classes_choix if c['id'] == classe_id), None) if classe_id else None
    inscriptions = [i for i in toutes if i.classe_id == classe_id] if classe_choisie else toutes
    moyennes = moyennes_annuelles_bulk(inscriptions)
    cle = None
    if trimestre is not None:
        idx = trimestre_index(trimestre.nom)
        cle = f't{idx}' if idx in (1, 2, 3) else None

    # notes de la période : qui a des notes, et la moyenne de chaque matière
    notes = Note.objects.filter(evaluation__trimestre__annee_scolaire=annee).exclude(evaluation__type='EXAMEN_BLANC')
    if trimestre is not None:
        notes = notes.filter(evaluation__trimestre=trimestre)
    avec_notes, par_cours = set(), defaultdict(lambda: [0.0, 0.0])
    trimestres_notes = defaultdict(set)  # eleve_id -> numéros de trimestre où il a au moins une note
    noms_matieres = {}
    for eleve_id, cm_id, matiere, valeur, coef, nom_trim in notes.values_list(
            'eleve_id', 'evaluation__classe_matiere_id', 'evaluation__classe_matiere__matiere__nom', 'valeur',
            'evaluation__coefficient', 'evaluation__trimestre__nom'):
        avec_notes.add(eleve_id)
        trimestres_notes[eleve_id].add(trimestre_index(nom_trim))
        noms_matieres[cm_id] = matiere
        par_cours[(eleve_id, cm_id)][0] += float(valeur) * float(coef)
        par_cours[(eleve_id, cm_id)][1] += float(coef)

    lignes = []  # (inscription, moyenne de la période) pour les élèves ayant des notes
    for ins in inscriptions:
        if ins.eleve_id not in avec_notes:
            continue
        m = moyennes.get(ins.eleve_id, {})
        lignes.append((ins, m.get(cle) if cle else _moyenne_annee(m, trimestres_notes[ins.eleve_id])))
    lignes = [(i, m) for i, m in lignes if m is not None]

    # école entière
    ecole_stats = _stats([m for _, m in lignes], seuil)
    ecole_stats['inscrits'] = len(inscriptions)
    ecole_stats['sans_note'] = len(inscriptions) - len(lignes)
    repartition = [{'tranche': lib, 'nombre': sum(1 for _, m in lignes if bas <= m < haut)} for bas, haut, lib in TRANCHES]

    # par classe
    groupes = defaultdict(list)
    for ins, m in lignes:
        groupes[ins.classe_id].append((ins, m))
    inscrits_par_classe = defaultdict(int)
    for ins in inscriptions:
        inscrits_par_classe[ins.classe_id] += 1
    classes = []
    for classe_id, items in groupes.items():
        ins0 = items[0][0]
        st = _stats([m for _, m in items], seuil)
        meilleur = max(items, key=lambda x: x[1])[0].eleve
        classes.append({'id': classe_id, 'classe': ins0.classe.nom, 'niveau': ins0.classe.niveau.nom if ins0.classe.niveau else '',
                        'ordre': getattr(ins0.classe.niveau, 'ordre', 0), 'inscrits': inscrits_par_classe[classe_id],
                        **st, 'meilleur_eleve': _nom(meilleur)})
    classes.sort(key=lambda c: (c['ordre'], c['classe']))

    # par matière
    par_matiere = defaultdict(list)
    for (eleve_id, cm_id), (somme, total) in par_cours.items():
        if total:
            par_matiere[noms_matieres[cm_id]].append(somme / total)
    matieres = sorted(({'matiere': nom, **_stats(vals, seuil)} for nom, vals in par_matiere.items()),
                      key=lambda x: (x['moyenne'] is None, -(x['moyenne'] or 0)))

    # garçons / filles
    genre = {}
    for code, libelle in (('M', 'Garçons'), ('F', 'Filles')):
        genre[libelle] = _stats([m for ins, m in lignes if ins.eleve.sexe == code], seuil)

    meilleurs = [{'nom': _nom(ins.eleve), 'classe': ins.classe.nom, 'moyenne': round(m, 2)}
                 for ins, m in sorted(lignes, key=lambda x: -x[1])[:10]]
    a_encourager = [{'nom': _nom(ins.eleve), 'classe': ins.classe.nom, 'moyenne': round(m, 2)}
                    for ins, m in sorted(lignes, key=lambda x: x[1])[:10] if m < seuil]

    resultat = {
        'seuil': seuil, 'ecole': ecole_stats, 'repartition': repartition, 'classes': classes, 'matieres': matieres,
        'genre': genre, 'meilleurs': meilleurs, 'a_encourager': a_encourager,
        'classes_choix': classes_choix, 'classe_choisie': classe_choisie,
    }

    # bilan de l'année : passage en classe supérieure (hors 3ème et Terminale, qui dépendent de l'examen)
    if trimestre is None:
        from scolarite.passage import examen_pour_niveau
        admis = redoublent = 0
        for ins, m in lignes:
            if examen_pour_niveau(ins.classe.niveau.nom if ins.classe.niveau else ''):
                continue
            if m >= seuil:
                admis += 1
            else:
                redoublent += 1
        resultat['passage'] = {'admis': admis, 'redoublent': redoublent,
                               'taux': round(100 * admis / (admis + redoublent), 1) if admis + redoublent else None}

    # examens nationaux : année en cours et historique de l'école
    examens = []
    for code in ('BEPC', 'BAC'):
        courant = stats_examen(annee, code)
        if not courant['candidats'] and not courant['liste_saisie']:
            historique_possible = False
        else:
            historique_possible = True
        historique = []
        for autre in AnneeScolaire.objects.filter(ecole=annee.ecole).order_by('-libelle'):
            if autre.pk == annee.pk:
                continue
            s = stats_examen(autre, code)
            if s['candidats'] and s['liste_saisie']:
                historique.append({k: s[k] for k in ('annee', 'candidats', 'admis', 'taux_reussite')})
        if classe_choisie:
            # une classe : seulement sa ligne d'examen (l'historique de l'école n'a pas de sens ici)
            ligne = next((c for c in courant['par_classe'] if c['classe'] == classe_choisie['nom']), None)
            if ligne:
                examens.append({**courant, 'candidats': ligne['candidats'], 'admis': ligne['admis'],
                                'non_admis': ligne['candidats'] - ligne['admis'] if ligne['admis'] is not None else None,
                                'taux_reussite': ligne['taux_reussite'], 'par_classe': [ligne], 'historique': []})
            continue
        if historique_possible or historique:
            examens.append({**courant, 'historique': historique[:5]})
    resultat['examens'] = examens
    return resultat
