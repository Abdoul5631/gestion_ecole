// Remonte au super admin les erreurs qui plantent une page dans le navigateur (page blanche, bouton sans effet…).
// Discret : une même erreur n'est envoyée qu'une fois, dix erreurs au plus par session, jamais hors ligne ni sans connexion.
import api from 'services/api';

const deja = new Set();
let envoyees = 0;
const MAX = 10;
// bruits du navigateur sans conséquence pour l'utilisateur
const IGNOREES = [/ResizeObserver loop/i, /^Script error\.?$/i, /Non-Error promise rejection captured/i];

export function signalerErreur(erreur, contexte = '') {
  try {
    const message = String(erreur?.message || erreur || 'Erreur inconnue').slice(0, 400);
    if (!localStorage.getItem('access_token') || !navigator.onLine) return;
    if (IGNOREES.some((r) => r.test(message))) return;
    const cle = `${message}|${window.location.pathname}`;
    if (deja.has(cle) || envoyees >= MAX) return;
    deja.add(cle);
    envoyees += 1;
    api.post('/erreur-client/', {
      page: window.location.pathname,
      message: contexte ? `${contexte} : ${message}` : message,
      pile: String(erreur?.stack || '').slice(0, 5000),
      navigateur: navigator.userAgent,
    }).catch(() => {});
  } catch {
    // ne jamais aggraver le problème
  }
}

export function ecouterErreursNavigateur() {
  window.addEventListener('error', (e) => signalerErreur(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (r?.isAxiosError) return; // les erreurs d'API sont déjà vues côté serveur
    signalerErreur(r, 'Promesse non gérée');
  });
}
