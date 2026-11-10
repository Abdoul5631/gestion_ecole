"""Données bulletin + PDF serveur (en-tête école, T3 annuelle, signatures)."""
from collections import defaultdict
from io import BytesIO

from evaluations.models import Note


def _media_path(field):
    if not field:
        return None
    try:
        path = field.path
    except Exception:
        return None
    from pathlib import Path
    return path if Path(path).is_file() else None


def _calc_avg(note_list):
    if not note_list:
        return None
    total_v = sum(float(n.valeur) * float(n.evaluation.coefficient) for n in note_list)
    total_c = sum(float(n.evaluation.coefficient) for n in note_list)
    return round(total_v / total_c, 2) if total_c else None


def _appreciation(moy):
    if moy >= 18:
        return 'Excellent'
    if moy >= 16:
        return 'Très Bien'
    if moy >= 14:
        return 'Bien'
    if moy >= 12:
        return 'Assez Bien'
    if moy >= 10:
        return 'Passable'
    if moy >= 8:
        return 'Insuffisant'
    if moy >= 6:
        return 'Faible'
    return 'Très Faible'


def construire_bulletin(request, eleve, trimestre):
    from cours.models import ClasseMatiere as CM_model
    from eleves.models import AppelJournalier, Presence
    from scolarite.models import Inscription, ResultatExamenNational
    from scolarite.utils import est_trimestre_3, periode_annee, seuil_passage
    from evaluations.moyennes import moyennes_annuelles_eleve
    from scolarite.passage import decision_eleve, listes_examen_importees

    inscription = Inscription.objects.select_related('classe').filter(
        eleve=eleve, annee_scolaire=trimestre.annee_scolaire
    ).first()
    classe = inscription.classe if inscription else None

    if classe:
        class_cms = list(CM_model.objects.filter(classe=classe).select_related('matiere', 'enseignant'))
        cm_map = {cm.matiere_id: cm for cm in class_cms}  # par matière : un élève changé de classe garde ses notes sur une seule ligne
        class_eleve_ids = list(
            Inscription.objects.filter(
                classe=classe, annee_scolaire=trimestre.annee_scolaire
            ).values_list('eleve_id', flat=True)
        )
        nb_eleves = len(class_eleve_ids)
    else:
        class_cms, cm_map, class_eleve_ids, nb_eleves = [], {}, [], 0

    notes = Note.objects.filter(
        eleve=eleve, evaluation__trimestre_id=trimestre.id
    ).exclude(evaluation__type='EXAMEN_BLANC').select_related('evaluation__classe_matiere__matiere')

    by_cm = defaultdict(list)
    for note in notes:
        by_cm[note.evaluation.classe_matiere.matiere_id].append(note)
    for cm in class_cms:
        by_cm.setdefault(cm.matiere_id, [])

    all_class_notes = defaultdict(lambda: defaultdict(list))
    if class_eleve_ids:
        cn = Note.objects.filter(
            evaluation__trimestre_id=trimestre.id, eleve_id__in=class_eleve_ids
        ).exclude(evaluation__type='EXAMEN_BLANC').select_related('evaluation__classe_matiere')
        for n in cn:
            all_class_notes[n.evaluation.classe_matiere.matiere_id][n.eleve_id].append(n)

    disciplines = []
    total_coef = 0.0
    total_moy_coef = 0.0

    for cm_id, cm_notes in by_cm.items():
        cm = cm_map.get(cm_id) or (cm_notes[0].evaluation.classe_matiere if cm_notes else None)
        if cm is None:
            continue
        subject_coef = float(cm.coef)
        devoirs = [n for n in cm_notes if n.evaluation.type in ('DEVOIR1', 'DEVOIR2')]
        compos = [n for n in cm_notes if n.evaluation.type == 'COMPOSITION']
        devoir_avg = _calc_avg(devoirs) if devoirs else None
        comp_avg = _calc_avg(compos) if compos else None
        moy_20 = _calc_avg(cm_notes) if cm_notes else 0.0
        moy_coef = round(moy_20 * subject_coef, 2)
        total_coef += subject_coef
        total_moy_coef += moy_coef

        rang = None
        if class_eleve_ids:
            cm_notes_class = all_class_notes.get(cm_id, {})
            avgs = [(_calc_avg(cm_notes_class.get(e_id, [])) or 0.0) for e_id in class_eleve_ids]
            rang = sum(1 for a in avgs if a > moy_20) + 1

        ens = cm.enseignant
        ens_sig_url = None
        if ens and ens.signature and request:
            ens_sig_url = request.build_absolute_uri(ens.signature.url)

        disciplines.append({
            'matiere': cm.matiere.nom,
            'matiere_type': cm.matiere.type,
            'devoir': devoir_avg,
            'composition': comp_avg,
            'moy_20': moy_20,
            'coef': subject_coef,
            'moy_coef': moy_coef,
            'rang': rang,
            'appreciation': _appreciation(moy_20),
            'enseignant_signature_url': ens_sig_url,
            'enseignant_signature_path': _media_path(ens.signature) if ens else None,
        })

    type_order = {'LITTERATURE': 0, 'SCIENTIFIQUE': 1, 'AUTRES': 2}
    disciplines.sort(key=lambda x: (type_order.get(x['matiere_type'], 9), x['matiere']))
    moyenne_generale = round(total_moy_coef / total_coef, 2) if total_coef else 0.0

    rang_general = None
    stats_classe = None  # moyenne de la classe, plus forte et plus faible moyenne
    if class_eleve_ids and class_cms:
        cn_all = Note.objects.filter(
            evaluation__trimestre_id=trimestre.id, eleve_id__in=class_eleve_ids
        ).exclude(evaluation__type='EXAMEN_BLANC').select_related('evaluation__classe_matiere')
        by_eleve_cm = defaultdict(lambda: defaultdict(list))
        for n in cn_all:
            by_eleve_cm[n.eleve_id][n.evaluation.classe_matiere.matiere_id].append(n)
        all_avgs = {}
        for e_id in class_eleve_ids:
            tc, tmc = 0.0, 0.0
            for cm in class_cms:
                coef = float(cm.coef)
                avg = _calc_avg(by_eleve_cm[e_id].get(cm.matiere_id, [])) or 0.0
                tc += coef
                tmc += avg * coef
            if tc:
                all_avgs[e_id] = round(tmc / tc, 2)
        rang_general = sum(1 for a in all_avgs.values() if a > moyenne_generale) + 1
        if all_avgs:
            moys = list(all_avgs.values())
            stats_classe = {'moyenne': round(sum(moys) / len(moys), 2), 'plus_forte': max(moys), 'plus_faible': min(moys)}

    debut, fin = periode_annee(trimestre.annee_scolaire)
    pres_qs = Presence.objects.filter(eleve=eleve)
    appel_qs = AppelJournalier.objects.filter(eleve=eleve)
    if debut and fin:
        pres_qs = pres_qs.filter(date__gte=debut, date__lte=fin)
        appel_qs = appel_qs.filter(date__gte=debut, date__lte=fin)
    absences = pres_qs.filter(statut='ABSENT').count() + appel_qs.filter(statut='ABSENT').count()
    absences_justifiees = (pres_qs.filter(statut='ABSENT', justifiee=True).count()
                           + appel_qs.filter(statut='ABSENT', justifiee=True).count())
    retards = pres_qs.filter(statut='RETARD').count() + appel_qs.filter(statut='RETARD').count()

    prof_principal = inscription.classe.professeur_principal if inscription and inscription.classe else None
    professeur_principal_data = {
        'nom': prof_principal.nom if prof_principal else None,
        'prenom': prof_principal.prenom if prof_principal else None,
        'signature_url': (
            request.build_absolute_uri(prof_principal.signature.url)
            if (request and prof_principal and prof_principal.signature) else None
        ),
        'signature_path': _media_path(getattr(prof_principal, 'signature', None)),
    }

    t3 = est_trimestre_3(trimestre)
    moyennes_ann = None
    decision = None
    if t3 and trimestre.annee_scolaire:
        moyennes_ann = moyennes_annuelles_eleve(eleve, trimestre.annee_scolaire, classe=classe)
        if moyennes_ann.get('t3') is None:
            moyennes_ann['t3'] = moyenne_generale
        if inscription:
            res_map = {
                r.eleve_id: r
                for r in ResultatExamenNational.objects.filter(
                    annee_scolaire=trimestre.annee_scolaire, eleve=eleve
                )
            }
            decision = decision_eleve(
                inscription, moyennes_ann, res_map, seuil_passage(),
                listes_examen_importees(trimestre.annee_scolaire),
            )

    ecole = getattr(eleve, 'ecole', None) or getattr(getattr(request, 'user', None), 'ecole', None)
    ecole_payload = {}
    if ecole:
        ecole_payload = {
            'nom_ecole': ecole.nom_ecole,
            'ville': ecole.ville,
            'telephone': ecole.telephone,
            'email': ecole.email,
            'adresse': ecole.adresse,
            'devise': ecole.devise,
            'directeur': ecole.directeur,
            'direction_regionale': ecole.direction_regionale,
            'direction_provinciale': ecole.direction_provinciale,
            'boite_postale': ecole.boite_postale,
            'couleur_primaire': ecole.couleur_primaire,
            'logo_url': request.build_absolute_uri(ecole.logo.url) if request and ecole.logo else None,
            'signature_url': request.build_absolute_uri(ecole.signature.url) if request and ecole.signature else None,
            'tampon_url': request.build_absolute_uri(ecole.tampon.url) if request and ecole.tampon else None,
            'logo_path': _media_path(ecole.logo),
            'signature_path': _media_path(ecole.signature),
            'tampon_path': _media_path(ecole.tampon),
        }

    return {
        'eleve': {
            'id': eleve.id,
            'nom': eleve.nom,
            'prenom': eleve.prenom,
            'matricule': eleve.matricule,
            'date_naissance': eleve.date_naissance.strftime('%d/%m/%Y') if eleve.date_naissance else None,
            'lieu_naissance': eleve.lieu_naissance or None,
            'sexe': eleve.sexe or None,
            'photo_url': request.build_absolute_uri(eleve.photo.url) if request and getattr(eleve, 'photo', None) else None,
        },
        'trimestre': {
            'nom': trimestre.nom,
            'annee': trimestre.annee_scolaire.libelle,
        },
        'classe': classe.nom if classe else None,
        'nb_eleves': nb_eleves,
        'disciplines': disciplines,
        'total_coef': round(total_coef, 2),
        'total_moy_coef': round(total_moy_coef, 2),
        'moyenne_generale': moyenne_generale,
        'rang_general': rang_general,
        'stats_classe': stats_classe,
        'absences': absences,
        'absences_justifiees': absences_justifiees,
        'retards': retards,
        'professeur_principal': professeur_principal_data,
        'est_trimestre_3': t3,
        'redoublant': bool(inscription.redoublant) if inscription else False,
        'moyennes_annuelles': moyennes_ann,
        'decision': decision,
        'ecole': ecole_payload,
    }


def _fmt(val):
    if val is None:
        return '—'
    if isinstance(val, float):
        return f'{val:.2f}'
    return str(val)


def generer_bulletin_pdf(data, duplicata=None):
    """PDF A4 avec en-tête école (logo, DR/DP), notes, T3 annuelle, signatures."""
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=12 * mm, rightMargin=12 * mm,
        topMargin=10 * mm, bottomMargin=10 * mm,
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='Tiny', fontSize=8, leading=10))
    styles.add(ParagraphStyle(name='TinyR', fontSize=8, leading=10, alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name='TinyC', fontSize=8, leading=10, alignment=TA_CENTER))
    from config.couleurs import couleurs_ecole
    teintes = couleurs_ecole((data.get('ecole') or {}).get('couleur_primaire'))  # aux couleurs de l'école
    styles.add(ParagraphStyle(name='HeadC', fontSize=13, leading=16, alignment=TA_CENTER, fontName='Helvetica-Bold',
                              textColor=colors.HexColor(teintes['fonce'])))
    styles.add(ParagraphStyle(name='Bold', fontSize=9, leading=11, fontName='Helvetica-Bold'))

    ecole = data.get('ecole') or {}
    eleve = data.get('eleve') or {}
    trim = data.get('trimestre') or {}
    story = []

    left_bits = []
    if ecole.get('direction_regionale'):
        left_bits.append(f"<b>{ecole['direction_regionale']}</b>")
    if ecole.get('direction_provinciale'):
        left_bits.append(ecole['direction_provinciale'])
    left_bits.append(f"<b>{ecole.get('nom_ecole') or 'Établissement'}</b>")
    if ecole.get('ville'):
        left_bits.append(ecole['ville'])
    if ecole.get('boite_postale'):
        left_bits.append(ecole['boite_postale'])
    if ecole.get('telephone'):
        left_bits.append(f"Tél : {ecole['telephone']}")
    left = Paragraph('<br/>'.join(left_bits), styles['Tiny'])

    center_items = []
    if ecole.get('logo_path'):
        try:
            img = Image(ecole['logo_path'], width=16 * mm, height=16 * mm)
            center_items.append(img)
        except Exception:
            pass
    center_items.append(Paragraph(
        f"Année : <b>{trim.get('annee') or '—'}</b><br/><b>{trim.get('nom') or ''}</b>",
        styles['TinyC'],
    ))
    center = center_items

    right_bits = []
    if ecole.get('email'):
        right_bits.append(ecole['email'])
    if ecole.get('adresse'):
        right_bits.append(ecole['adresse'])
    if ecole.get('devise'):
        right_bits.append(f"<i>« {ecole['devise']} »</i>")
    right = Paragraph('<br/>'.join(right_bits) or '&nbsp;', styles['TinyR'])

    header = Table([[left, center, right]], colWidths=[65 * mm, 56 * mm, 55 * mm])
    header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (1, 0), (1, 0), 'CENTER'),
    ]))
    story.append(header)
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph('BULLETIN DE NOTES', styles['HeadC']))
    if duplicata:
        # mention bien visible : ce document n'est pas l'original remis à l'époque
        story.append(Spacer(1, 1.5 * mm))
        story.append(Paragraph(
            f"<font color='#b42318'><b>DUPLICATA</b> — délivré le {duplicata.get('date', '')}"
            f"{' par ' + duplicata['par'] if duplicata.get('par') else ''}</font>",
            ParagraphStyle(name='Dupl', fontSize=10, leading=13, alignment=TA_CENTER, fontName='Helvetica'),
        ))
    story.append(Spacer(1, 3 * mm))

    sexe = 'Masculin' if eleve.get('sexe') == 'M' else ('Féminin' if eleve.get('sexe') == 'F' else '—')
    info = [
        [
            Paragraph(f"<b>Prénoms :</b> {eleve.get('prenom') or '—'}", styles['Tiny']),
            Paragraph(f"<b>Nom :</b> {eleve.get('nom') or '—'}", styles['Tiny']),
            Paragraph(f"<b>Classe :</b> {data.get('classe') or '—'}", styles['Tiny']),
        ],
        [
            Paragraph(f"<b>Matricule :</b> {eleve.get('matricule') or '—'}", styles['Tiny']),
            Paragraph(f"<b>Né(e) le :</b> {eleve.get('date_naissance') or '—'}", styles['Tiny']),
            Paragraph(f"<b>Lieu :</b> {eleve.get('lieu_naissance') or '—'}", styles['Tiny']),
        ],
        [
            Paragraph(f"<b>Sexe :</b> {sexe}", styles['Tiny']),
            Paragraph(f"<b>Effectif :</b> {data.get('nb_eleves') or '—'}", styles['Tiny']),
            Paragraph(f"<b>Redoublant :</b> {'Oui' if data.get('redoublant') else 'Non'}", styles['Tiny']),
        ],
    ]
    info_t = Table(info, colWidths=[62 * mm, 57 * mm, 57 * mm])
    info_t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('BOTTOMPADDING', (0, 0), (-1, -1), 2)]))
    story.append(info_t)
    story.append(Spacer(1, 3 * mm))

    header_row = ['DISCIPLINES', 'Devoir', 'Comp.', 'Moy/20', 'Coef', 'Moy×C', 'Rang', 'Appréciations']
    rows = [header_row]
    last_type = None
    group_labels = {'LITTERATURE': 'LITTÉRATURE', 'SCIENTIFIQUE': 'SCIENCES', 'AUTRES': 'AUTRES DISCIPLINES'}
    for d in data.get('disciplines') or []:
        if d.get('matiere_type') != last_type:
            last_type = d.get('matiere_type')
            rows.append([group_labels.get(last_type, last_type or ''), '', '', '', '', '', '', ''])
        rows.append([
            d.get('matiere') or '',
            _fmt(d.get('devoir')),
            _fmt(d.get('composition')),
            _fmt(d.get('moy_20')),
            _fmt(d.get('coef')),
            _fmt(d.get('moy_coef')),
            str(d.get('rang') or '—'),
            d.get('appreciation') or '',
        ])
    rows.append(['TOTAL', '', '', '', _fmt(data.get('total_coef')), _fmt(data.get('total_moy_coef')), '', ''])
    rows.append([
        'Moyenne',
        f"{_fmt(data.get('moyenne_generale'))} /20",
        '', '', '', '',
        f"Rang {data.get('rang_general') or '—'}",
        f"Abs. {data.get('absences') or 0}"
        + (f" (dont {data['absences_justifiees']} just.)" if data.get('absences_justifiees') else '')
        + f" | Ret. {data.get('retards') or 0}",
    ])

    notes_t = Table(rows, colWidths=[42 * mm, 16 * mm, 16 * mm, 16 * mm, 12 * mm, 16 * mm, 16 * mm, 42 * mm])
    style_cmds = [
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 7.5),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#333333')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor(teintes['fonce'])),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]
    for i, row in enumerate(rows):
        if i > 0 and row[1] == '' and row[2] == '' and row[0] in group_labels.values():
            style_cmds.append(('SPAN', (0, i), (-1, i)))
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor(teintes['moyen'])))
            style_cmds.append(('FONTNAME', (0, i), (0, i), 'Helvetica-Bold'))
            style_cmds.append(('ALIGN', (0, i), (0, i), 'LEFT'))
        if row[0] in ('TOTAL', 'Moyenne'):
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor(teintes['clair'])))
            style_cmds.append(('FONTNAME', (0, i), (-1, i), 'Helvetica-Bold'))
            if row[0] == 'Moyenne':
                style_cmds.append(('SPAN', (1, i), (4, i)))
    notes_t.setStyle(TableStyle(style_cmds))
    story.append(notes_t)

    if data.get('est_trimestre_3') and data.get('moyennes_annuelles'):
        story.append(Spacer(1, 3 * mm))
        ann = data['moyennes_annuelles']
        dec = data.get('decision') or {}
        dec_txt = dec.get('libelle') or '—'
        if dec.get('detail'):
            dec_txt += f" — {dec['detail']}"
        ann_rows = [
            ['T1', 'T2', 'T3', 'Moyenne annuelle', 'Décision'],
            [_fmt(ann.get('t1')), _fmt(ann.get('t2')), _fmt(ann.get('t3')),
             f"{_fmt(ann.get('annuelle'))} /20", dec_txt],
        ]
        ann_t = Table(ann_rows, colWidths=[28 * mm, 28 * mm, 28 * mm, 40 * mm, 52 * mm])
        ann_t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#333333')),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f0f0f0')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(Paragraph('Moyennes de l’année (3e trimestre)', styles['Bold']))
        story.append(ann_t)

    story.append(Spacer(1, 5 * mm))
    pp = data.get('professeur_principal') or {}
    sig_cells = []
    for title, name, path in (
        ('Observations du conseil', '', None),
        ('Le Professeur Principal', f"{pp.get('prenom') or ''} {pp.get('nom') or ''}".strip(), pp.get('signature_path')),
        ('Le Chef d\'Établissement', ecole.get('directeur') or '', ecole.get('signature_path')),
    ):
        bits = [f"<b>{title}</b><br/>"]
        if path:
            try:
                bits.append('')
            except Exception:
                pass
        inner = [Paragraph(f"<b>{title}</b>", styles['TinyC'])]
        if path:
            try:
                inner.append(Image(path, width=28 * mm, height=12 * mm))
            except Exception:
                inner.append(Spacer(1, 12 * mm))
        else:
            inner.append(Spacer(1, 12 * mm))
        if ecole.get('tampon_path') and title.startswith('Le Chef'):
            try:
                inner.append(Image(ecole['tampon_path'], width=18 * mm, height=18 * mm))
            except Exception:
                pass
        if name:
            inner.append(Paragraph(name, styles['TinyC']))
        sig_cells.append(inner)

    sig = Table([sig_cells], colWidths=[58 * mm, 58 * mm, 60 * mm])
    sig.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor('#aaaaaa')),
        ('INNERGRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#aaaaaa')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(sig)

    doc.build(story)
    pdf = buf.getvalue()
    buf.close()
    return pdf
