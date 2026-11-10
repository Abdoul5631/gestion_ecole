"""Couleurs de l'école pour les documents imprimés (PDF) : même logique que le thème de l'application."""
import colorsys
import re

COULEUR_DEFAUT = '#1976d2'


def _rgb(hexa):
    h = str(hexa or '').strip().lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    if not re.fullmatch(r'[0-9a-fA-F]{6}', h):
        return None
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _hex(rgb):
    return '#' + ''.join(f'{max(0, min(255, round(v))):02x}' for v in rgb)


def _luminance(rgb):
    def lin(v):
        c = v / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contraste_blanc(rgb):
    return 1.05 / (_luminance(rgb) + 0.05)


def melanger(hexa, avec, part):
    a, b = _rgb(hexa), _rgb(avec)
    return _hex([x + (y - x) * part for x, y in zip(a, b)])


def couleur_lisible(hexa):
    """Assombrit la couleur jusqu'à ce qu'un texte blanc posé dessus reste lisible (contraste ≥ 4,5)."""
    rgb = _rgb(hexa) or _rgb(COULEUR_DEFAUT)
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in rgb))
    while l > 0.05 and _contraste_blanc(rgb) < 4.5:
        l -= 0.02
        rgb = tuple(v * 255 for v in colorsys.hls_to_rgb(h, l, s))
    return _hex(rgb)


def couleurs_ecole(ecole_ou_hexa):
    """Nuances pour un document : `fonce` (bandeaux, titres, texte blanc dessus), `moyen` et `clair` (fonds)."""
    hexa = ecole_ou_hexa if isinstance(ecole_ou_hexa, str) or ecole_ou_hexa is None \
        else getattr(ecole_ou_hexa, 'couleur_primaire', '')
    fonce = couleur_lisible(hexa or COULEUR_DEFAUT)
    return {
        'fonce': fonce,
        'moyen': melanger(fonce, '#ffffff', 0.72),
        'clair': melanger(fonce, '#ffffff', 0.9),
    }
