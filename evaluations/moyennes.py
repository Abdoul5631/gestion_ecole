"""Calcul des moyennes de trimestre / annuelle (même formule que le bulletin)."""
from collections import defaultdict

from scolarite.utils import trimestre_index


def _calc_avg(note_list):
    if not note_list:
        return 0.0
    total_v = sum(float(n.valeur) * float(n.evaluation.coefficient) for n in note_list)
    total_c = sum(float(n.evaluation.coefficient) for n in note_list)
    return round(total_v / total_c, 2) if total_c else 0.0


def moyenne_pour_notes(notes_par_cm, class_cms):
    """Moyenne pondérée d'un élève : toutes les matières de la classe, 0 si pas de note.
    Les notes sont rangées par matière : celles d'une ancienne classe (élève transféré) comptent aussi."""
    if not class_cms:
        return 0.0
    total_coef = 0.0
    total_moy_coef = 0.0
    for cm in class_cms:
        coef = float(cm.coef)
        moy = _calc_avg(notes_par_cm.get(cm.matiere_id, []))
        total_coef += coef
        total_moy_coef += moy * coef
    return round(total_moy_coef / total_coef, 2) if total_coef else 0.0


def moyennes_annuelles_eleve(eleve, annee, classe=None):
    """
    Retourne {t1, t2, t3, annuelle} pour un élève.
    annuelle = moyenne des 3 moyennes de trimestre (celles qui existent).
    """
    from evaluations.models import Note
    from cours.models import ClasseMatiere

    trimestres = list(annee.trimestres.all()) if annee else []
    if classe is None:
        from scolarite.utils import inscription_pour
        ins = inscription_pour(eleve, annee=annee)
        classe = ins.classe if ins else None
    class_cms = list(
        ClasseMatiere.objects.filter(classe=classe).select_related('matiere')
    ) if classe else []

    notes = Note.objects.filter(
        eleve=eleve,
        evaluation__trimestre__annee_scolaire=annee,
    ).exclude(evaluation__type='EXAMEN_BLANC').select_related(
        'evaluation__classe_matiere', 'evaluation__trimestre'
    )

    by_trim_cm = defaultdict(lambda: defaultdict(list))
    for n in notes:
        by_trim_cm[n.evaluation.trimestre_id][n.evaluation.classe_matiere.matiere_id].append(n)

    detail = {'t1': None, 't2': None, 't3': None}
    vals = []
    for t in trimestres:
        idx = trimestre_index(t.nom)
        key = f't{idx}' if idx in (1, 2, 3) else None
        moy = moyenne_pour_notes(by_trim_cm.get(t.id, {}), class_cms) if class_cms else 0.0
        if key:
            detail[key] = moy
        vals.append(moy)
    annuelle = round(sum(vals) / len(vals), 2) if vals else None
    detail['annuelle'] = annuelle
    return detail


def moyennes_annuelles_bulk(inscriptions):
    """
    {eleve_id: {t1, t2, t3, annuelle}} pour une liste d'inscriptions de la même année.
    """
    from evaluations.models import Note
    from cours.models import ClasseMatiere

    inscriptions = list(inscriptions)
    if not inscriptions:
        return {}

    annee = inscriptions[0].annee_scolaire
    trimestres = list(annee.trimestres.all()) if annee else []
    classe_ids = {ins.classe_id for ins in inscriptions if ins.classe_id}
    cms_by_classe = defaultdict(list)
    for cm in ClasseMatiere.objects.filter(classe_id__in=classe_ids).select_related('matiere'):
        cms_by_classe[cm.classe_id].append(cm)

    eleve_ids = [ins.eleve_id for ins in inscriptions]
    notes = Note.objects.filter(
        eleve_id__in=eleve_ids,
        evaluation__trimestre__annee_scolaire=annee,
    ).exclude(evaluation__type='EXAMEN_BLANC').select_related(
        'evaluation__classe_matiere', 'evaluation__trimestre'
    )

    by_eleve_trim_cm = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for n in notes:
        by_eleve_trim_cm[n.eleve_id][n.evaluation.trimestre_id][n.evaluation.classe_matiere.matiere_id].append(n)

    out = {}
    for ins in inscriptions:
        detail = {'t1': None, 't2': None, 't3': None}
        vals = []
        cms = cms_by_classe.get(ins.classe_id, [])
        for t in trimestres:
            idx = trimestre_index(t.nom)
            moy = moyenne_pour_notes(by_eleve_trim_cm[ins.eleve_id].get(t.id, {}), cms) if cms else 0.0
            if idx in (1, 2, 3):
                detail[f't{idx}'] = moy
            vals.append(moy)
        detail['annuelle'] = round(sum(vals) / len(vals), 2) if vals else None
        out[ins.eleve_id] = detail
    return out
