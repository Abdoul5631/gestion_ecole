/**
 * État du réseau pour l'application.
 *
 * Le navigateur dit « hors ligne » dès qu'il n'a pas d'internet — même quand le serveur de l'école tourne sur
 * le même ordinateur (installation locale) ou sur le réseau de l'école. Ce qui compte pour l'application,
 * c'est que **le serveur réponde**. Donc : en ligne = le navigateur signale un réseau OU le serveur répond.
 */
const API = import.meta.env.VITE_API_URL || '';

let joignable = false; // le serveur répond alors que le navigateur se croit hors ligne
let derniereValeur = null;
const ecouteurs = new Set();

export function estEnLigne() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine || joignable;
}

function notifier() {
  const v = estEnLigne();
  if (v === derniereValeur) return;
  derniereValeur = v;
  ecouteurs.forEach((fn) => {
    try { fn(v); } catch { /* ignore */ }
  });
}

/** Interroge le serveur : n'importe quelle réponse HTTP prouve qu'il est joignable. */
export async function sonder() {
  if (typeof navigator === 'undefined' || navigator.onLine) {
    joignable = false;
    notifier();
    return true;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    await fetch(`${API}/auth/login/`, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    joignable = true;
  } catch {
    joignable = false;
  }
  notifier();
  return joignable;
}

/** Appelle `fn(enLigne)` à chaque changement d'état. Retourne la fonction pour se désabonner. */
export function surChangementReseau(fn) {
  ecouteurs.add(fn);
  return () => ecouteurs.delete(fn);
}

let demarre = false;
export function demarrerSurveillanceReseau() {
  if (demarre || typeof window === 'undefined') return;
  demarre = true;
  derniereValeur = estEnLigne();
  window.addEventListener('online', sonder);
  window.addEventListener('offline', sonder);
  if (!navigator.onLine) sonder();
  // tant que le navigateur se croit hors ligne, on vérifie régulièrement si le serveur répond
  setInterval(() => { if (!navigator.onLine) sonder(); }, 5000);
}
