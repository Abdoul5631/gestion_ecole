/** Mot de passe temporaire lisible (aligné sur accounts/passwords.py). */

const INTERDIT = 'Ecole@2024';

function randomInt(max) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function pick(chars) {
  return chars[randomInt(chars.length)];
}

export function genererMotDePasseTemporaire(longueur = 10) {
  const len = Math.max(8, Number(longueur) || 10);
  const minuscules = 'abcdefghijklmnopqrstuvwxyz';
  const majuscules = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const chiffres = '0123456789';
  const alphabet = minuscules + majuscules + chiffres;

  for (;;) {
    const chars = [
      pick(minuscules),
      pick(majuscules),
      pick(chiffres),
    ];
    for (let i = 3; i < len; i += 1) {
      chars.push(pick(alphabet));
    }
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const pwd = chars.join('');
    if (pwd !== INTERDIT) return pwd;
  }
}
