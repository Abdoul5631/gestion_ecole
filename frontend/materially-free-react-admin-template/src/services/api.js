import axios from 'axios';
import { messageErreur } from 'utils/erreurs';
import { installerCacheHttp } from 'offline/cacheHttp';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// JSON par défaut uniquement si ce n'est pas du FormData
api.interceptors.request.use((config) => {
  if (!(config.data instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
  }
  return config;
});

installerCacheHttp(api); // toutes les lectures restent disponibles hors ligne

export default api;

function clearAuthTokensOnly() {
  // Ne pas toucher IndexedDB (file d'attente offline conservée)
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('role');
  localStorage.removeItem('username');
  localStorage.removeItem('user_id');
  localStorage.removeItem('ecole_id');
  localStorage.removeItem('is_plateforme');
  localStorage.removeItem('ecole_statut');
  localStorage.removeItem('must_change_password');
  delete api.defaults.headers.common['Authorization'];
}

function notifyAuthPaused() {
  import('offline/syncManager')
    .then((m) => m.pauseForAuth())
    .catch(() => {});
}

// ── Intercepteur requête : ajoute le token ─────────────────────
api.interceptors.request.use(
  (config) => {
    const url = config.url || '';
    // Site vitrine public : ne pas envoyer un JWT (sinon token expiré → 401)
    if (url.includes('/vitrine/')) {
      if (config.headers) delete config.headers.Authorization;
      return config;
    }
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Intercepteur réponse : refresh automatique sur 401 ─────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token));
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    // Toute erreur est expliquée en français : message lisible partout (error.message) et, quand le serveur
    // n'a renvoyé qu'une page technique (HTML, texte), un « detail » clair que les écrans affichent déjà.
    if (error.isAxiosError) {
      const clair = messageErreur(error);
      const r = error.response;
      if (r && (typeof r.data !== 'object' || r.data === null)) r.data = { detail: clair };
      error.message = clair;
    }
    // maintenance : l'application affiche la page de maintenance (les saisies hors ligne restent en attente)
    if (error.response?.status === 503 && error.response.data?.maintenance) {
      window.dispatchEvent(new CustomEvent('maintenance:detectee', { detail: error.response.data }));
    }
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    // Évite la boucle infinie sur l'endpoint refresh lui-même
    if (original.url?.includes('/auth/refresh/') || original.url?.includes('/auth/login/')) {
      notifyAuthPaused();
      clearAuthTokensOnly();
      window.location.href = '/login';
      return Promise.reject(error);
    }
    // Ne pas forcer la reconnexion depuis les pages publiques (vitrine)
    if (original.url?.includes('/vitrine/')) {
      return Promise.reject(error);
    }
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then(token => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }
    original._retry = true;
    isRefreshing = true;
    try {
      const refresh = localStorage.getItem('refresh_token');
      if (!refresh) throw new Error('no_refresh');
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/auth/refresh/`,
        { refresh }
      );
      localStorage.setItem('access_token', data.access);
      api.defaults.headers.common['Authorization'] = `Bearer ${data.access}`;
      processQueue(null, data.access);
      original.headers.Authorization = `Bearer ${data.access}`;
      return api(original);
    } catch (err) {
      processQueue(err, null);
      if (axios.isAxiosError(err) && !err.response) return Promise.reject(err); // coupure réseau : la session reste ouverte
      notifyAuthPaused();
      clearAuthTokensOnly();
      window.location.href = '/login';
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  }
);

// ── Helper pagination ──────────────────────────────────────────
// Normalise les réponses paginées {count, results} et non-paginées []
export const getResults = (res) => {
  if (Array.isArray(res.data)) return { items: res.data, count: res.data.length };
  return { items: res.data.results ?? [], count: res.data.count ?? 0 };
};

// ─── ELEVES ───────────────────────────────
export const eleveService = {
  getAll: (url = '/eleves/') => api.get(url),
  getById: (id) => api.get(`/eleves/${id}/`),
  create: (data) => api.post('/eleves/', data),
  prochainMatricule: () => api.get('/eleves/prochain-matricule/'),
  update: (id, data) => {
    if (data instanceof FormData) {
      return api.put(`/eleves/${id}/`, data, { headers: { 'Content-Type': undefined } });
    }
    return api.put(`/eleves/${id}/`, data);
  },
  patch: (id, data) => {
    if (data instanceof FormData) {
      return api.patch(`/eleves/${id}/`, data, { headers: { 'Content-Type': undefined } });
    }
    return api.patch(`/eleves/${id}/`, data);
  },
  delete: (id) => api.delete(`/eleves/${id}/`),
  corrigerNom: (id, data) => api.patch(`/eleves/${id}/corriger-nom/`, data),
  reactiver: (id) => api.post(`/eleves/${id}/reactiver/`),
  getPresences: (id) => api.get(`/eleves/${id}/presences/`),
  getAppels: (id) => api.get(`/eleves/${id}/appels/`),
  getInscriptions: (id) => api.get(`/eleves/${id}/inscriptions/`),
  creerComptesManquants: () => api.post('/eleves/creer-comptes-manquants/'),
  documents: (id) => api.get(`/eleves/${id}/documents/`),
  ajouterDocument: (id, formData) => api.post(`/eleves/${id}/documents/`, formData, { headers: { 'Content-Type': undefined } }),
  voirDocument: (id, docId) => api.get(`/eleves/${id}/documents/${docId}/`, { responseType: 'blob' }),
  supprimerDocument: (id, docId) => api.delete(`/eleves/${id}/documents/${docId}/`),
  carte: (id, choix = {}) => api.get(`/eleves/${id}/carte/`, { responseType: 'blob', params: choix }),
  compteParent: (id) => api.post(`/eleves/${id}/compte-parent/`),
  creerComptesParents: () => api.post('/eleves/creer-comptes-parents/'),
  templateExcel: () => api.get('/eleves/template-excel/', { responseType: 'blob' }),
  importExcel: (file, classeId = null) => {
    const fd = new FormData();
    fd.append('file', file);
    if (classeId) fd.append('classe_id', classeId);
    return api.post('/eleves/import-excel/', fd, { headers: { 'Content-Type': undefined } });
  },
};

// ─── INSCRIPTIONS ─────────────────────────
export const inscriptionService = {
  getAll: (params = '') => api.get(`/inscriptions/${params}`),
  create: (data) => api.post('/inscriptions/', data),
  update: (id, data) => api.put(`/inscriptions/${id}/`, data),
  delete: (id) => api.delete(`/inscriptions/${id}/`),
  reactiver: (id) => api.post(`/inscriptions/${id}/reactiver/`),
  parNiveau: () => api.get('/inscriptions/par_niveau/'),
  getClasses: () => api.get('/inscriptions/classes/'),
  reinscription: (data) => api.post('/inscriptions/reinscription/', data),
  passageApercu: (params = {}) => api.get('/inscriptions/passage-apercu/', { params }),
  passageLancer: (data = {}) => api.post('/inscriptions/passage-lancer/', data),
  passagesHistorique: () => api.get('/passages-annee/'),
};

export const examenService = {
  candidats: (params = {}) => api.get('/resultats-examen/candidats/', { params }),
  saisir: (data) => api.post('/resultats-examen/saisir/', data),
  importerExcel: (file, examen) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('examen', examen);
    return api.post('/resultats-examen/importer-excel/', fd, { headers: { 'Content-Type': undefined } });
  },
  importerTexte: (data) => api.post('/resultats-examen/importer-texte/', data),
};

// ─── CLASSES ──────────────────────────────
export const classeService = {
  getAll: (params = '') => api.get(`/classes/${params}`),
  getById: (id) => api.get(`/classes/${id}/`),
  create: (data) => api.post('/classes/', data),
  update: (id, data) => api.put(`/classes/${id}/`, data),
  patch: (id, data) => api.patch(`/classes/${id}/`, data),
  delete: (id) => api.delete(`/classes/${id}/`),
  reactiver: (id) => api.post(`/classes/${id}/reactiver/`),
  cartesApercu: (id) => api.get(`/classes/${id}/cartes-apercu/`),
  listePdf: (id, telecharger = false) => api.get(`/classes/${id}/liste-pdf/`, { responseType: 'blob', params: telecharger ? { telecharger: 1 } : undefined }),
  cartes: (id, eleves, choix = {}) => api.get(`/classes/${id}/cartes/`, {
    responseType: 'blob',
    params: { ...choix, ...(eleves && eleves.length ? { eleves: eleves.join(',') } : {}) },
  }),
};

// ─── NIVEAUX ──────────────────────────────
export const niveauService = {
  getAll: (params = '') => api.get(`/niveaux/${params}`),
  getById: (id) => api.get(`/niveaux/${id}/`),
  create: (data) => api.post('/niveaux/', data),
  update: (id, data) => api.put(`/niveaux/${id}/`, data),
  patch: (id, data) => api.patch(`/niveaux/${id}/`, data),
  delete: (id) => api.delete(`/niveaux/${id}/`),
  reactiver: (id) => api.post(`/niveaux/${id}/reactiver/`),
};

// ─── ANNEES SCOLAIRES ─────────────────────
export const anneeService = {
  getAll: () => api.get('/annees/'),
  getActive: () => api.get('/annees/active/'),
  create: (data) => api.post('/annees/', data),
  update: (id, data) => api.put(`/annees/${id}/`, data),
  patch: (id, data) => api.patch(`/annees/${id}/`, data),
  delete: (id) => api.delete(`/annees/${id}/`),
};

// ─── TRIMESTRES ───────────────────────────
export const trimestreService = {
  getAll: (params = '') => api.get(`/trimestres/${params}`),
  create: (data) => api.post('/trimestres/', data),
  update: (id, data) => api.put(`/trimestres/${id}/`, data),
  patch: (id, data) => api.patch(`/trimestres/${id}/`, data),
  delete: (id) => api.delete(`/trimestres/${id}/`),
  // Ouvre / ferme la récupération des bulletins par les élèves et les parents (direction)
  ouvrirBulletins: (id, ouverts) => api.post(`/trimestres/${id}/bulletins/`, { ouverts }),
};

// ─── CLASSE MATIERES ──────────────────────
export const classeMatiereService = {
  getAll: (params = '') => api.get(`/classe-matieres/${params}`),
  create: (data) => api.post('/classe-matieres/', data),
  update: (id, data) => api.put(`/classe-matieres/${id}/`, data),
  patch: (id, data) => api.patch(`/classe-matieres/${id}/`, data),
  delete: (id) => api.delete(`/classe-matieres/${id}/`),
  reactiver: (id) => api.post(`/classe-matieres/${id}/reactiver/`),
  copier: (data) => api.post('/classe-matieres/copier/', data),
};

// ─── MATIERES ─────────────────────────────
export const matiereService = {
  getAll: (params = '') => api.get(`/matieres/${params}`),
  getById: (id) => api.get(`/matieres/${id}/`),
  create: (data) => api.post('/matieres/', data),
  update: (id, data) => api.put(`/matieres/${id}/`, data),
  patch: (id, data) => api.patch(`/matieres/${id}/`, data),
  delete: (id) => api.delete(`/matieres/${id}/`),
  reactiver: (id) => api.post(`/matieres/${id}/reactiver/`),
};

// ─── ENSEIGNANTS ──────────────────────────
export const enseignantService = {
  getAll: (params = '') => api.get(`/enseignants/${params}`),
  getById: (id) => api.get(`/enseignants/${id}/`),
  create: (data) => api.post('/enseignants/', data),
  update: (id, data) => api.put(`/enseignants/${id}/`, data),
  patch: (id, data) => api.patch(`/enseignants/${id}/`, data),
  delete: (id) => api.delete(`/enseignants/${id}/`),
  reactiver: (id) => api.post(`/enseignants/${id}/reactiver/`),
  getMatieres: (id) => api.get(`/enseignants/${id}/matieres/`),
};

// ─── EVALUATIONS ──────────────────────────
export const evaluationService = {
  getAll: () => api.get('/evaluations/'),
  getById: (id) => api.get(`/evaluations/${id}/`),
  create: (data) => api.post('/evaluations/', data),
  patch: (id, data) => api.patch(`/evaluations/${id}/`, data),
  delete: (id) => api.delete(`/evaluations/${id}/`),
  getNotes: (id) => api.get(`/evaluations/${id}/notes/`),
  generer: (data) => api.post('/evaluations/generer/', data),
};

// ─── NOTES ────────────────────────────────
export const noteService = {
  getAll: () => api.get('/notes/'),
  create: (data) => api.post('/notes/', data),
  update: (id, data) => api.put(`/notes/${id}/`, data),
  delete: (id) => api.delete(`/notes/${id}/`),
  getBulletin: (eleveId, trimestreId) =>
    api.get(`/notes/bulletin/?eleve_id=${eleveId}&trimestre_id=${trimestreId}`),
  getBulletinPdf: (eleveId, trimestreId) =>
    api.get(`/notes/bulletin-pdf/?eleve_id=${eleveId}&trimestre_id=${trimestreId}`, { responseType: 'blob' }),
  saisieMasse: (data) => api.post('/notes/saisie-masse/', data),
};

// ─── PRESENCES ────────────────────────────
export const presenceService = {
  getAll: (url = '/presences/') => api.get(url),
  create: (data) => api.post('/presences/', data),
  update: (id, data) => api.put(`/presences/${id}/`, data),
  delete: (id) => api.delete(`/presences/${id}/`),
  saisieMasse: (data) => api.post('/presences/saisie-masse/', data),
};

export const appelJournalierService = {
  getAll: (params = '') => api.get(`/appels-journaliers/${params}`),
  saisieMasse: (data) => api.post('/appels-journaliers/saisie-masse/', data),
};

export const ecoleService = {
  creer: (data) => api.post('/ecoles/inscription/', data),
  liste: (params) => api.get('/ecoles/', { params }),
  valider: (id) => api.post(`/ecoles/${id}/valider/`),
  refuser: (id, motif) => api.post(`/ecoles/${id}/refuser/`, { motif }),
  suspendre: (id, motif) => api.post(`/ecoles/${id}/suspendre/`, { motif }),
  reactiver: (id) => api.post(`/ecoles/${id}/reactiver/`),
  comptes: (id, q) => api.get(`/ecoles/${id}/comptes/`, { params: { q } }),
  reinitialiserMotDePasse: (id, userId) => api.post(`/ecoles/${id}/comptes/${userId}/reinitialiser/`),
  suspendreParent: (id, userId, motif) => api.post(`/ecoles/${id}/comptes/${userId}/suspendre/`, { motif }),
  reactiverParent: (id, userId) => api.post(`/ecoles/${id}/comptes/${userId}/reactiver/`),
};

export const actualiteService = {
  getAll: () => api.get('/actualites/'),
  create: (fd) => api.post('/actualites/', fd, { headers: { 'Content-Type': undefined } }),
  update: (id, fd) => api.patch(`/actualites/${id}/`, fd, { headers: { 'Content-Type': undefined } }),
  delete: (id) => api.delete(`/actualites/${id}/`),
};

export const vitrineService = {
  get: (slug) => api.get(`/vitrine/${slug}/`),
  depotDossier: (slug, data) => {
    if (data instanceof FormData) {
      return api.post(`/vitrine/${slug}/dossiers/`, data, { headers: { 'Content-Type': undefined } });
    }
    return api.post(`/vitrine/${slug}/dossiers/`, data);
  },
};

export const demandeInscriptionService = {
  piece: (id, pieceId) => api.get(`/demandes-inscription/${id}/pieces/${pieceId}/`, { responseType: 'blob' }),
  getAll: (params = {}) => api.get('/demandes-inscription/', { params }),
  accepter: (id, data) => api.post(`/demandes-inscription/${id}/accepter/`, data),
  refuser: (id, motif) => api.post(`/demandes-inscription/${id}/refuser/`, { motif }),
  suspendre: (id) => api.delete(`/demandes-inscription/${id}/`),
  reactiver: (id) => api.post(`/demandes-inscription/${id}/reactiver/`),
};

// ─── PARAMETRES ───────────────────────────
export const parametresService = {
  get: () => api.get('/parametres/'),
  update: (data) => {
    // Pour FormData, ne PAS fixer Content-Type manuellement — le navigateur ajoute
    // automatiquement le boundary requis. Si on le fixe manuellement, Django ne parse pas.
    if (data instanceof FormData) {
      return api.put('/parametres/', data, { headers: { 'Content-Type': undefined } });
    }
    return api.put('/parametres/', data);
  },
};

export const carteService = {
  modeles: () => api.get('/cartes/modeles/'),
  apercu: (params) => api.get('/cartes/apercu/', { responseType: 'blob', params }),
  choisir: (data) => api.put('/cartes/choix/', data),
};

export const statsService = {
  dashboard: () => api.get('/stats/dashboard/'),
};

// ─── EMPLOI DU TEMPS ──────────────────────
export const emploiService = {
  getAll: (params = '') => api.get(`/emploi-du-temps/${params}`),
  create: (data) => api.post('/emploi-du-temps/', data),
  update: (id, data) => api.put(`/emploi-du-temps/${id}/`, data),
  delete: (id) => api.delete(`/emploi-du-temps/${id}/`),
  reactiver: (id) => api.post(`/emploi-du-temps/${id}/reactiver/`),
};

// ─── CALENDRIER COMPOSITIONS ──────────────
export const calendrierCompoService = {
  getAll: (params = '') => api.get(`/calendriers-composition/${params}`),
  getByNiveauTrimestre: (niveauId, trimestreId) =>
    api.get(`/calendriers-composition/?niveau_id=${niveauId}&trimestre_id=${trimestreId}`),
  create: (data) => api.post('/calendriers-composition/', data),
  update: (id, data) => api.put(`/calendriers-composition/${id}/`, data),
  patch: (id, data) => api.patch(`/calendriers-composition/${id}/`, data),
  delete: (id) => api.delete(`/calendriers-composition/${id}/`),
  publier: (id) => api.post(`/calendriers-composition/${id}/publier/`),
  retirer: (id) => api.post(`/calendriers-composition/${id}/retirer/`),
};

// ─── PROGRAMMES COMPOSITIONS ──────────────
export const programmeCompoService = {
  create: (data) => api.post('/programmes-composition/', data),
  patch: (id, data) => api.patch(`/programmes-composition/${id}/`, data),
  delete: (id) => api.delete(`/programmes-composition/${id}/`),
};

// ─── CALENDRIER EXAMEN BLANC ──────────────
export const calendrierExamenBlancService = {
  getAll: (params = '') => api.get(`/calendriers-examen-blanc/${params}`),
  getByNiveauTrimestre: (niveauId, trimestreId) =>
    api.get(`/calendriers-examen-blanc/?niveau_id=${niveauId}&trimestre_id=${trimestreId}`),
  create: (data) => api.post('/calendriers-examen-blanc/', data),
  update: (id, data) => api.put(`/calendriers-examen-blanc/${id}/`, data),
  patch: (id, data) => api.patch(`/calendriers-examen-blanc/${id}/`, data),
  delete: (id) => api.delete(`/calendriers-examen-blanc/${id}/`),
  publier: (id) => api.post(`/calendriers-examen-blanc/${id}/publier/`),
  retirer: (id) => api.post(`/calendriers-examen-blanc/${id}/retirer/`),
};

// ─── PROGRAMME EXAMEN BLANC ───────────────
export const programmeExamenBlancService = {
  getAll: (params = '') => api.get(`/programmes-examen-blanc/${params}`),
  create: (data) => api.post('/programmes-examen-blanc/', data),
  patch: (id, data) => api.patch(`/programmes-examen-blanc/${id}/`, data),
  delete: (id) => api.delete(`/programmes-examen-blanc/${id}/`),
};

// ─── DELIBERATIONS (Examen Blanc) ─────────
export const deliberationService = {
  getAll: (params = '') => api.get(`/deliberations/${params}`),
  create: (data) => api.post('/deliberations/', data),
};

// ─── USERS ────────────────────────────────
export const userService = {
  getAll: (params = '') => api.get(`/users/${params}`),
  getById: (id) => api.get(`/users/${id}/`),
  create: (data) => api.post('/users/', data),
  update: (id, data) => api.put(`/users/${id}/`, data),
  patch: (id, data) => api.patch(`/users/${id}/`, data),
  delete: (id) => api.delete(`/users/${id}/`),
  reactiver: (id) => api.post(`/users/${id}/reactiver/`),
  me: () => api.get('/auth/me/'),
};

// ─── CAISSE / SCOLARITÉ ───────────────────
export const tarifService = {
  getAll: (params = '') => api.get(`/tarifs/${params}`),
  create: (data) => api.post('/tarifs/', data),
  update: (id, data) => api.put(`/tarifs/${id}/`, data),
  patch: (id, data) => api.patch(`/tarifs/${id}/`, data),
  delete: (id) => api.delete(`/tarifs/${id}/`),
  reactiver: (id) => api.post(`/tarifs/${id}/reactiver/`),
};

export const dossierService = {
  getAll: (params = '') => api.get(`/dossiers-scolarite/${params}`),
  getById: (id) => api.get(`/dossiers-scolarite/${id}/`),
  patch: (id, data) => api.patch(`/dossiers-scolarite/${id}/`, data),
  ouvrirManquants: () => api.post('/dossiers-scolarite/ouvrir-manquants/'),
  paiement: (id, data) => api.post(`/dossiers-scolarite/${id}/paiement/`, data),
  relancer: (data = {}) => api.post('/dossiers-scolarite/relancer/', data),
  certificatNonRedevance: (id) => api.get(`/dossiers-scolarite/${id}/certificat-non-redevance/`, { responseType: 'blob' }),
};

export const paiementService = {
  getAll: (params = '') => api.get(`/paiements/${params}`),
};

export const depenseService = {
  getAll: (params = '') => api.get(`/depenses/${params}`),
  bilan: () => api.get('/depenses/bilan/'),
  journal: (date) => api.get('/depenses/journal/', { params: date ? { date } : {} }),
  create: (data) => api.post('/depenses/', data),
  remove: (id) => api.delete(`/depenses/${id}/`),
};

// ─── NOTIFICATIONS / SMS ──────────────────
export const journalService = {
  getAll: (params = '') => api.get(`/journal/${params}`),
  filtres: () => api.get('/journal/filtres/'),
};

export const equipeService = {
  message: (data) => api.post('/equipe/message/', data),
  messageSecretariat: (data) => api.post('/equipe/message-secretariat/', data),
};

export const notificationService = {
  getAll: (params = {}) => api.get('/notifications/', { params: { page_size: 500, ...params } }),
  nonLues: () => api.get('/notifications/non_lues/'),
  lire: (id) => api.post(`/notifications/${id}/lire/`),
  toutLire: () => api.post('/notifications/tout-lire/'),
};

export const smsService = {
  getAll: (params = '') => {
    if (params && typeof params === 'object') {
      return api.get('/sms/', { params });
    }
    return api.get(`/sms/${params || ''}`);
  },
  config: () => api.get('/sms/config/'),
  envois: (params = {}) => api.get('/sms/envois/', { params }),
  envoyer: (data) => api.post('/sms/envoyer/', data),
  relancer: (data = {}) => api.post('/sms/relancer/', data),
};

export const bulletinService = {
  publier: (data) => api.post('/notes/publier-bulletin/', data),
  telechargerPdf: (eleveId, trimestreId, filename = 'bulletin.pdf') =>
    api.get(`/notes/bulletin-pdf/?eleve_id=${eleveId}&trimestre_id=${trimestreId}`, { responseType: 'blob' })
      .then((res) => {
        const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }),
};