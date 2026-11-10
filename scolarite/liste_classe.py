"""PDF « Liste des élèves » d'une classe : une classe = un document, prêt à imprimer ou à télécharger."""
import io
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from config.couleurs import couleurs_ecole


def _pied(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor('#666666'))
    canvas.drawString(15 * mm, 9 * mm, f"Imprimé le {date.today().strftime('%d/%m/%Y')}")
    canvas.drawRightString(A4[0] - 15 * mm, 9 * mm, f'Page {doc.page}')
    canvas.restoreState()


def pdf_liste_classe(classe, ecole, annee_libelle, lignes, prof_principal=''):
    """lignes : liste de (matricule, nom, prénom, sexe, date de naissance) déjà triée."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
        title=f'Liste {classe.nom}',
    )
    styles = getSampleStyleSheet()
    teintes = couleurs_ecole(ecole)  # aux couleurs de l'école
    fonce = colors.HexColor(teintes['fonce'])
    centre = ParagraphStyle('c', parent=styles['Normal'], alignment=1, fontSize=10, leading=13)
    ecole_s = ParagraphStyle('e', parent=centre, fontName='Helvetica-Bold', fontSize=14, leading=17, textColor=fonce)
    titre = ParagraphStyle('t', parent=centre, fontName='Helvetica-Bold', fontSize=12, leading=15, spaceBefore=6, textColor=fonce)
    cellule = ParagraphStyle('cell', parent=styles['Normal'], fontSize=9, leading=11)

    infos = [f"Année scolaire {annee_libelle}" if annee_libelle else '', f'Effectif : {len(lignes)} élève(s)']
    if prof_principal:
        infos.append(f'Professeur principal : {prof_principal}')
    contenu = [
        Paragraph(escape((ecole.nom_ecole or '').upper()), ecole_s),
        Paragraph(' · '.join(x for x in [ecole.adresse, ecole.ville, ecole.telephone] if x), centre) if (ecole.adresse or ecole.ville or ecole.telephone) else Spacer(1, 0),
        Paragraph(f'LISTE DES ÉLÈVES — {classe.nom}', titre),
        Paragraph('  |  '.join(x for x in infos if x), centre),
        Spacer(1, 8),
    ]

    donnees = [['N°', 'Matricule', 'Nom et prénom', 'Sexe', 'Né(e) le', 'Observations']]
    for n, (matricule, nom, prenom, sexe, naissance) in enumerate(lignes, 1):
        donnees.append([
            str(n), matricule or '', Paragraph(f'<b>{escape(nom or "")}</b> {escape(prenom or "")}', cellule), sexe or '',
            naissance.strftime('%d/%m/%Y') if naissance else '', '',
        ])
    if len(donnees) == 1:
        donnees.append(['', '', 'Aucun élève inscrit dans cette classe.', '', '', ''])
    table = Table(donnees, colWidths=[10 * mm, 26 * mm, 62 * mm, 11 * mm, 24 * mm, 47 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), fonce), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('ALIGN', (2, 1), (2, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#999999')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor(teintes['clair'])]),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    contenu.append(table)
    doc.build(contenu, onFirstPage=_pied, onLaterPages=_pied)
    return buf.getvalue()
