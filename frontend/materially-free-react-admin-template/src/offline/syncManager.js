import api from 'services/api';
import { cacheGet, cacheSet, CacheKeys } from './cacheStore';
import {
  enqueue, listOutbox, pendingCount, removeOutbox, updateOutbox,
  setAuthPaused, isAuthPaused, newClientId,
} from './outbox';

import { estEnLigne, demarrerSurveillanceReseau, surChangementReseau } from './reseau';
export const SyncStatus = {
  OFFLINE: 'offline',
  SYNCING: 'syncing',
  UP_TO_DATE: 'up_to_date',
  AUTH_PAUSED: 'auth_paused',
};

const listeners = new Set();
let state = {
  online: typeof navigator === 'undefined' ? true : estEnLigne(),
  status: SyncStatus.UP_TO_DATE,
  pending: 0,
  lastError: null,
};

let flushing = false;
let started = false;

function emit() {
  listeners.forEach((fn) => {
    try { fn({ ...state }); } catch { /* ignore */ }
  });
}

async function refreshPending() {
  try {
    state.pending = await pendingCount();
  } catch {
    state.pending = 0;
  }
  if (!state.online) {
    state.status = SyncStatus.OFFLINE;
  } else if (await isAuthPaused()) {
    state.status = SyncStatus.AUTH_PAUSED;
  } else if (flushing) {
    state.status = SyncStatus.SYNCING;
  } else {
    state.status = SyncStatus.UP_TO_DATE;
  }
  emit();
}

export function getSyncState() {
  return { ...state };
}

export function subscribeSync(fn) {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function pauseForAuth() {
  setAuthPaused(true).then(() => refreshPending());
}

export function resumeAfterLogin() {
  setAuthPaused(false).then(() => {
    refreshPending();
    flushOutbox();
  });
}

function needsAuth(kind) {
  return kind !== 'vitrine_dossier';
}

function formatOutboxError(err, item) {
  const data = err?.response?.data;
  const label = item?.label || 'modification';
  if (data) {
    if (data.matricule) {
      return `Échec sync : ce matricule existe déjà (${label}).`;
    }
    if (typeof data.detail === 'string') {
      return `Échec sync : ${data.detail}`;
    }
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    if (/matricule/i.test(text) && /unique|déjà|already|exist/i.test(text)) {
      return `Échec sync : ce matricule existe déjà (${label}).`;
    }
  }
  return `Échec de synchronisation : ${label}`;
}

async function replayItem(item) {
  const { kind, payload, client_id } = item;

  if (kind === 'eleve_create') {
    const { eleve, classe_id, password, username } = payload;
    // Le serveur crée le compte élève avec la fiche, avec le mot de passe déjà montré hors ligne
    const resEleve = await api.post('/eleves/', { ...eleve, client_id, mot_de_passe: password || undefined }, {
      headers: { 'X-Client-Id': client_id },
    });
    const eleveId = resEleve.data.id;

    if (classe_id) {
      const insCid = `${client_id}-ins`;
      await api.post('/inscriptions/', {
        eleve: eleveId,
        classe: classe_id,
        client_id: insCid,
      }, {
        headers: { 'X-Client-Id': insCid },
      });
    }

    const resUser = { data: resEleve.data.compte || { username: username || eleve.matricule } };

    try {
      const listKey = CacheKeys.elevesList('all:p1');
      const cached = await cacheGet(listKey);
      if (cached?.items) {
        const withoutLocal = cached.items.filter(
          (e) => e.client_id !== client_id && e.id !== `local-${client_id}`,
        );
        const next = [resEleve.data, ...withoutLocal.filter((e) => e.id !== resEleve.data.id)];
        await cacheSet(listKey, {
          ...cached,
          items: next,
          count: Math.max(cached.count || next.length, next.length),
        });
      }
    } catch { /* ignore */ }

    return {
      eleve: resEleve.data,
      user: resUser.data,
      mot_de_passe_temporaire: password || resUser.data?.mot_de_passe_temporaire || '',
    };
  }

  if (kind === 'presences_masse') {
    const body = { ...payload, client_id };
    const res = await api.post('/presences/saisie-masse/', body);
    try {
      const key = CacheKeys.presences(payload.classe_matiere_id, payload.date);
      const items = (payload.presences || []).map((p) => ({
        eleve: p.eleve_id,
        statut: p.statut,
        classe_matiere: payload.classe_matiere_id,
        date: payload.date,
      }));
      await cacheSet(key, items);
    } catch { /* ignore */ }
    return res.data;
  }

  if (kind === 'notes_batch') {
    let evaluationId = payload.evaluation_id;
    if (payload.create_evaluation) {
      const evalBody = { ...payload.create_evaluation, client_id: `${client_id}-eval` };
      const resEval = await api.post('/evaluations/', evalBody);
      evaluationId = resEval.data.id;
      try {
        const list = (await cacheGet(CacheKeys.evaluations())) || [];
        const arr = Array.isArray(list) ? [...list] : [...(list.results || [])];
        const next = arr.filter((e) => e.id !== evaluationId);
        next.push(resEval.data);
        await cacheSet(CacheKeys.evaluations(), next);
      } catch { /* ignore */ }
    }
    const body = {
      evaluation_id: evaluationId,
      notes: payload.notes,
      client_id,
    };
    const res = await api.post('/notes/saisie-masse/', body);
    try {
      await cacheSet(CacheKeys.evalNotes(evaluationId), (payload.notes || []).map((n) => ({
        eleve: n.eleve_id,
        valeur: n.valeur,
        evaluation: evaluationId,
      })));
    } catch { /* ignore */ }
    return res.data;
  }

  if (kind === 'paiement') {
    const { dossier_id, ...rest } = payload;
    const res = await api.post(`/dossiers-scolarite/${dossier_id}/paiement/`, {
      ...rest,
      client_id,
    }, {
      headers: { 'X-Client-Id': client_id },
    });
    try {
      // la copie de la caisse contient aussi l'année, les classes et les tarifs : seul ce dossier change
      const cached = await cacheGet(CacheKeys.caisse());
      if (cached?.dossiers && res.data?.dossier) {
        await cacheSet(CacheKeys.caisse(), {
          ...cached,
          dossiers: cached.dossiers.map((d) => (d.id === dossier_id ? res.data.dossier : d)),
        });
      }
    } catch { /* ignore */ }
    return res.data;
  }

  if (kind === 'message') {
    const res = await api.post('/sms/envoyer/', { ...payload, client_id }, {
      headers: { 'X-Client-Id': client_id },
    });
    return res.data;
  }

  if (kind === 'vitrine_dossier') {
    const { slug, fields } = payload;
    const res = await api.post(`/vitrine/${slug}/dossiers/`, { ...fields, client_id }, {
      headers: { 'X-Client-Id': client_id },
    });
    return res.data;
  }

  if (kind === 'http') {
    const { method, url, data } = payload;
    const res = await api.request({
      method: method || 'POST',
      url,
      data: data || {},
      headers: client_id ? { 'X-Client-Id': client_id } : {},
    });
    return res.data;
  }

  throw new Error(`Kind inconnu: ${kind}`);
}

export async function flushOutbox() {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && !estEnLigne()) {
    state.online = false;
    state.status = SyncStatus.OFFLINE;
    emit();
    return;
  }
  if (await isAuthPaused()) {
    state.status = SyncStatus.AUTH_PAUSED;
    emit();
    return;
  }

  const hasToken = !!localStorage.getItem('access_token');

  flushing = true;
  state.status = SyncStatus.SYNCING;
  state.online = true;
  state.lastError = null;
  emit();

  try {
    const items = await listOutbox();
    for (const item of items) {
      if (needsAuth(item.kind) && !hasToken) {
        continue;
      }
      try {
        await replayItem(item);
        await removeOutbox(item.id);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 && needsAuth(item.kind)) {
          await setAuthPaused(true);
          state.status = SyncStatus.AUTH_PAUSED;
          state.lastError = 'Reconnectez-vous pour synchroniser';
          emit();
          break;
        }
        item.attempts = (item.attempts || 0) + 1;
        item.last_error = formatOutboxError(err, item);
        item.last_status = status || 0;
        try { item.last_detail = JSON.stringify(err?.response?.data ?? err?.message ?? '').slice(0, 400); } catch { item.last_detail = ''; }
        state.lastError = item.last_error;
        await updateOutbox(item);
        emit();
        if (status && status >= 400 && status < 500) continue;
        break;
      }
    }
  } finally {
    flushing = false;
    await refreshPending();
  }
}

/** Éléments de la file avec leur dernière erreur (pour l'affichage détaillé). */
export async function listOutboxItems() {
  return listOutbox();
}

/** Abandonne une seule action de la file. */
export async function discardItem(id) {
  await removeOutbox(id);
  const reste = await listOutbox();
  if (!reste.some((i) => i.last_error)) state.lastError = null;
  await refreshPending();
}

/** Abandonne les éléments de la file refusés par le serveur (last_error renseigné). */
export async function discardFailed() {
  const items = await listOutbox();
  for (const item of items) {
    if (item.last_error) await removeOutbox(item.id);
  }
  state.lastError = null;
  await refreshPending();
}

/**
 * Envoie immédiatement ou met en file d'attente hors ligne.
 * @returns {{ queued: boolean, data?: any, client_id?: string }}
 */
export async function sendOrQueue({ kind, payload, label, client_id }) {
  const cid = client_id || newClientId();

  if (typeof navigator !== 'undefined' && !estEnLigne()) {
    await enqueue({ kind, payload, label, client_id: cid });
    await refreshPending();
    return { queued: true, client_id: cid };
  }

  try {
    const data = await replayItem({ kind, payload, client_id: cid });
    await refreshPending();
    return { queued: false, data, client_id: cid };
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401 && needsAuth(kind)) {
      await setAuthPaused(true);
      await enqueue({ kind, payload, label, client_id: cid });
      await refreshPending();
      return { queued: true, client_id: cid };
    }
    if (!err.response) {
      await enqueue({ kind, payload, label, client_id: cid });
      await refreshPending();
      return { queued: true, client_id: cid };
    }
    throw err;
  }
}

export const QUEUED_MSG = 'Enregistré, sera envoyé dès la connexion';
export const RECU_PENDING_MSG = 'Reçu disponible après synchronisation';

export function startSyncManager() {
  if (started || typeof window === 'undefined') return;
  started = true;

  state.online = estEnLigne();
  refreshPending();

  // « En ligne » = le navigateur a un réseau OU le serveur répond (voir offline/reseau.js)
  demarrerSurveillanceReseau();
  surChangementReseau((enLigne) => {
    state.online = enLigne;
    if (enLigne) {
      emit();
      flushOutbox();
    } else {
      state.status = SyncStatus.OFFLINE;
      emit();
    }
  });

  if (estEnLigne()) {
    setTimeout(() => flushOutbox(), 800);
  }
}
