import axios from 'axios';

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

export default api;

// ── Intercepteur requête : ajoute le token ─────────────────────
api.interceptors.request.use(
  (config) => {
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
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    // Évite la boucle infinie sur l'endpoint refresh lui-même
    if (original.url?.includes('/auth/refresh/') || original.url?.includes('/auth/login/')) {
      localStorage.clear();
      window.location.href = '/login';
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
      localStorage.clear();
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
  update: (id, data) => api.put(`/eleves/${id}/`, data),
  patch: (id, data) => api.patch(`/eleves/${id}/`, data),
  delete: (id) => api.delete(`/eleves/${id}/`),
  getPresences: (id) => api.get(`/eleves/${id}/presences/`),
  getInscriptions: (id) => api.get(`/eleves/${id}/inscriptions/`),
  creerComptesManquants: () => api.post('/eleves/creer-comptes-manquants/'),
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
  getAll: () => api.get('/inscriptions/'),
  create: (data) => api.post('/inscriptions/', data),
  update: (id, data) => api.put(`/inscriptions/${id}/`, data),
  delete: (id) => api.delete(`/inscriptions/${id}/`),
  parNiveau: () => api.get('/inscriptions/par_niveau/'),
  getClasses: () => api.get('/inscriptions/classes/'),
};

// ─── CLASSES ──────────────────────────────
export const classeService = {
  getAll: (params = '') => api.get(`/classes/${params}`),
  getById: (id) => api.get(`/classes/${id}/`),
  create: (data) => api.post('/classes/', data),
  update: (id, data) => api.put(`/classes/${id}/`, data),
  patch: (id, data) => api.patch(`/classes/${id}/`, data),
  delete: (id) => api.delete(`/classes/${id}/`),
};

// ─── NIVEAUX ──────────────────────────────
export const niveauService = {
  getAll: () => api.get('/niveaux/'),
  getById: (id) => api.get(`/niveaux/${id}/`),
  create: (data) => api.post('/niveaux/', data),
  update: (id, data) => api.put(`/niveaux/${id}/`, data),
  patch: (id, data) => api.patch(`/niveaux/${id}/`, data),
  delete: (id) => api.delete(`/niveaux/${id}/`),
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
  getAll: () => api.get('/trimestres/'),
  create: (data) => api.post('/trimestres/', data),
  update: (id, data) => api.put(`/trimestres/${id}/`, data),
  patch: (id, data) => api.patch(`/trimestres/${id}/`, data),
  delete: (id) => api.delete(`/trimestres/${id}/`),
};

// ─── CLASSE MATIERES ──────────────────────
export const classeMatiereService = {
  getAll: () => api.get('/classe-matieres/'),
  create: (data) => api.post('/classe-matieres/', data),
  update: (id, data) => api.put(`/classe-matieres/${id}/`, data),
  patch: (id, data) => api.patch(`/classe-matieres/${id}/`, data),
  delete: (id) => api.delete(`/classe-matieres/${id}/`),
};

// ─── MATIERES ─────────────────────────────
export const matiereService = {
  getAll: () => api.get('/matieres/'),
  getById: (id) => api.get(`/matieres/${id}/`),
  create: (data) => api.post('/matieres/', data),
  update: (id, data) => api.put(`/matieres/${id}/`, data),
  delete: (id) => api.delete(`/matieres/${id}/`),
};

// ─── ENSEIGNANTS ──────────────────────────
export const enseignantService = {
  getAll: () => api.get('/enseignants/'),
  getById: (id) => api.get(`/enseignants/${id}/`),
  create: (data) => api.post('/enseignants/', data),
  update: (id, data) => api.put(`/enseignants/${id}/`, data),
  patch: (id, data) => api.patch(`/enseignants/${id}/`, data),
  delete: (id) => api.delete(`/enseignants/${id}/`),
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
};

// ─── NOTES ────────────────────────────────
export const noteService = {
  getAll: () => api.get('/notes/'),
  create: (data) => api.post('/notes/', data),
  update: (id, data) => api.put(`/notes/${id}/`, data),
  delete: (id) => api.delete(`/notes/${id}/`),
  getBulletin: (eleveId, trimestreId) =>
    api.get(`/notes/bulletin/?eleve_id=${eleveId}&trimestre_id=${trimestreId}`),
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

// ─── EMPLOI DU TEMPS ──────────────────────
export const emploiService = {
  getAll: (params = '') => api.get(`/emploi-du-temps/${params}`),
  create: (data) => api.post('/emploi-du-temps/', data),
  update: (id, data) => api.put(`/emploi-du-temps/${id}/`, data),
  delete: (id) => api.delete(`/emploi-du-temps/${id}/`),
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
  getAll: () => api.get('/users/'),
  getById: (id) => api.get(`/users/${id}/`),
  create: (data) => api.post('/users/', data),
  update: (id, data) => api.put(`/users/${id}/`, data),
  patch: (id, data) => api.patch(`/users/${id}/`, data),
  delete: (id) => api.delete(`/users/${id}/`),
  me: () => api.get('/auth/me/'),
};