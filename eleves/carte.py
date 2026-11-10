"""Carte scolaire (classes d'examen) : PDF au format carte bancaire, plusieurs modèles au choix du directeur.

Modèles : classique, moderne, officiel (couleurs du Burkina Faso), portrait.
- une carte : page de la taille de la carte ;
- une classe : feuilles A4 avec traits de découpe (autant de cartes que la page peut en contenir) ;
- aperçu PNG : le même dessin que le PDF, rastérisé (WYSIWYG).
"""
import io
import re
import threading
from dataclasses import dataclass

from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

LONG = 85.6 * mm
COURT = 54.0 * mm
COULEUR_DEFAUT = '#1976d2'
ROUGE_BF, VERT_BF, JAUNE_BF = HexColor('#EF2B2D'), HexColor('#009E49'), HexColor('#FCD116')


@dataclass(frozen=True)
class Modele:
    code: str
    nom: str
    description: str
    largeur: float
    hauteur: float


MODELES = {
    'classique': Modele('classique', 'Classique', "Bandeau de couleur avec le logo et le nom de l'école, photo à gauche.", LONG, COURT),
    'moderne': Modele('moderne', 'Moderne', 'Bande de couleur verticale, grande photo arrondie, nom bien en vue.', LONG, COURT),
    'officiel': Modele('officiel', 'Officiel', 'En-tête « Burkina Faso » avec les couleurs nationales, sobre et institutionnel.', LONG, COURT),
    'portrait': Modele('portrait', 'Portrait', 'Format vertical à porter autour du cou, grande photo centrée.', COURT, LONG),
}
CODES = tuple(MODELES)


# ─── Utilitaires ─────────────────────────────────────────────────────────────────────────────────

def couleur_valide(valeur):
    return bool(re.fullmatch(r'#[0-9a-fA-F]{6}', valeur or ''))


def reglages_carte(ecole):
    """(modèle, couleur) enregistrés pour l'école, avec valeurs par défaut."""
    modele = getattr(ecole, 'modele_carte', '') or 'classique'
    if modele not in MODELES:
        modele = 'classique'
    couleur = getattr(ecole, 'couleur_carte', '') or getattr(ecole, 'couleur_primaire', '') or COULEUR_DEFAUT
    return modele, (couleur if couleur_valide(couleur) else COULEUR_DEFAUT)


def _teinte(couleur, part):
    """Mélange avec du blanc : part=1 couleur pure, part=0 blanc."""
    return Color(1 - (1 - couleur.red) * part, 1 - (1 - couleur.green) * part, 1 - (1 - couleur.blue) * part)


def _texte_sur(couleur):
    """Blanc ou noir selon la luminosité du fond, pour rester lisible."""
    lum = 0.299 * couleur.red + 0.587 * couleur.green + 0.114 * couleur.blue
    return black if lum > 0.68 else white


def _image(champ, recadrage=None):
    """Ouvre une image d'un champ ImageField (None si absente / illisible). recadrage = rapport L/H à remplir."""
    if not champ:
        return None
    try:
        from PIL import Image
        img = Image.open(champ.path)
        img.load()
        if recadrage and min(img.size) < 40:  # image factice / illisible : on affiche le cadre « PHOTO »
            return None
        # on garde la transparence (logo, tampon, signature en PNG)
        img = img.convert('RGBA') if (img.mode in ('RGBA', 'LA', 'P') or 'transparency' in img.info) else img.convert('RGB')
        if recadrage:
            w, h = img.size
            if w / h > recadrage:
                nw = int(h * recadrage)
                x0 = (w - nw) // 2
                img = img.crop((x0, 0, x0 + nw, h))
            else:
                nh = int(w / recadrage)
                img = img.crop((0, 0, w, nh))
        return ImageReader(img)
    except Exception:
        return None


def _ajuste(c, texte, police, taille, largeur_max, mini=4.2):
    """Réduit la police jusqu'à ce que le texte tienne ; tronque en dernier recours. Retourne le texte à dessiner."""
    texte = str(texte or '')
    while taille > mini and c.stringWidth(texte, police, taille) > largeur_max:
        taille -= 0.25
    c.setFont(police, taille)
    if c.stringWidth(texte, police, taille) > largeur_max:
        while len(texte) > 1 and c.stringWidth(texte + '…', police, taille) > largeur_max:
            texte = texte[:-1]
        texte += '…'
    return texte


def _date(d):
    return d.strftime('%d/%m/%Y') if d else ''


def _naissance(eleve):
    lieu = f" à {eleve.lieu_naissance}" if getattr(eleve, 'lieu_naissance', '') else ''
    return f"{_date(eleve.date_naissance)}{lieu}".strip()


def _rect_arrondi(c, x, y, w, h, r, fill=1, stroke=0):
    c.roundRect(x, y, w, h, r, stroke=stroke, fill=fill)


def _photo(c, ctx, x, y, w, h, rayon=0, cadre=None):
    """Photo (ou cadre « PHOTO ») dans un rectangle, avec coins arrondis éventuels."""
    photo = ctx['assets'].get('photo')
    c.saveState()
    if photo:
        p = c.beginPath()
        p.roundRect(x, y, w, h, rayon)
        c.clipPath(p, stroke=0, fill=0)
        c.drawImage(photo, x, y, w, h, mask='auto')
    else:
        c.setFillColor(HexColor('#eeeeee'))
        _rect_arrondi(c, x, y, w, h, rayon)
        c.setFillColor(HexColor('#9e9e9e'))
        c.setFont('Helvetica', 6)
        c.drawCentredString(x + w / 2, y + h / 2 - 1, 'PHOTO')
    c.restoreState()
    if cadre is not None:
        c.setStrokeColor(cadre)
        c.setLineWidth(0.5)
        c.roundRect(x, y, w, h, rayon, stroke=1, fill=0)


def _signature(c, ctx, droite, bas, largeur=26 * mm, sombre=True):
    """Mention « Le Chef d'établissement » avec tampon et signature (images de l'école si renseignées)."""
    a = ctx['assets']
    c.setFillColor(black if sombre else white)
    c.setFont('Helvetica', 4.4)
    c.drawCentredString(droite - largeur / 2, bas + 6.9 * mm, "Le Chef d'établissement")
    if a.get('tampon'):
        c.drawImage(a['tampon'], droite - largeur + 0.5 * mm, bas + 0.4 * mm, 11 * mm, 6 * mm, preserveAspectRatio=True, mask='auto')
    if a.get('signature'):
        c.drawImage(a['signature'], droite - 14 * mm, bas + 0.4 * mm, 14 * mm, 6 * mm, preserveAspectRatio=True, mask='auto')


def _contact(ecole):
    return ' · '.join(x for x in [(getattr(ecole, 'ville', '') or '').strip(), (getattr(ecole, 'telephone', '') or '').strip()] if x)


def _lignes_identite(c, ctx, x, y_base, largeur, pas, lignes):
    """Étiquette grise au-dessus de la valeur, une ligne par entrée (étiquette, valeur, gras)."""
    for etiquette, valeur, gras in lignes:
        c.setFillColor(HexColor('#757575'))
        c.setFont('Helvetica', 4.6)
        c.drawString(x, y_base + 7.2, etiquette)
        c.setFillColor(black)
        police = 'Helvetica-Bold' if gras else 'Helvetica'
        c.drawString(x, y_base, _ajuste(c, valeur or '—', police, 7.2, largeur))
        y_base -= pas


# ─── Modèle 1 : classique ───────────────────────────────────────────────────────────────────────

def _classique(c, ctx):
    L, H = LONG, COURT
    col, e, ecole = ctx['couleur'], ctx['eleve'], ctx['ecole']
    c.setFillColor(white)
    _rect_arrondi(c, 0, 0, L, H, 3 * mm)
    c.setStrokeColor(col)
    c.setLineWidth(0.8)
    c.roundRect(0.4 * mm, 0.4 * mm, L - 0.8 * mm, H - 0.8 * mm, 2.8 * mm, stroke=1, fill=0)

    haut = 12 * mm
    c.setFillColor(col)
    p = c.beginPath()
    p.roundRect(0.4 * mm, H - haut, L - 0.8 * mm, haut - 0.4 * mm, 2.8 * mm)
    c.drawPath(p, stroke=0, fill=1)
    c.rect(0.4 * mm, H - haut, L - 0.8 * mm, 3 * mm, stroke=0, fill=1)

    x_txt = 3 * mm
    if ctx['assets'].get('logo'):
        c.setFillColor(white)
        _rect_arrondi(c, 2.5 * mm, H - 10.5 * mm, 8 * mm, 8 * mm, 1 * mm)
        c.drawImage(ctx['assets']['logo'], 3 * mm, H - 10 * mm, 7 * mm, 7 * mm, preserveAspectRatio=True, mask='auto')
        x_txt = 12 * mm
    c.setFillColor(_texte_sur(col))
    c.drawString(x_txt, H - 5.2 * mm, _ajuste(c, (ecole.nom_ecole or '').upper(), 'Helvetica-Bold', 8, L - x_txt - 3 * mm))
    c.setFont('Helvetica', 5.5)
    c.drawString(x_txt, H - 9.4 * mm, f"CARTE SCOLAIRE  ·  Année scolaire {ctx['annee']}")

    px, py = 3 * mm, 13 * mm
    _photo(c, ctx, px, py, 20 * mm, 26 * mm, 0, HexColor('#9e9e9e'))
    tx = px + 20 * mm + 3.5 * mm
    _lignes_identite(c, ctx, tx, H - 18.2 * mm, L - tx - 3 * mm, 5.6 * mm, [
        ('Nom', (e.nom or '').upper(), True), ('Prénom(s)', (e.prenom or '').title(), True),
        ('Né(e) le', _naissance(e), False), ('Classe', getattr(ctx['classe'], 'nom', ''), False), ('Matricule', e.matricule, True),
    ])

    c.setStrokeColor(HexColor('#e0e0e0'))
    c.setLineWidth(0.3)
    c.line(3 * mm, 9.5 * mm, L - 3 * mm, 9.5 * mm)
    c.setFillColor(HexColor('#616161'))
    c.setFont('Helvetica', 4.6)
    c.drawString(3 * mm, 6.3 * mm, f"Valable pour l'année {ctx['annee']}")
    if _contact(ecole):
        c.drawString(3 * mm, 3.6 * mm, _ajuste(c, _contact(ecole), 'Helvetica', 4.6, 42 * mm))
    _signature(c, ctx, L - 3 * mm, 0.2 * mm)


# ─── Modèle 2 : moderne ─────────────────────────────────────────────────────────────────────────

def _moderne(c, ctx):
    L, H = LONG, COURT
    col, e, ecole = ctx['couleur'], ctx['eleve'], ctx['ecole']
    clair = _teinte(col, 0.12)
    c.saveState()
    p = c.beginPath()
    p.roundRect(0, 0, L, H, 3 * mm)
    c.clipPath(p, stroke=0, fill=0)
    c.setFillColor(white)
    c.rect(0, 0, L, H, stroke=0, fill=1)
    # décor discret en haut à droite
    c.setFillColor(clair)
    c.circle(L - 4 * mm, H - 3 * mm, 17 * mm, stroke=0, fill=1)
    c.setFillColor(_teinte(col, 0.22))
    c.circle(L - 4 * mm, H - 3 * mm, 10 * mm, stroke=0, fill=1)
    # bande verticale de couleur
    c.setFillColor(col)
    c.rect(0, 0, 17 * mm, H, stroke=0, fill=1)
    c.restoreState()
    c.setStrokeColor(HexColor('#d0d0d0'))
    c.setLineWidth(0.4)
    c.roundRect(0.2 * mm, 0.2 * mm, L - 0.4 * mm, H - 0.4 * mm, 2.9 * mm, stroke=1, fill=0)

    texte = _texte_sur(col)
    if ctx['assets'].get('logo'):
        c.setFillColor(white)
        c.circle(8.5 * mm, H - 9.5 * mm, 5.6 * mm, stroke=0, fill=1)
        c.drawImage(ctx['assets']['logo'], 4.2 * mm, H - 13.8 * mm, 8.6 * mm, 8.6 * mm, preserveAspectRatio=True, mask='auto')
    c.saveState()
    c.translate(10.6 * mm, 4 * mm)
    c.rotate(90)
    c.setFillColor(texte)
    c.setFont('Helvetica-Bold', 7)
    c.drawString(0, 0, 'CARTE SCOLAIRE')
    c.restoreState()

    xp = 21 * mm
    _photo(c, ctx, xp, 14 * mm, 22 * mm, 28 * mm, 2.2 * mm, col)
    xt = xp + 22 * mm + 3.5 * mm
    larg = L - xt - 3 * mm
    c.setFillColor(col)
    c.drawString(xt, H - 6.2 * mm, _ajuste(c, ecole.nom_ecole, 'Helvetica-Bold', 7.2, larg))
    c.setFillColor(HexColor('#757575'))
    c.setFont('Helvetica', 4.6)
    c.drawString(xt, H - 9.2 * mm, _ajuste(c, _contact(ecole), 'Helvetica', 4.6, larg))
    c.setFillColor(black)
    c.drawString(xt, H - 17 * mm, _ajuste(c, (e.nom or '').upper(), 'Helvetica-Bold', 11, larg, mini=6))
    c.setFillColor(HexColor('#424242'))
    c.drawString(xt, H - 22 * mm, _ajuste(c, (e.prenom or '').title(), 'Helvetica', 8.6, larg, mini=5.5))
    infos = [('Né(e) le', _naissance(e)), ('Classe', getattr(ctx['classe'], 'nom', '')), ('Matricule', e.matricule)]
    y = H - 28.6 * mm
    for etiquette, valeur in infos:
        c.setFillColor(HexColor('#757575'))
        c.setFont('Helvetica', 4.8)
        c.drawString(xt, y, etiquette)
        c.setFillColor(black)
        c.drawString(xt + 12 * mm, y, _ajuste(c, valeur or '—', 'Helvetica-Bold', 6.6, larg - 12 * mm))
        y -= 4.4 * mm

    c.setFillColor(col)
    _rect_arrondi(c, xp, 5 * mm, 24 * mm, 5 * mm, 2.5 * mm)
    c.setFillColor(_texte_sur(col))
    c.setFont('Helvetica-Bold', 5.2)
    c.drawCentredString(xp + 12 * mm, 6.6 * mm, f"Année {ctx['annee']}")
    _signature(c, ctx, L - 3 * mm, 0.4 * mm, 26 * mm)


# ─── Modèle 3 : officiel (Burkina Faso) ─────────────────────────────────────────────────────────

def _etoile(c, cx, cy, r, couleur):
    """Étoile à cinq branches (emblème du drapeau)."""
    import math
    pts = []
    for i in range(10):
        ang = math.pi / 2 + i * math.pi / 5
        rayon = r if i % 2 == 0 else r * 0.4
        pts.append((cx + rayon * math.cos(ang), cy + rayon * math.sin(ang)))
    p = c.beginPath()
    p.moveTo(*pts[0])
    for pt in pts[1:]:
        p.lineTo(*pt)
    p.close()
    c.setFillColor(couleur)
    c.drawPath(p, stroke=0, fill=1)


def _officiel(c, ctx):
    L, H = LONG, COURT
    col, e, ecole = ctx['couleur'], ctx['eleve'], ctx['ecole']
    c.saveState()
    p = c.beginPath()
    p.roundRect(0, 0, L, H, 3 * mm)
    c.clipPath(p, stroke=0, fill=0)
    c.setFillColor(white)
    c.rect(0, 0, L, H, stroke=0, fill=1)
    c.setFillColor(ROUGE_BF)
    c.rect(0, H - 1.8 * mm, L, 1.8 * mm, stroke=0, fill=1)
    c.setFillColor(VERT_BF)
    c.rect(0, H - 3.6 * mm, L, 1.8 * mm, stroke=0, fill=1)
    c.restoreState()
    c.setStrokeColor(HexColor('#bdbdbd'))
    c.setLineWidth(0.4)
    c.roundRect(0.2 * mm, 0.2 * mm, L - 0.4 * mm, H - 0.4 * mm, 2.9 * mm, stroke=1, fill=0)

    # en-tête national
    _etoile(c, L / 2 - 16 * mm, H - 8.2 * mm, 1.6 * mm, JAUNE_BF)
    c.setFillColor(black)
    c.setFont('Helvetica-Bold', 7)
    c.drawCentredString(L / 2, H - 9.4 * mm, 'BURKINA FASO')
    c.setFillColor(HexColor('#616161'))
    c.setFont('Helvetica-Oblique', 4.8)
    c.drawCentredString(L / 2, H - 12.2 * mm, 'Unité  ·  Progrès  ·  Justice')
    if ctx['assets'].get('logo'):
        c.drawImage(ctx['assets']['logo'], 3 * mm, H - 14 * mm, 9.5 * mm, 9.5 * mm, preserveAspectRatio=True, mask='auto')
    c.setFillColor(col)
    c.setFont('Helvetica-Bold', 6.6)
    c.drawCentredString(L / 2, H - 16.3 * mm, _ajuste(c, (ecole.nom_ecole or '').upper(), 'Helvetica-Bold', 6.6, L - 28 * mm))
    c.setStrokeColor(col)
    c.setLineWidth(0.5)
    c.line(L / 2 - 17 * mm, H - 17.6 * mm, L / 2 + 17 * mm, H - 17.6 * mm)
    c.setFillColor(black)
    c.setFont('Helvetica-Bold', 5.6)
    c.drawCentredString(L / 2, H - 20.4 * mm, f"CARTE SCOLAIRE — ANNÉE {ctx['annee']}")

    px, py = 3 * mm, 4.5 * mm
    _photo(c, ctx, px, py, 19 * mm, 24 * mm, 0, HexColor('#9e9e9e'))
    tx = px + 19 * mm + 3.5 * mm
    larg = L - tx - 3 * mm
    y = H - 27.6 * mm
    for etiquette, valeur, gras in [
        ('Nom', (e.nom or '').upper(), True), ('Prénom(s)', (e.prenom or '').title(), True),
        ('Né(e) le', _naissance(e), False), ('Classe', getattr(ctx['classe'], 'nom', ''), False),
    ]:
        c.setFillColor(HexColor('#757575'))
        c.setFont('Helvetica', 4.6)
        c.drawString(tx, y + 6.6, etiquette)
        c.setFillColor(black)
        c.drawString(tx, y, _ajuste(c, valeur or '—', 'Helvetica-Bold' if gras else 'Helvetica', 6.9, larg))
        c.setStrokeColor(HexColor('#e0e0e0'))
        c.setLineWidth(0.3)
        c.line(tx, y - 1.2 * mm, tx + larg, y - 1.2 * mm)
        y -= 4.9 * mm
    c.setFillColor(HexColor('#757575'))
    c.setFont('Helvetica', 4.6)
    c.drawString(tx, y + 6.6, 'Matricule')
    c.setFillColor(col)
    c.drawString(tx, y, _ajuste(c, e.matricule, 'Helvetica-Bold', 8, larg - 26 * mm))
    _signature(c, ctx, L - 3 * mm, 0.6 * mm, 24 * mm)


# ─── Modèle 4 : portrait ────────────────────────────────────────────────────────────────────────

def _portrait(c, ctx):
    L, H = COURT, LONG
    col, e, ecole = ctx['couleur'], ctx['eleve'], ctx['ecole']
    c.saveState()
    p = c.beginPath()
    p.roundRect(0, 0, L, H, 3 * mm)
    c.clipPath(p, stroke=0, fill=0)
    c.setFillColor(white)
    c.rect(0, 0, L, H, stroke=0, fill=1)
    c.setFillColor(col)
    c.rect(0, H - 25 * mm, L, 25 * mm, stroke=0, fill=1)
    c.ellipse(-8 * mm, H - 32 * mm, L + 8 * mm, H - 18 * mm, stroke=0, fill=1)
    c.restoreState()
    c.setStrokeColor(HexColor('#d0d0d0'))
    c.setLineWidth(0.4)
    c.roundRect(0.2 * mm, 0.2 * mm, L - 0.4 * mm, H - 0.4 * mm, 2.9 * mm, stroke=1, fill=0)

    texte = _texte_sur(col)
    y_nom_ecole = H - 12 * mm
    if ctx['assets'].get('logo'):
        c.setFillColor(white)
        c.circle(L / 2, H - 8 * mm, 5.2 * mm, stroke=0, fill=1)
        c.drawImage(ctx['assets']['logo'], L / 2 - 4 * mm, H - 12 * mm, 8 * mm, 8 * mm, preserveAspectRatio=True, mask='auto')
        y_nom_ecole = H - 16.4 * mm
    c.setFillColor(texte)
    c.drawCentredString(L / 2, y_nom_ecole, _ajuste(c, (ecole.nom_ecole or '').upper(), 'Helvetica-Bold', 6.4, L - 8 * mm))
    c.setFont('Helvetica', 4.8)
    c.drawCentredString(L / 2, y_nom_ecole - 3.2 * mm, 'CARTE SCOLAIRE')

    # photo qui chevauche l'en-tête
    pw, ph = 23 * mm, 29 * mm
    px, py = (L - pw) / 2, H - 23 * mm - ph
    c.setFillColor(white)
    _rect_arrondi(c, px - 1 * mm, py - 1 * mm, pw + 2 * mm, ph + 2 * mm, 2.4 * mm)
    _photo(c, ctx, px, py, pw, ph, 1.8 * mm, _teinte(col, 0.6))

    y = py - 5 * mm
    c.setFillColor(black)
    c.drawCentredString(L / 2, y, _ajuste(c, (e.nom or '').upper(), 'Helvetica-Bold', 9.4, L - 6 * mm, mini=5.5))
    c.setFillColor(HexColor('#424242'))
    c.drawCentredString(L / 2, y - 4.4 * mm, _ajuste(c, (e.prenom or '').title(), 'Helvetica', 7.6, L - 6 * mm, mini=5))
    c.setFillColor(_teinte(col, 0.14))
    _rect_arrondi(c, L / 2 - 14 * mm, y - 10.6 * mm, 28 * mm, 4.4 * mm, 2.2 * mm)
    c.setFillColor(HexColor('#212121'))
    c.setFont('Helvetica-Bold', 5.6)
    c.drawCentredString(L / 2, y - 9.3 * mm, _ajuste(c, getattr(ctx['classe'], 'nom', ''), 'Helvetica-Bold', 5.6, 26 * mm))
    c.setFont('Helvetica', 5)
    c.setFillColor(HexColor('#616161'))
    c.drawCentredString(L / 2, y - 14.4 * mm, f"Né(e) le {_naissance(e)}"[:44])
    c.setFillColor(col)
    c.drawCentredString(L / 2, y - 18.2 * mm, _ajuste(c, f"Matricule {e.matricule}", 'Helvetica-Bold', 6.2, L - 6 * mm))

    c.setStrokeColor(HexColor('#e0e0e0'))
    c.setLineWidth(0.3)
    c.line(3 * mm, 8.4 * mm, L - 3 * mm, 8.4 * mm)
    c.setFillColor(HexColor('#616161'))
    c.setFont('Helvetica', 4.4)
    c.drawString(3 * mm, 5.2 * mm, f"Année {ctx['annee']}")
    if _contact(ecole):
        c.drawString(3 * mm, 2.6 * mm, _ajuste(c, _contact(ecole), 'Helvetica', 4.2, 26 * mm))
    _signature(c, ctx, L - 2.5 * mm, 0.1 * mm, 22 * mm)


DESSINS = {'classique': _classique, 'moderne': _moderne, 'officiel': _officiel, 'portrait': _portrait}


# ─── Assemblage ──────────────────────────────────────────────────────────────────────────────────

def _assets(eleve, ecole, cache):
    if 'logo' not in cache:
        cache['logo'] = _image(getattr(ecole, 'logo', None))
        cache['tampon'] = _image(getattr(ecole, 'tampon', None))
        cache['signature'] = _image(getattr(ecole, 'signature', None))
    return {**cache, 'photo': _image(eleve.photo, recadrage=(20 / 26))}


def _contexte(eleve, classe, ecole, annee, cache, couleur):
    return {'eleve': eleve, 'classe': classe, 'ecole': ecole, 'annee': annee,
            'couleur': HexColor(couleur), 'assets': _assets(eleve, ecole, cache)}


def _resoudre(ecole, modele, couleur):
    m, c = reglages_carte(ecole)
    modele = modele if modele in MODELES else m
    couleur = couleur if couleur_valide(couleur) else c
    return modele, couleur


def dessiner_carte(c, x, y, modele, ctx):
    c.saveState()
    c.translate(x, y)
    DESSINS[modele](c, ctx)
    c.restoreState()


def pdf_une_carte(eleve, classe, ecole, annee_libelle, modele=None, couleur=None):
    modele, couleur = _resoudre(ecole, modele, couleur)
    m = MODELES[modele]
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(m.largeur, m.hauteur))
    c.setTitle(f"Carte scolaire {eleve.matricule}")
    dessiner_carte(c, 0, 0, modele, _contexte(eleve, classe, ecole, annee_libelle, {}, couleur))
    c.showPage()
    c.save()
    return buf.getvalue()


def pdf_cartes_classe(eleves, classe, ecole, annee_libelle, modele=None, couleur=None):
    """Feuilles A4 avec traits de découpe : autant de cartes par page que le format le permet."""
    from reportlab.lib.pagesizes import A4
    modele, couleur = _resoudre(ecole, modele, couleur)
    m = MODELES[modele]
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Cartes scolaires {classe.nom}")
    page_l, page_h = A4
    gx, gy = 6 * mm, 6 * mm
    colonnes = max(1, int((page_l - 16 * mm + gx) // (m.largeur + gx)))
    lignes = max(1, int((page_h - 16 * mm + gy) // (m.hauteur + gy)))
    par_page = colonnes * lignes
    marge_x = (page_l - (colonnes * m.largeur + (colonnes - 1) * gx)) / 2
    marge_h = (page_h - (lignes * m.hauteur + (lignes - 1) * gy)) / 2
    cache = {}
    for i, eleve in enumerate(eleves):
        pos = i % par_page
        if i and pos == 0:
            c.showPage()
        col, ligne = pos % colonnes, pos // colonnes
        x = marge_x + col * (m.largeur + gx)
        y = page_h - marge_h - (ligne + 1) * m.hauteur - ligne * gy
        c.setStrokeColor(HexColor('#bdbdbd'))
        c.setDash(1, 2)
        c.setLineWidth(0.3)
        c.roundRect(x - 0.5 * mm, y - 0.5 * mm, m.largeur + 1 * mm, m.hauteur + 1 * mm, 3 * mm, stroke=1, fill=0)
        c.setDash()
        dessiner_carte(c, x, y, modele, _contexte(eleve, classe, ecole, annee_libelle, cache, couleur))
    c.showPage()
    c.save()
    return buf.getvalue()


_PDFIUM = threading.Lock()  # pdfium n'est pas réentrant : plusieurs aperçus en même temps plantaient


def apercu_png(eleve, classe, ecole, annee_libelle, modele=None, couleur=None, echelle=4):
    """Aperçu PNG exact d'une carte (même dessin que le PDF)."""
    import pypdfium2 as pdfium
    pdf = pdf_une_carte(eleve, classe, ecole, annee_libelle, modele, couleur)
    with _PDFIUM:
        doc = pdfium.PdfDocument(pdf)
        try:
            image = doc[0].render(scale=echelle).to_pil()
        finally:
            doc.close()
    sortie = io.BytesIO()
    image.save(sortie, format='PNG')
    return sortie.getvalue()
