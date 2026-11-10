// Couleurs de l'école : extraites du logo, déclinées en nuances pour le thème de l'application.

const hexVersRgb = (hex) => {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(n)) return null;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};

const rgbVersHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

const rgbVersHsl = ([r, g, b]) => {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rr) h = (gg - bb) / d + (gg < bb ? 6 : 0);
  else if (max === gg) h = (bb - rr) / d + 2;
  else h = (rr - gg) / d + 4;
  return [h * 60, s, l];
};

const hslVersRgb = ([h, s, l]) => {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};

const melanger = (hex, avec, part) => {
  const a = hexVersRgb(hex);
  const b = hexVersRgb(avec);
  return rgbVersHex(a.map((v, i) => v + (b[i] - v) * part));
};

const luminance = (hex) => {
  const lin = hexVersRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

/** Rapport de contraste entre deux couleurs (1 à 21). */
export const contraste = (a, b) => {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
};

export const COULEUR_DEFAUT = '#3366ff';

export const couleurValide = (hex) => hexVersRgb(hex) !== null;

/** Assombrit la couleur jusqu'à ce qu'un texte blanc posé dessus reste lisible (contraste ≥ 4,5). */
export const couleurLisible = (hex) => {
  if (!couleurValide(hex)) return COULEUR_DEFAUT;
  // on baisse la luminosité en gardant la teinte et la saturation (un jaune devient doré, pas olive)
  const [h, s, l0] = rgbVersHsl(hexVersRgb(hex));
  let c = rgbVersHex(hexVersRgb(hex));
  for (let l = l0; l > 0.05 && contraste(c, '#ffffff') < 4.5; l -= 0.02) c = rgbVersHex(hslVersRgb([h, s, l - 0.02]));
  return c;
};

/** Couleurs des documents imprimés (reçus, listes, journaux) : celles de l'école connectée. */
export const couleursImpression = () => {
  let c = null;
  try { c = localStorage.getItem('ecole_couleur'); } catch { /* stockage indisponible */ }
  const fonce = couleurLisible(couleurValide(c) ? c : COULEUR_DEFAUT);
  return { fonce, moyen: melanger(fonce, '#ffffff', 0.72), clair: melanger(fonce, '#ffffff', 0.9) };
};

/** Nuances du thème à partir de la couleur de l'école (main toujours lisible sous un texte blanc). */
export const nuances = (hex) => {
  const main = couleurLisible(hex);
  return {
    lighter: melanger(main, '#ffffff', 0.82),
    light: melanger(main, '#ffffff', 0.28),
    main,
    dark: melanger(main, '#000000', 0.25),
    darker: melanger(main, '#000000', 0.5),
    100: melanger(main, '#ffffff', 0.12),
    contrastText: '#ffffff'
  };
};

/**
 * Couleurs dominantes d'un logo (au plus `max`), les plus présentes d'abord.
 * Le blanc, le noir et les gris sont ignorés : ce sont les fonds et les textes du logo, pas sa couleur.
 */
export const couleursDuLogo = (src, max = 5) => new Promise((resolve) => {
  if (!src) { resolve([]); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const taille = 64;
      const canvas = document.createElement('canvas');
      canvas.width = taille;
      canvas.height = taille;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, taille, taille);
      const px = ctx.getImageData(0, 0, taille, taille).data;
      const groupes = new Map();
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 200) continue; // transparent
        const rgb = [px[i], px[i + 1], px[i + 2]];
        const [h, s, l] = rgbVersHsl(rgb);
        if (s < 0.25 || l > 0.9 || l < 0.1) continue; // blanc, noir, gris
        const cle = `${Math.round(h / 15) % 24}-${Math.round(l * 3)}`;
        const g = groupes.get(cle) || { n: 0, r: 0, g: 0, b: 0, s: 0, h };
        g.n += 1; g.r += rgb[0]; g.g += rgb[1]; g.b += rgb[2]; g.s += s;
        groupes.set(cle, g);
      }
      const tries = [...groupes.values()]
        .filter((g) => g.n >= 6)
        .map((g) => ({ hex: rgbVersHex([g.r / g.n, g.g / g.n, g.b / g.n]), h: g.h, poids: g.n * (0.5 + g.s / g.n) }))
        .sort((a, b) => b.poids - a.poids);
      // une seule nuance par teinte : on garde des couleurs vraiment différentes
      const retenues = [];
      tries.forEach((c) => {
        const proche = retenues.some((r) => Math.min(Math.abs(r.h - c.h), 360 - Math.abs(r.h - c.h)) < 25);
        if (!proche && retenues.length < max) retenues.push(c);
      });
      resolve(retenues.map((c) => c.hex));
    } catch {
      resolve([]); // image d'une autre origine ou illisible
    }
  };
  img.onerror = () => resolve([]);
  // le logo enregistré passe par le même serveur que l'appli (proxy /media) : lecture des pixels autorisée
  try {
    const url = new URL(src, window.location.origin);
    img.src = src.startsWith('blob:') || src.startsWith('data:') ? src : `${url.pathname}${url.search}`;
  } catch {
    img.src = src;
  }
});

/** Quatre dégradés qui s'accordent avec la couleur de l'école sans être identiques : la sienne, une voisine, une complémentaire, une intermédiaire. */
export const accords = (hex) => {
  const rgb = hexVersRgb(hex) || hexVersRgb(COULEUR_DEFAUT);
  const [h, s0] = rgbVersHsl(rgb);
  const s = Math.max(0.55, Math.min(0.75, s0));
  const teinte = (decalage, l) => rgbVersHex(hslVersRgb([(h + decalage + 360) % 360, s, l]));
  return [0, 40, 180, 300].map((d) => `linear-gradient(135deg, ${teinte(d, 0.34)}, ${teinte(d, 0.52)})`);
};
