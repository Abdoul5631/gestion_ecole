import api from './api';
import { viderCacheHttp } from 'offline/cacheHttp';

export function homeForUser(data = {}) {
  const role = data.role || localStorage.getItem('role');
  const plateforme = data.is_plateforme === true
    || data.role === 'SUPER_ADMIN'
    || localStorage.getItem('is_plateforme') === '1'
    || localStorage.getItem('role') === 'SUPER_ADMIN';
  const statut = data.ecole_statut || localStorage.getItem('ecole_statut');
  if (statut === 'EN_ATTENTE') return '/attente-validation';
  if (role === 'ADMIN' && data.setup_needed) return '/admin/setup-ecole';
  if (plateforme) return '/dashboard/default';
  return '/dashboard/default';
}

const authService = {
  saveSession: (data) => {
    const { access, refresh, role, username: user, id, ecole_id } = data;
    if (access) localStorage.setItem('access_token', access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
    if (role) localStorage.setItem('role', role);
    // rôles cumulés (petites écoles : secrétaire + comptable sur le même compte)
    if (Array.isArray(data.roles)) localStorage.setItem('roles', JSON.stringify(data.roles));
    else if (role) localStorage.removeItem('roles');
    if (user) localStorage.setItem('username', user);
    if (id) localStorage.setItem('user_id', id);
    if (ecole_id != null) localStorage.setItem('ecole_id', ecole_id);
    else localStorage.removeItem('ecole_id');
    if (data.is_plateforme || role === 'SUPER_ADMIN') {
      localStorage.setItem('is_plateforme', '1');
    } else {
      localStorage.setItem('is_plateforme', '0');
    }
    if ('ecole_couleur' in data) authService.setCouleurEcole(data.ecole_couleur || null);
    if ('ecole_nom' in data || 'ecole_logo' in data) authService.setIdentiteEcole(data);
    if (data.ecole_statut) localStorage.setItem('ecole_statut', data.ecole_statut);
    else localStorage.removeItem('ecole_statut');
    if (data.must_change_password) localStorage.setItem('must_change_password', '1');
    else localStorage.removeItem('must_change_password');
    if (access) api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
    return data;
  },

  login: async (username, password) => {
    const response = await api.post('/auth/login/', { username, password });
    const data = authService.saveSession(response.data);
    try {
      const { resumeAfterLogin } = await import('offline/syncManager');
      resumeAfterLogin();
    } catch { /* ignore */ }
    return data;
  },

  logout: () => {
    viderCacheHttp(); // avant d'effacer l'identité : le cache est rangé par compte
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('role');
    localStorage.removeItem('roles');
    localStorage.removeItem('username');
    localStorage.removeItem('user_id');
    localStorage.removeItem('ecole_id');
    localStorage.removeItem('is_plateforme');
    localStorage.removeItem('ecole_statut');
    localStorage.removeItem('must_change_password');
    authService.setCouleurEcole(null);
    authService.setIdentiteEcole({ ecole_nom: null, ecole_logo: null });
    delete api.defaults.headers.common['Authorization'];
  },

  mustChangePassword: () => localStorage.getItem('must_change_password') === '1',

  isAuthenticated: () => !!localStorage.getItem('access_token'),

  getRole: () => localStorage.getItem('role'),

  /** Tous les rôles du compte : le principal, puis les rôles cumulés. */
  getRoles: () => {
    const role = localStorage.getItem('role');
    let roles = [];
    try { roles = JSON.parse(localStorage.getItem('roles') || '[]'); } catch { roles = []; }
    if (!Array.isArray(roles)) roles = [];
    return role ? [role, ...roles.filter((r) => r !== role)] : roles;
  },

  /** Le compte a-t-il l'un de ces rôles (principal ou cumulé) ? */
  aLeRole: (...roles) => authService.getRoles().some((r) => roles.includes(r)),

  /** Met à jour les rôles (après /auth/me). Renvoie true s'ils ont changé. */
  setRoles: (roles) => {
    const avant = localStorage.getItem('roles') || '[]';
    const apres = JSON.stringify(Array.isArray(roles) ? roles : []);
    localStorage.setItem('roles', apres);
    return avant !== apres;
  },

  getUsername: () => localStorage.getItem('username'),

  getEcoleId: () => localStorage.getItem('ecole_id'),

  isPlateforme: () => (
    localStorage.getItem('is_plateforme') === '1'
    || localStorage.getItem('role') === 'SUPER_ADMIN'
  ),

  getEcoleStatut: () => localStorage.getItem('ecole_statut'),

  /** Nom et logo de l'école (barre du haut, menu). */
  getIdentiteEcole: () => ({ nom: localStorage.getItem('ecole_nom') || '', logo: localStorage.getItem('ecole_logo') || '' }),

  setIdentiteEcole: (data = {}) => {
    const avant = `${localStorage.getItem('ecole_nom')}|${localStorage.getItem('ecole_logo')}`;
    [['ecole_nom', data.ecole_nom], ['ecole_logo', data.ecole_logo]].forEach(([k, v]) => {
      if (v) localStorage.setItem(k, v); else if (v !== undefined) localStorage.removeItem(k);
    });
    if (avant !== `${localStorage.getItem('ecole_nom')}|${localStorage.getItem('ecole_logo')}`) {
      window.dispatchEvent(new Event('ecole-identite'));
    }
  },

  /** Couleur de l'école (thème de l'application). */
  getCouleurEcole: () => localStorage.getItem('ecole_couleur'),

  /** Change la couleur de l'école et prévient le thème (l'appli se recolore aussitôt). */
  setCouleurEcole: (couleur) => {
    if ((localStorage.getItem('ecole_couleur') || null) === (couleur || null)) return;
    if (couleur) localStorage.setItem('ecole_couleur', couleur);
    else localStorage.removeItem('ecole_couleur');
    window.dispatchEvent(new Event('ecole-couleur'));
  },

  getToken: () => localStorage.getItem('access_token'),

  setAuthHeader: () => {
    const token = localStorage.getItem('access_token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }
};

export default authService;