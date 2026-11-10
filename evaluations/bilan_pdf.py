"""PDF du bilan pédagogique, avec l'en-tête officiel de l'école (mêmes chiffres que l'écran)."""
import io
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from config.couleurs import couleurs_ecole


def _pct(v):
    return '—' if v is None else f"{str(v).replace('.', ',')} %"


def _n(v):
    return '—' if v is None else str(v).replace('.', ',')


def _pied(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor('#666666'))
    canvas.drawString(15 * mm, 9 * mm, f"Imprimé le {date.today().strftime('%d/%m/%Y')}")
    canvas.drawRightString(A4[0] - 15 * mm, 9 * mm, f'Page {doc.page}')
    canvas.restoreState()


def pdf_bilan(bilan, ecole):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
                            title='Bilan pédagogique')
    styles = getSampleStyleSheet()
    teintes = couleurs_ecole(ecole)
    fonce = colors.HexColor(teintes['fonce'])
    centre = ParagraphStyle('c', parent=styles['Normal'], alignment=1, fontSize=10, leading=13)
    ecole_s = ParagraphStyle('e', parent=centre, fontName='Helvetica-Bold', fontSize=15, leading=18, textColor=fonce)
    titre = ParagraphStyle('t', parent=centre, fontName='Helvetica-Bold', fontSize=13, leading=16, spaceBefore=8, textColor=fonce)
    section = ParagraphStyle('s', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=11, leading=14, spaceBefore=12, spaceAfter=4, textColor=fonce)
    cellule = ParagraphStyle('cell', parent=styles['Normal'], fontSize=8.5, leading=10.5)

    perimetre = bilan['classe_choisie']['nom'] if bilan.get('classe_choisie') else "Tout l'établissement"
    contenu = [Paragraph(escape((ecole.nom_ecole or '').upper()), ecole_s)]
    coordonnees = ' · '.join(x for x in [ecole.adresse, ecole.ville, ecole.telephone] if x)
    if coordonnees:
        contenu.append(Paragraph(escape(coordonnees), centre))
    contenu += [Paragraph('BILAN PÉDAGOGIQUE', titre),
                Paragraph(escape(f"{perimetre} — {bilan['periode']['nom']} — année scolaire {bilan['annee']['libelle']}"), centre),
                Spacer(1, 6)]

    def tableau(entetes, lignes, largeurs, alignements=None):
        donnees = [entetes] + (lignes or [['Aucune donnée pour cette période.'] + [''] * (len(entetes) - 1)])
        t = Table(donnees, colWidths=[w * mm for w in largeurs], repeatRows=1)
        style = [('BACKGROUND', (0, 0), (-1, 0), fonce), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                 ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8.5),
                 ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#999999')), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                 ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor(teintes['clair'])]),
                 ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3)]
        for col in (alignements or []):
            style.append(('ALIGN', (col, 0), (col, -1), 'RIGHT'))
        t.setStyle(TableStyle(style))
        return t

    e = bilan['ecole']
    contenu.append(Paragraph('Chiffres clés', section))
    cles = [['Taux de réussite', _pct(e['taux_reussite']), f"{e['reussis']} élève(s) ≥ {_n(bilan['seuil'])}/20"],
            ['Moyenne', f"{_n(e['moyenne'])} / 20", f"de {_n(e['plus_faible'])} à {_n(e['meilleure'])}"],
            ['Élèves évalués', str(e['effectif']), f"sur {e['inscrits']} inscrits ({e['sans_note']} sans note)"]]
    if bilan.get('passage'):
        p = bilan['passage']
        cles.append(['Passage en classe supérieure', _pct(p['taux']), f"{p['admis']} admis · {p['redoublent']} redoublent (hors 3ème et Terminale)"])
    contenu.append(tableau(['Indicateur', 'Valeur', 'Détail'], cles, [55, 30, 95]))

    if bilan.get('examens'):
        contenu.append(Paragraph('Réussite aux examens nationaux', section))
        lignes = []
        for x in bilan['examens']:
            lignes.append([x['libelle'], x['annee'], str(x['candidats']),
                           _n(x['admis']) if x['liste_saisie'] else 'liste non saisie', _pct(x['taux_reussite'])])
        contenu.append(tableau(['Examen', 'Année', 'Candidats', 'Admis', 'Réussite'], lignes, [50, 30, 30, 40, 30], [2, 3, 4]))
        histo = [f"{h['annee']} : {_pct(h['taux_reussite'])} ({h['admis']}/{h['candidats']})" for x in bilan['examens'] for h in x['historique']]
        if histo:
            contenu.append(Paragraph('Années précédentes — ' + ' ; '.join(histo), cellule))

    contenu.append(Paragraph('Résultats par classe', section))
    contenu.append(tableau(['Classe', 'Évalués', 'Moyenne', 'Réussite', 'Meilleur élève'],
                           [[c['classe'], f"{c['effectif']} / {c['inscrits']}", _n(c['moyenne']), _pct(c['taux_reussite']),
                             Paragraph(escape(c['meilleur_eleve']), cellule)] for c in bilan['classes']],
                           [40, 25, 25, 25, 65], [1, 2, 3]))

    contenu.append(Paragraph('Résultats par matière', section))
    contenu.append(tableau(['Matière', 'Moyenne', 'Réussite', 'Notes'],
                           [[m['matiere'], _n(m['moyenne']), _pct(m['taux_reussite']), str(m['effectif'])] for m in bilan['matieres']],
                           [70, 30, 30, 25], [1, 2, 3]))

    contenu.append(Paragraph('Garçons et filles', section))
    contenu.append(tableau(['', 'Évalués', 'Moyenne', 'Réussite'],
                           [[nom, str(v['effectif']), _n(v['moyenne']), _pct(v['taux_reussite'])] for nom, v in bilan['genre'].items()],
                           [50, 30, 30, 30], [1, 2, 3]))

    contenu.append(Paragraph('Les 10 meilleurs élèves', section))
    contenu.append(tableau(['#', 'Élève', 'Classe', 'Moyenne'],
                           [[str(i), Paragraph(escape(x['nom']), cellule), x['classe'], _n(x['moyenne'])] for i, x in enumerate(bilan['meilleurs'], 1)],
                           [10, 80, 40, 25], [3]))
    contenu.append(Paragraph('Élèves à accompagner (sous le seuil de passage)', section))
    contenu.append(tableau(['Élève', 'Classe', 'Moyenne'],
                           [[Paragraph(escape(x['nom']), cellule), x['classe'], _n(x['moyenne'])] for x in bilan['a_encourager']],
                           [90, 45, 25], [2]))

    contenu += [Spacer(1, 28), Table([['Le directeur', ''], ['(signature et cachet)', '']], colWidths=[90 * mm, 90 * mm],
                                     style=TableStyle([('ALIGN', (0, 0), (0, -1), 'CENTER'), ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold')]))]
    doc.build(contenu, onFirstPage=_pied, onLaterPages=_pied)
    return buf.getvalue()
