"""
Passage d'année : admis → classe du niveau suivant ; redoublants → même classe.
3ème / Terminale : pas de mouvement tant que le directeur n'a pas saisi les admis BEPC/BAC.
"""
from .models import Classe, Inscription, Niveau, ResultatExamenNational
from .utils import annee_suivante_libelle, garantir_annee_suivante, seuil_passage

NIVEAU_SUIVANT = {
    '6ème': '5ème',
    '5ème': '4ème',
    '4ème': '3ème',
    '3ème': '2nde',
    '2nde': '1ère',
    '1ère': 'Terminale',
    'Terminale': None,
}
NIVEAUX_EXAMEN = {'3ème', 'Terminale'}
SERIES_LYCEE = {'A', 'C', 'D', 'T'}  # T = 2nde technique
QUITTE = 'SORT'  # admis au BEPC qui poursuit ailleurs (lycée technique, autre établissement)
LIBELLES_ORIENTATION = {'A': '2nde A', 'C': '2nde C', 'D': '2nde D', 'T': '2nde Technique', QUITTE: "quitte l'école"}


def normaliser_niveau(nom):
    n = (nom or '').strip()
    cle = (
        n.lower()
        .replace('è', 'e').replace('é', 'e').replace('ê', 'e')
        .replace(' ', '')
    )
    mapping = {
        '6eme': '6ème', '6e': '6ème',
        '5eme': '5ème', '5e': '5ème',
        '4eme': '4ème', '4e': '4ème',
        '3eme': '3ème', '3e': '3ème',
        '2nde': '2nde', 'seconde': '2nde', '2nde': '2nde',
        '1ere': '1ère', 'premiere': '1ère', '1re': '1ère',
        'terminale': 'Terminale', 'tle': 'Terminale', 'tle': 'Terminale',
    }
    return mapping.get(cle, n)


def suffixe_classe(classe_nom, niveau_nom):
    if not classe_nom:
        return 'A'
    rest = classe_nom.replace(niveau_nom or '', '', 1).strip()
    if not rest:
        parts = str(classe_nom).split()
        rest = parts[-1] if len(parts) > 1 else 'A'
    return rest or 'A'


def est_niveau_examen(niveau_nom):
    return normaliser_niveau(niveau_nom) in NIVEAUX_EXAMEN


def examen_pour_niveau(niveau_nom):
    n = normaliser_niveau(niveau_nom)
    if n == '3ème':
        return 'BEPC'
    if n == 'Terminale':
        return 'BAC'
    return None


def inscriptions_examen(annee, examen):
    """Inscriptions de 3ème (BEPC) ou Terminale (BAC) pour l'année."""
    cible = '3ème' if examen == 'BEPC' else 'Terminale'
    return [
        ins for ins in Inscription.objects.filter(
            annee_scolaire=annee, statut__in=('INSCRIT', 'DIPLOME', 'SORTI'),
        ).select_related('eleve', 'classe__niveau')
        if ins.classe and ins.classe.niveau
        and normaliser_niveau(ins.classe.niveau.nom) == cible
    ]


def eleves_examen_par_matricule(annee, examen):
    return {
        ins.eleve.matricule.strip().upper(): ins.eleve
        for ins in inscriptions_examen(annee, examen)
    }


def listes_examen_importees(annee):
    """Examens dont le directeur a enregistré la liste (même si personne n'est admis)."""
    return set(
        ResultatExamenNational.objects.filter(annee_scolaire=annee).values_list('examen', flat=True).distinct()
    )


def serie_lycee(brut):
    """Choix de l'élève : « C », « 2nde c », « Série D », « Technique », « quitte »… → A, C, D, T ou SORT ; vide → A ; illisible → None."""
    import re
    t = str(brut or '').strip().upper()
    if not t:
        return 'A'
    if t in SERIES_LYCEE or t == QUITTE:
        return t
    if 'TECH' in t:
        return 'T'
    if any(m in t for m in ('QUITTE', 'SORT', 'PART', 'AUTRE ECOLE', 'AUTRE ÉCOLE', 'AILLEURS')):
        return QUITTE
    t = re.sub(r'2\s*(NDE|ND|E)', ' ', t).replace('SÉRIE', ' ').replace('SERIE', ' ')
    lettres = [x for x in re.findall(r'\b([A-Z])\b', t) if x in SERIES_LYCEE]
    return lettres[0] if len(set(lettres)) == 1 else None


def liste_examen_verrouillee(annee, examen):
    """Message si les élèves de cet examen ont déjà été déplacés par un passage d'année (liste figée), sinon ''.
    Le passage peut être lancé plusieurs fois : tant que la 3ème / Tle est « en attente », la liste reste modifiable."""
    ids = [ins.eleve_id for ins in inscriptions_examen(annee, examen)]
    if not ids:
        return ''
    deplaces = Inscription.objects.filter(eleve_id__in=ids).exclude(annee_scolaire=annee)         .filter(annee_scolaire__libelle__gt=annee.libelle).exists()
    diplomes = Inscription.objects.filter(eleve_id__in=ids, annee_scolaire=annee, statut__in=('DIPLOME', 'SORTI')).exists()
    if deplaces or diplomes:
        return (f"Le passage d'année a déjà placé les élèves de {'3ème' if examen == 'BEPC' else 'Terminale'} "
                f"de {annee.libelle} : la liste du {examen} ne peut plus changer.")
    return ''


def decision_eleve(ins, moyennes, resultats_map, seuil, examens_saisis=None):
    """
    Retourne un dict {code, libelle, detail, seuil, moyenne_annuelle}.
    codes: ADMIS, REDOUBLE, ATTENTE_EXAMEN, ADMIS_EXAMEN, REDOUBLE_EXAMEN
    Tant qu'aucune liste d'admis n'est saisie pour l'examen, 3ème/Tle restent en attente.
    Une fois la liste saisie : présents = admis, absents = redoublent.
    """
    annuelle = (moyennes or {}).get('annuelle')
    niveau_nom = ins.classe.niveau.nom if ins.classe and ins.classe.niveau else ''
    examen = examen_pour_niveau(niveau_nom)
    base = {
        'seuil': seuil,
        'moyenne_annuelle': annuelle,
        'niveau_examen': bool(examen),
        'examen': examen,
    }
    if examen:
        res = resultats_map.get(ins.eleve_id)
        saisie = examen in (examens_saisis or set())
        if res is None and not saisie:
            return {
                **base,
                'code': 'ATTENTE_EXAMEN',
                'libelle': 'Décision selon résultat examen national',
                'detail': (
                    f"En {normaliser_niveau(niveau_nom)}, le passage dépend de l'examen "
                    f"({examen}). Le directeur n'a pas encore saisi la liste des admis."
                ),
            }
        if res and res.admis:
            if examen == 'BAC':
                libelle = "Admis au BAC — quitte l'école pour l'université"
                detail = "L'élève a son BAC : il quitte l'établissement (diplômé) et n'apparaît pas l'année suivante."
            elif (res.serie_2nde or '').upper() == QUITTE:
                return {**base, 'code': 'ADMIS_EXAMEN', 'sortie': True, 'libelle': "Admis au BEPC — quitte l'école",
                        'detail': "L'élève poursuit ailleurs (lycée technique, autre établissement). Il n'apparaît pas l'année suivante."}
            else:
                serie = (res.serie_2nde or 'A').upper()
                libelle = f"Admis au BEPC — passe en {LIBELLES_ORIENTATION.get(serie, '2nde ' + serie)}"
                detail = f"Passage en {LIBELLES_ORIENTATION.get(serie, '2nde ' + serie)}, selon le choix de l'élève (modifiable ensuite dans les inscriptions)."
            return {**base, 'code': 'ADMIS_EXAMEN', 'sortie': examen == 'BAC', 'libelle': libelle, 'detail': detail}
        return {
            **base,
            'code': 'REDOUBLE_EXAMEN',
            'libelle': f'Non admis à l\'{examen} — redouble',
            'detail': f"L'élève n'est pas sur la liste des admis. Il redouble {niveau_nom}.",
        }

    if annuelle is None:
        return {
            **base,
            'code': 'REDOUBLE',
            'libelle': 'Redouble',
            'detail': f'Seuil de passage : {seuil}/20. Pas assez de notes pour calculer la moyenne annuelle.',
        }
    if annuelle >= seuil:
        return {
            **base,
            'code': 'ADMIS',
            'libelle': 'Admis en classe supérieure',
            'detail': f'Moyenne annuelle {annuelle}/20 ≥ {seuil}/20.',
        }
    return {
        **base,
        'code': 'REDOUBLE',
        'libelle': 'Redouble',
        'detail': f'Moyenne annuelle {annuelle}/20 < {seuil}/20.',
    }


def classe_cible_pour(ins, decision, resultat=None):
    """Classe de l'année suivante, ou None si l'élève sort (diplômé)."""
    if not ins.classe or not ins.classe.niveau:
        return None
    niveau_nom = normaliser_niveau(ins.classe.niveau.nom)
    if decision.get('sortie'):  # BAC obtenu, ou BEPC obtenu et l'élève part ailleurs
        return None
    if decision['code'] in ('REDOUBLE', 'REDOUBLE_EXAMEN'):
        return ins.classe
    if decision['code'] == 'ATTENTE_EXAMEN':
        return None

    suivant_nom = NIVEAU_SUIVANT.get(niveau_nom)
    if not suivant_nom:
        return None

    suffixe = suffixe_classe(ins.classe.nom, ins.classe.niveau.nom)
    if niveau_nom == '3ème':
        serie = ''
        if resultat and resultat.serie_2nde:
            serie = resultat.serie_2nde.strip().upper()
        if serie not in SERIES_LYCEE:
            serie = suffixe.upper() if suffixe.upper() in SERIES_LYCEE else 'A'
        suffixe = serie

    nom_cible = f"{suivant_nom} {suffixe}".strip()
    ecole = getattr(ins, 'ecole', None) or getattr(ins.classe, 'ecole', None)
    niv_qs = Niveau.objects.all()
    if ecole is not None:
        niv_qs = niv_qs.filter(ecole=ecole)
    niveau = niv_qs.filter(nom=suivant_nom).first()
    if niveau is None:
        niveau, _ = Niveau.objects.get_or_create(
            nom=suivant_nom, ecole=ecole, defaults={'is_active': True},
        )

    classe = Classe.objects.filter(nom=nom_cible, niveau=niveau).first()
    if classe is None:
        classe = Classe.objects.filter(niveau=niveau, nom__icontains=suffixe).first()
    if classe is None and niveau_nom == '3ème':
        classe = Classe.objects.filter(niveau=niveau, nom__icontains='A').first()
    if classe is None:
        classe, _ = Classe.objects.get_or_create(
            nom=nom_cible, niveau=niveau, defaults={'is_active': True, 'ecole': ecole}
        )
    return classe


def _resultats_map(annee):
    return {
        r.eleve_id: r
        for r in ResultatExamenNational.objects.filter(annee_scolaire=annee, admis=True)
    }


def _resultats_map_all(annee):
    return {
        r.eleve_id: r
        for r in ResultatExamenNational.objects.filter(annee_scolaire=annee)
    }


def apercu_passage(annee):
    """Prévisualisation sans écrire : qui passe, qui redouble, qui attend l'examen."""
    from evaluations.moyennes import moyennes_annuelles_bulk

    seuil = seuil_passage(getattr(annee, 'ecole', None))
    suivante = garantir_annee_suivante(annee)
    inscriptions = list(
        Inscription.objects.filter(annee_scolaire=annee, statut='INSCRIT')
        .select_related('eleve', 'classe__niveau', 'annee_scolaire')
    )
    moyennes = moyennes_annuelles_bulk(inscriptions)
    resultats = _resultats_map_all(annee)
    examens_saisis = listes_examen_importees(annee)

    groupes = {
        'admis': [],
        'redoublants': [],
        'diplomes': [],
        'en_attente_examen': [],
        'deja_inscrits': [],
    }
    deja = set()
    if suivante:
        deja = set(
            Inscription.objects.filter(annee_scolaire=suivante)
            .values_list('eleve_id', flat=True)
        )

    for ins in inscriptions:
        dec = decision_eleve(ins, moyennes.get(ins.eleve_id), resultats, seuil, examens_saisis)
        cible = classe_cible_pour(ins, dec, resultats.get(ins.eleve_id))
        item = {
            'eleve_id': ins.eleve_id,
            'matricule': ins.eleve.matricule,
            'nom': ins.eleve.nom,
            'prenom': ins.eleve.prenom,
            'classe': ins.classe.nom if ins.classe else '—',
            'niveau': ins.classe.niveau.nom if ins.classe and ins.classe.niveau else '—',
            'moyenne_annuelle': dec.get('moyenne_annuelle'),
            'moyennes': moyennes.get(ins.eleve_id) or {},
            'decision': dec,
            'classe_cible': cible.nom if cible else None,
            'deja_inscrit_annee_suivante': ins.eleve_id in deja,
        }
        if ins.eleve_id in deja:
            groupes['deja_inscrits'].append(item)
        elif dec['code'] == 'ATTENTE_EXAMEN':
            groupes['en_attente_examen'].append(item)
        elif dec.get('sortie'):
            groupes['diplomes'].append(item)
        elif dec['code'] in ('REDOUBLE', 'REDOUBLE_EXAMEN'):
            groupes['redoublants'].append(item)
        else:
            groupes['admis'].append(item)

    return {
        'annee_source': annee.libelle,
        'annee_cible': suivante.libelle if suivante else annee_suivante_libelle(annee.libelle),
        'annee_cible_id': suivante.id if suivante else None,
        'seuil': seuil,
        'explication': (
            "Les élèves admis (moyenne annuelle ≥ {seuil}/20) vont dans la classe du niveau suivant. "
            "Les autres redoublent la même classe. En 3ème et Terminale, rien ne bouge tant que "
            "le directeur n'a pas saisi la liste des admis BEPC / BAC."
        ).format(seuil=seuil),
        'totaux': {k: len(v) for k, v in groupes.items()},
        **groupes,
    }


def lancer_passage(annee, auteur=None):
    """
    Crée les inscriptions de l'année suivante (historique conservé).
    Idempotent : un élève déjà inscrit l'année suivante est ignoré.
    """
    from evaluations.moyennes import moyennes_annuelles_bulk
    from .models import PassageAnnee

    seuil = seuil_passage(getattr(annee, 'ecole', None))
    suivante = garantir_annee_suivante(annee)
    if suivante is None:
        return {'detail': "Impossible de déterminer l'année suivante."}, 400

    inscriptions = list(
        Inscription.objects.filter(annee_scolaire=annee, statut='INSCRIT')
        .select_related('eleve', 'classe__niveau', 'annee_scolaire')
    )
    moyennes = moyennes_annuelles_bulk(inscriptions)
    resultats = _resultats_map_all(annee)
    examens_saisis = listes_examen_importees(annee)
    deja = set(
        Inscription.objects.filter(annee_scolaire=suivante).values_list('eleve_id', flat=True)
    )

    stats = {
        'admis': 0, 'redoublants': 0, 'diplomes': 0,
        'en_attente_examen': 0, 'ignores': 0,
    }
    created_ids = []

    for ins in inscriptions:
        dec = decision_eleve(ins, moyennes.get(ins.eleve_id), resultats, seuil, examens_saisis)
        if dec['code'] == 'ATTENTE_EXAMEN':
            stats['en_attente_examen'] += 1
            continue

        if dec.get('sortie'):
            statut = 'DIPLOME' if dec.get('examen') == 'BAC' else 'SORTI'
            if ins.statut != statut:
                ins.statut = statut
                ins.save(update_fields=['statut'])
            stats['diplomes'] += 1
            continue

        if ins.eleve_id in deja:
            stats['ignores'] += 1
            continue

        cible = classe_cible_pour(ins, dec, resultats.get(ins.eleve_id))
        if cible is None:
            stats['ignores'] += 1
            continue

        redoublant = dec['code'] in ('REDOUBLE', 'REDOUBLE_EXAMEN')
        nouvelle = Inscription.objects.create(
            eleve=ins.eleve,
            classe=cible,
            annee_scolaire=suivante,
            redoublant=redoublant,
            statut='INSCRIT',
            ecole=getattr(annee, 'ecole', None) or getattr(ins, 'ecole', None),
        )
        try:
            from caisse.services import ouvrir_dossier
            ouvrir_dossier(nouvelle)
        except Exception:
            pass
        created_ids.append(nouvelle.id)
        if redoublant:
            stats['redoublants'] += 1
        else:
            stats['admis'] += 1

    PassageAnnee.objects.create(
        annee_source=annee,
        annee_cible=suivante,
        lance_par=auteur,
        admis=stats['admis'],
        redoublants=stats['redoublants'],
        diplomes=stats['diplomes'],
        en_attente_examen=stats['en_attente_examen'],
        ignores=stats['ignores'],
        ecole=getattr(annee, 'ecole', None),
    )
    return {
        'annee_source': annee.libelle,
        'annee_cible': suivante.libelle,
        'created': len(created_ids),
        'ids': created_ids,
        **stats,
        'message': (
            f"{stats['admis']} élève(s) passent en {suivante.libelle}, "
            f"{stats['redoublants']} redoublent, "
            f"{stats['diplomes']} diplômé(s). "
            f"{stats['en_attente_examen']} élève(s) de 3ème/Terminale attendent la liste d'examen."
        ),
    }, 200
