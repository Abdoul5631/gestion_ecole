/**
 * Cache hors ligne de toutes les lectures de l'API : chaque réponse GET reçue est gardée dans l'appareil, et
 * resservie telle quelle quand le serveur est injoignable. Les pages n'ont rien à faire : elles lisent comme d'habitude.
 */
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { cacheGet, cacheSet, scopedKey } from './cacheStore';
import { idbDelete, idbGetAll, STORE_CACHE } from './db';
import { estEnLigne } from './reseau';

export const MESSAGE_HORS_LIGNE = 'Vous êtes hors ligne et ces informations ne sont pas encore enregistrées sur cet appareil. Reconnectez-vous à internet pour les charger.';
export const CODE_HORS_LIGNE = 'ERR_HORS_LIGNE';

// Jamais gardés : la connexion, et le prochain matricule (une copie périmée créerait un doublon)
const EXCLUS = [/\/auth\/(login|refresh)\//, /\/prochain-matricule\//];
const DELAI_SI_COPIE_MS = 12000; // connexion qui traîne : au-delà, la copie de l'appareil vaut mieux qu'une page qui tourne
const PREFIXE = 'http:';

const cachable = (config) => (config.method || 'get').toLowerCase() === 'get'
  && (!config.responseType || config.responseType === 'json')
  && !EXCLUS.some((re) => re.test(config.url || ''));

const lire = (cle) => cacheGet(cle).catch(() => null); // IndexedDB indisponible (navigation privée) : on continue sans
const ecrire = (cle, valeur) => cacheSet(cle, valeur).catch(() => {});

function depuisCopie(copie, config) {
  return {
    data: copie.corps,
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders({ 'content-type': 'application/json', 'x-copie-hors-ligne': String(copie.le) }),
    config,
    request: {},
  };
}

function erreurHorsLigne(config) {
  // `response.data.detail` : les écrans affichent déjà ce champ quand une lecture échoue
  return new AxiosError(MESSAGE_HORS_LIGNE, CODE_HORS_LIGNE, config, null, {
    data: { detail: MESSAGE_HORS_LIGNE }, status: 0, statusText: '', headers: {}, config,
  });
}

const serveurInjoignable = (e) => e.code !== AxiosError.ERR_CANCELED && (!e.response || [502, 504].includes(e.response.status));

let instanceApi = null;

export function installerCacheHttp(instance) {
  instanceApi = instance;
  const reseau = axios.getAdapter(instance.defaults.adapter);

  instance.defaults.adapter = async (config) => {
    if (!cachable(config)) return reseau(config);
    const cle = scopedKey(`${PREFIXE}${instance.getUri(config)}`);
    const copie = await lire(cle);

    if (!estEnLigne()) {
      if (copie) return depuisCopie(copie, config);
      throw erreurHorsLigne(config);
    }
    try {
      const reponse = await reseau(copie && !config.timeout ? { ...config, timeout: DELAI_SI_COPIE_MS } : config);
      // à ce stade `data` est encore le texte brut : axios le décode après, pour une réponse réelle comme pour une copie
      if (typeof reponse.data === 'string' && String(reponse.headers['content-type'] || '').includes('json')) {
        ecrire(cle, { corps: reponse.data, le: Date.now() });
      }
      return reponse;
    } catch (e) {
      if (copie && serveurInjoignable(e)) return depuisCopie(copie, config);
      throw e;
    }
  };
}

/** Range une réponse déjà connue sous l'adresse d'où elle serait lue (ex. la fiche d'un élève, présente dans la liste). */
export function semerCopie(url, objet) {
  return ecrire(scopedKey(`${PREFIXE}${instanceApi.getUri({ url })}`), { corps: JSON.stringify(objet), le: Date.now() });
}

/** Déconnexion volontaire : les données de ce compte ne restent pas sur l'appareil (poste partagé). */
export async function viderCacheHttp() {
  try {
    const debut = scopedKey(PREFIXE);
    const lignes = await idbGetAll(STORE_CACHE);
    await Promise.all(lignes.filter((l) => l.key.startsWith(debut)).map((l) => idbDelete(STORE_CACHE, l.key)));
  } catch { /* rien à effacer */ }
}
