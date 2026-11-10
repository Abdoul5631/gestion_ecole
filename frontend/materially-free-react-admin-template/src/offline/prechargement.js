/**
 * Préchargement : tant qu'il y a du réseau, télécharge en arrière-plan ce que lisent les pages de ce compte, pour que
 * toute la navigation marche hors ligne, y compris les pages jamais ouvertes. Chaque lecture est gardée par offline/cacheHttp.js.
 * Les adresses doivent être exactement celles que les pages demandent.
 */
import api from 'services/api';
import authService from 'services/auth';
import { semerCopie } from './cacheHttp';
import { estEnLigne, surChangementReseau } from './reseau';

const INTERVALLE_MS = 6 * 60 * 60 * 1000;
const SIMULTANES = 4;
const NOTES_MAX = 300;

const COMMUN = ['/auth/me/', '/auth/mon-compte/', '/annonces-actives/', '/notifications/?page_size=500', '/notifications/non_lues/'];
const STRUCTURE = ['/parametres/', '/annees/', '/annees/active/', '/trimestres/', '/niveaux/', '/niveaux/?inclure_suspendus=1',
  '/classes/', '/classes/?inclure_suspendus=1', '/classe-matieres/'];

const jour = (decalage = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function adressesFixes(role) {
  const auj = jour();
  const journal = [`/journal/?du=${jour(-6)}&page=1`, '/journal/filtres/'];
  return {
    ADMIN: [...STRUCTURE, '/actualites/', '/bilan-pedagogique/?', '/deliberations/', '/demandes-inscription/?statut=EN_ATTENTE&inclure_suspendus=1',
      '/eleves/', '/eleves/?page=1&page_size=100&inclure_suspendus=1', '/eleves/?page_size=500', '/eleves/?tous=1&page_size=500',
      '/enseignants/', '/enseignants/?inclure_suspendus=1', '/evaluations/', '/exercices/', '/inscriptions/?inclure_suspendus=1',
      '/inscriptions/passage-apercu/', ...journal, '/matieres/', '/notes/', '/passages-annee/', '/presences/?page=1&page_size=100',
      `/presences/absents-du-jour/?debut=${auj}&fin=${auj}`, `/presences/appel-du-jour/?date=${auj}`, '/resultats-examen/candidats/?examen=BEPC',
      '/resultats-examen/candidats/?examen=BAC', '/sms/config/', '/sms/envois/', '/stats/dashboard/', '/trimestres/?annee_id=all',
      '/users/?inclure_suspendus=1&page_size=500', '/users/?role=PARENT&inclure_suspendus=1&page=1&page_size=25'],
    SECRETAIRE: [...STRUCTURE, '/cartes/modeles/', '/demandes-inscription/?statut=EN_ATTENTE&inclure_suspendus=1', '/eleves/?page=1&page_size=100&inclure_suspendus=1',
      '/eleves/?tous=1&page_size=500', '/evaluations/', '/inscriptions/?inclure_suspendus=1'],
    COMPTABLE: [...STRUCTURE, '/depenses/', '/depenses/bilan/', '/dossiers-scolarite/?page_size=500', '/paiements/', '/tarifs/?inclure_suspendus=1'],
    SURVEILLANT: [...STRUCTURE, `/presences/absents-du-jour/?debut=${auj}&fin=${auj}`],
    COMMUNICATION: ['/parametres/', '/actualites/'],
    ENSEIGNANT: ['/annees/active/', '/classes/', '/classe-matieres/', '/trimestres/', '/calendriers-composition/', '/calendriers-examen-blanc/',
      '/emploi-du-temps/', '/emploi-du-temps/aujourdhui/', '/evaluations/', '/exercices/', '/parametres/'],
    PARENT: ['/parametres/', '/trimestres/'],
    ELEVE: ['/parametres/', '/trimestres/', '/calendriers-composition/', '/calendriers-examen-blanc/', '/dossiers-scolarite/', '/eleves/ma-classe/',
      '/exercices/', '/notes/?page_size=500'],
    SUPER_ADMIN: ['/ecoles/', '/ecoles/?statut=VALIDEE', ...journal, '/plateforme/accueil/', '/plateforme/annonces/', '/plateforme/comptes/?page=1',
      '/plateforme/incidents/', '/plateforme/maintenance/', '/plateforme/tableau/', '/plateforme/trafic/?jours=7'],
  }[role] || [];
}

const liste = (d) => (Array.isArray(d) ? d : d?.results ?? []);

async function lireTout(adresses) {
  const resultats = new Map();
  const file = [...new Set(adresses)];
  const ouvrier = async () => {
    while (file.length && estEnLigne()) {
      const url = file.shift();
      try {
        resultats.set(url, (await api.get(url)).data);
      } catch { /* page non autorisée pour ce compte, ou réseau perdu : on passe à la suivante */ }
    }
  };
  await Promise.all(Array.from({ length: SIMULTANES }, ouvrier));
  return resultats;
}

/** Ce que les pages lisent quand on choisit une classe, un niveau ou un professeur. */
function adressesEquipe(roles, classes, niveaux, trimestres, cours) {
  const gestion = roles.some((r) => ['ADMIN', 'SECRETAIRE'].includes(r));
  const urls = [];
  classes.forEach(({ id }) => {
    urls.push(`/emploi-du-temps/?classe_id=${id}`, `/classe-matieres/?classe_id=${id}`, `/inscriptions/?classe_id=${id}&page_size=500`);
    if (gestion) {
      urls.push(`/eleves/?classe_id=${id}`, `/eleves/?classe_id=${id}&page_size=500`, `/eleves/?classe_id=${id}&page_size=300`,
        `/eleves/?classe_id=${id}&page=1&page_size=100&inclure_suspendus=1`);
    }
    if (roles.includes('ADMIN')) {
      urls.push(`/presences/?page=1&page_size=100&classe_id=${id}`, `/presences/appel-du-jour/?date=${jour()}&classe_id=${id}`, `/exercices/?classe_id=${id}`,
        `/bilan-pedagogique/?classe_id=${id}`, ...trimestres.map((t) => `/bilan-pedagogique/?trimestre_id=${t.id}&classe_id=${id}`));
    }
  });
  niveaux.forEach(({ id }) => {
    urls.push(`/classe-matieres/?niveau_id=${id}`);
    if (gestion) {
      trimestres.forEach((t) => urls.push(
        `/calendriers-composition/?niveau_id=${id}&trimestre_id=${t.id}`,
        `/calendriers-examen-blanc/?niveau_id=${id}&trimestre_id=${t.id}`,
      ));
    }
  });
  new Set(cours.map((c) => c.enseignant).filter(Boolean)).forEach((id) => urls.push(`/emploi-du-temps/?enseignant_id=${id}`));
  return urls;
}

function adressesEnseignant(moi, cours, trimestres, evaluations) {
  const auj = jour();
  const urls = moi.enseignant ? [`/enseignants/${moi.enseignant}/`] : [];
  trimestres.forEach((t) => urls.push(`/evaluations/?trimestre_id=${t.id}`));
  cours.forEach((c) => {
    urls.push(`/classe-matieres/${c.id}/`, `/eleves/?classe_id=${c.classe}`, `/presences/?classe_matiere_id=${c.id}&date=${auj}`);
    trimestres.forEach((t) => urls.push(`/evaluations/carnet/?classe_matiere_id=${c.id}&trimestre_id=${t.id}`));
  });
  evaluations.forEach((e) => urls.push(`/evaluations/${e.id}/notes/`));
  return urls;
}

/** Fiches d'un élève : le sien (compte élève) ou celles de chaque enfant (compte parent, avec ?eleve_id=). */
function adressesEleve(id, trimestres, parent) {
  const choix = parent ? `?eleve_id=${id}` : '';
  const urls = [`/eleves/${id}/`, `/eleves/${id}/inscriptions/`, `/eleves/${id}/presences/`, `/notes/?eleve_id=${id}`];
  if (parent) {
    urls.push(`/calendriers-composition/${choix}`, `/calendriers-examen-blanc/${choix}`, `/dossiers-scolarite/${choix}`, `/eleves/ma-classe/${choix}`,
      `/exercices/${choix}`, `/notes/?eleve_id=${id}&page_size=500`);
  }
  trimestres.forEach((t) => urls.push(`/notes/bulletin/?eleve_id=${id}&trimestre_id=${t.id}`));
  return urls;
}

let enCours = false;

export async function precharger({ forcer = false } = {}) {
  if (enCours || !estEnLigne() || !authService.isAuthenticated() || authService.getEcoleStatut() === 'EN_ATTENTE') return;
  const repere = `prechargement_le:${localStorage.getItem('user_id')}`;
  if (!forcer && Date.now() - Number(localStorage.getItem(repere) || 0) < INTERVALLE_MS) return;

  enCours = true;
  try {
    const roles = authService.getRoles();
    const lus = await lireTout([...(authService.isPlateforme() ? COMMUN.filter((u) => u !== '/auth/me/') : COMMUN), ...roles.flatMap(adressesFixes)]);
    const moi = lus.get('/auth/me/') || {};
    const classes = liste(lus.get('/classes/'));
    const niveaux = liste(lus.get('/niveaux/'));
    const trimestres = liste(lus.get('/trimestres/'));
    const cours = liste(lus.get('/classe-matieres/')).filter((c) => c.is_active !== false);
    const suite = [];

    // la fiche de chaque élève est déjà dans la liste : pas besoin d'une requête par élève
    await Promise.all(liste(lus.get('/eleves/?tous=1&page_size=500')).map((e) => semerCopie(`/eleves/${e.id}/`, e)));
    const anneeActive = lus.get('/annees/active/')?.id;
    if (anneeActive && roles.some((r) => ['ADMIN', 'SECRETAIRE'].includes(r))) suite.push(`/inscriptions/?annee_id=${anneeActive}&inclure_suspendus=1`);
    if (anneeActive && roles.includes('ENSEIGNANT')) suite.push(`/trimestres/?annee_id=${anneeActive}`);
    if (roles.includes('ADMIN')) suite.push(...trimestres.map((t) => `/bilan-pedagogique/?trimestre_id=${t.id}`));
    // notes d'un devoir (écran « Notes par classe ») : les plus récents seulement, pour ne pas tout télécharger
    if (roles.some((r) => ['ADMIN', 'SECRETAIRE'].includes(r))) {
      suite.push(...liste(lus.get('/evaluations/')).slice(-NOTES_MAX).map((e) => `/evaluations/${e.id}/notes/`));
    }
    liste(lus.get('/ecoles/')).forEach(({ id }) => suite.push(`/plateforme/ecoles/${id}/`, `/plateforme/trafic/?jours=14&ecole=${id}`));

    if (roles.some((r) => ['ADMIN', 'SECRETAIRE', 'COMPTABLE', 'SURVEILLANT'].includes(r))) suite.push(...adressesEquipe(roles, classes, niveaux, trimestres, cours));
    if (roles.includes('ENSEIGNANT')) {
      suite.push(...classes.flatMap((c) => [`/emploi-du-temps/?classe_id=${c.id}`, `/classe-matieres/?classe_id=${c.id}`]));
      suite.push(...cours.map((c) => `/exercices/?classe_matiere_id=${c.id}`));
      suite.push(...adressesEnseignant(moi, cours, trimestres, liste(lus.get('/evaluations/'))));
    }
    if (roles.includes('PARENT')) (moi.enfants || []).forEach((id) => suite.push(...adressesEleve(id, trimestres, true)));
    if (roles.includes('ELEVE') && moi.eleve) suite.push(...adressesEleve(moi.eleve, trimestres, false));

    // emploi du temps et classe de l'élève : la classe se connaît par sa fiche
    const fiches = await lireTout(suite);
    const classesFamille = [...fiches.entries()]
      .filter(([url]) => /^\/eleves\/ma-classe\//.test(url))
      .map(([, d]) => d?.classe_id ?? d?.classe?.id ?? d?.id)
      .filter(Boolean);
    const classeEleve = liste(lus.get('/eleves/ma-classe/'));
    if (lus.get('/eleves/ma-classe/')) classesFamille.push(lus.get('/eleves/ma-classe/').classe_id ?? lus.get('/eleves/ma-classe/').classe?.id ?? classeEleve[0]?.id);
    await lireTout([...new Set(classesFamille.filter(Boolean))].flatMap((id) => [`/classes/${id}/`, `/emploi-du-temps/?classe_id=${id}`]));

    if (estEnLigne()) localStorage.setItem(repere, String(Date.now()));
  } finally {
    enCours = false;
  }
}

let demarre = false;

/** Au lancement de l'application, puis à chaque retour du réseau (au plus une fois toutes les 6 heures). */
export function demarrerPrechargement() {
  if (demarre || typeof window === 'undefined') return;
  demarre = true;
  setTimeout(() => precharger().catch(() => {}), 3000);
  surChangementReseau((enLigne) => { if (enLigne) precharger().catch(() => {}); });
}
