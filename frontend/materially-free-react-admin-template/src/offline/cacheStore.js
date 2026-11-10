import { idbGet, idbPut, STORE_CACHE } from './db';

import { estEnLigne } from './reseau';
/** Préfixe multi-école + utilisateur (appareils partagés). */
function scopePrefix() {
  const ecole = (typeof localStorage !== 'undefined' && localStorage.getItem('ecole_id')) || 'public';
  const user = (typeof localStorage !== 'undefined' && localStorage.getItem('user_id')) || 'anon';
  return `e${ecole}:u${user}`;
}

export function scopedKey(raw) {
  return `${scopePrefix()}:${raw}`;
}

/** Clés de cache stables pour les lectures offline. */
export const CacheKeys = {
  classeMatieres: () => scopedKey('classe-matieres:list'),
  classeMatiere: (id) => scopedKey(`classe-matieres:${id}`),
  elevesClasse: (classeId) => scopedKey(`eleves:classe:${classeId}`),
  elevesList: (params = '') => scopedKey(`eleves:list:${params || 'default'}`),
  elevesDetail: (id) => scopedKey(`eleves:${id}`),
  classes: (params = '') => scopedKey(`classes:${params || 'default'}`),
  niveaux: (params = '') => scopedKey(`niveaux:${params || 'default'}`),
  enseignants: (params = '') => scopedKey(`enseignants:${params || 'default'}`),
  inscriptions: (params = '') => scopedKey(`inscriptions:${params || 'default'}`),
  trimestres: () => scopedKey('trimestres:list'),
  evaluations: () => scopedKey('evaluations:list'),
  evalNotes: (evalId) => scopedKey(`evaluations:${evalId}:notes`),
  presences: (cmId, date) => scopedKey(`presences:cm:${cmId}:date:${date}`),
  parametres: () => scopedKey('parametres'),
  notesEleve: (eleveId) => scopedKey(`notes:eleve:${eleveId || 'me'}`),
  bulletin: (eleveId, trimestreId) => scopedKey(`bulletin:${eleveId}:${trimestreId}`),
  frais: (eleveId) => scopedKey(`frais:${eleveId || 'me'}`),
  messages: () => scopedKey('messages:list'),
  presencesEleve: (eleveId) => scopedKey(`presences:eleve:${eleveId}`),
  maClasse: () => scopedKey('ma-classe'),
  emploi: (params = '') => scopedKey(`emploi:${params || 'me'}`),
  caisse: () => scopedKey('caisse:dossiers'),
  dossiersRecus: (statut = '') => scopedKey(`dossiers-recus:${statut || 'all'}`),
  authMe: () => scopedKey('auth:me'),
  vitrine: (slug) => `public:vitrine:${slug}`,
  smsOutbox: (params = '') => scopedKey(`sms:${params || 'default'}`),
};

export async function cacheSet(key, data) {
  await idbPut(STORE_CACHE, {
    key,
    data,
    updated_at: Date.now(),
  });
}

export async function cacheGet(key) {
  const row = await idbGet(STORE_CACHE, key);
  return row ? row.data : null;
}

/**
 * Lit le réseau si possible, sinon le cache.
 * @returns {{ data: any, fromCache: boolean, neverCached?: boolean }}
 */
export async function readThrough(key, fetcher) {
  const online = typeof navigator === 'undefined' ? true : estEnLigne();

  if (online) {
    try {
      const data = await fetcher();
      await cacheSet(key, data);
      return { data, fromCache: false };
    } catch (err) {
      const cached = await cacheGet(key);
      if (cached != null) return { data: cached, fromCache: true };
      throw err;
    }
  }

  const cached = await cacheGet(key);
  if (cached != null) return { data: cached, fromCache: true };
  // la page n'a jamais été ouverte, mais ses lectures sont peut-être déjà dans l'appareil (préchargement)
  try {
    const data = await fetcher();
    await cacheSet(key, data); // les saisies hors ligne de la page peuvent ainsi s'y inscrire
    return { data, fromCache: true };
  } catch {
    return { data: null, fromCache: true, neverCached: true };
  }
}

export const NEVER_CACHED_MSG =
  'Ouvrez cette page une fois avec internet pour l’utiliser hors ligne.';
