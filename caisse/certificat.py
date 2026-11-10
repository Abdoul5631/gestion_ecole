"""Certificat de non redevance : atteste qu'un élève ne doit plus rien à l'école.

Délivré seulement quand TOUTES les scolarités de l'élève (année en cours et années passées) sont soldées.
"""
import io
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from config.couleurs import couleurs_ecole

from .models import DossierScolarite


def fmt_fcfa(n):
    return f"{int(n or 0):,}".replace(',', ' ') + ' FCFA'


def restes_a_payer(eleve):
    """Scolarités non soldées de l'élève, toutes années confondues : [(libellé d'année, reste)]."""
    dossiers = DossierScolarite.objects.filter(inscription__eleve=eleve).select_related('inscription__annee_scolaire')
    restes = [(d.inscription.annee_scolaire.libelle if d.inscription.annee_scolaire else '', int(d.reste)) for d in dossiers]
    return [(annee, reste) for annee, reste in restes if reste > 0]


def verifier(dossier):
    """None si le certificat peut être délivré, sinon la raison du refus (en français, pour le comptable)."""
    if not (dossier.montant_du or 0):
        return ("Aucun montant de scolarité n'est défini pour cet élève : fixez d'abord les frais de sa classe, "
                "puis encaissez-les avant de délivrer le certificat.")
    restes = restes_a_payer(dossier.inscription.eleve)
    if restes:
        detail = ' ; '.join(f"{annee or 'année inconnue'} : {fmt_fcfa(reste)}" for annee, reste in restes)
        return f"Certificat impossible : l'élève doit encore de l'argent à l'école ({detail})."
    return None


def _pied(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(colors.HexColor('#666666'))
    canvas.drawString(15 * mm, 9 * mm, f"Délivré le {date.today().strftime('%d/%m/%Y')}")
    canvas.restoreState()


def pdf_certificat(dossier, ecole, comptable, signature_chemin=None, numero=''):
    inscription = dossier.inscription
    eleve = inscription.eleve
    annee = inscription.annee_scolaire.libelle if inscription.annee_scolaire else ''
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=16 * mm,
                            title=f'Certificat de non redevance — {eleve.nom} {eleve.prenom}')
    styles = getSampleStyleSheet()
    fonce = colors.HexColor(couleurs_ecole(ecole)['fonce'])
    centre = ParagraphStyle('c', parent=styles['Normal'], alignment=1, fontSize=10, leading=13)
    ecole_s = ParagraphStyle('e', parent=centre, fontName='Helvetica-Bold', fontSize=16, leading=19, textColor=fonce)
    titre = ParagraphStyle('t', parent=centre, fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=fonce, spaceBefore=26, spaceAfter=22)
    texte = ParagraphStyle('x', parent=styles['Normal'], fontSize=12, leading=20, alignment=4)
    petit = ParagraphStyle('p', parent=styles['Normal'], fontSize=10, leading=13, alignment=1)

    contenu = [Paragraph(escape((ecole.nom_ecole or '').upper()), ecole_s)]
    coordonnees = ' · '.join(x for x in [ecole.adresse, ecole.ville, ecole.telephone] if x)
    if coordonnees:
        contenu.append(Paragraph(escape(coordonnees), centre))
    contenu.append(Paragraph('CERTIFICAT DE NON REDEVANCE', titre))
    if numero:
        contenu.append(Paragraph(f'N° {escape(numero)}', ParagraphStyle('n', parent=centre, fontName='Helvetica-Bold', fontSize=11, spaceAfter=14)))

    nom = f'{escape(eleve.nom or "")} {escape(eleve.prenom or "")}'.strip()
    matricule = f" (matricule <b>{escape(eleve.matricule)}</b>)" if eleve.matricule else ''
    classe = f", élève de la classe <b>{escape(inscription.classe.nom)}</b>" if inscription.classe else ''
    annee_txt = f" au titre de l'année scolaire <b>{escape(annee)}</b>" if annee else ''
    contenu += [
        Paragraph(f"Nous, direction de <b>{escape(ecole.nom_ecole or '')}</b>, certifions que l'élève <b>{nom}</b>{matricule}{classe}, "
                  f"est à jour de tous ses paiements{annee_txt}.", texte),
        Spacer(1, 8),
        Paragraph(f"Scolarité totale : <b>{fmt_fcfa(dossier.montant_du)}</b> — montant réglé : <b>{fmt_fcfa(dossier.montant_paye)}</b> — "
                  "reste à payer : <b>0 FCFA</b>.", texte),
        Spacer(1, 8),
        Paragraph("L'intéressé(e) <b>n'est redevable d'aucune somme</b> envers l'établissement. "
                  "Le présent certificat lui est délivré pour servir et valoir ce que de droit.", texte),
        Spacer(1, 30),
    ]

    signature = Spacer(1, 40)
    if signature_chemin:
        try:
            signature = Image(signature_chemin, width=40 * mm, height=18 * mm, kind='proportional')
        except Exception:
            pass
    lieu = f"Fait à {ecole.ville}, le" if ecole.ville else 'Fait le'
    nom_comptable = f'{comptable.first_name} {comptable.last_name}'.strip() or comptable.username
    bloc = Table([[Paragraph(f'{escape(lieu)} {date.today().strftime("%d/%m/%Y")}', petit), ''],
                  [Paragraph('<b>Le comptable</b>', petit), Paragraph("<b>Le directeur</b>", petit)],
                  [signature, Spacer(1, 40)],
                  [Paragraph(escape(nom_comptable), petit), Paragraph("(signature et cachet)", petit)]],
                 colWidths=[85 * mm, 85 * mm])
    bloc.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('SPAN', (0, 0), (1, 0))]))
    contenu.append(bloc)
    doc.build(contenu, onFirstPage=_pied, onLaterPages=_pied)
    return buf.getvalue()
