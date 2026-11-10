import { idbAdd, idbDelete, idbGet, idbGetAll, idbGetByIndex, idbPut, newClientId, STORE_OUTBOX, STORE_META } from './db';

const META_AUTH_PAUSED = 'auth_paused';

export async function enqueue(item) {
  const client_id = item.client_id || newClientId();
  const existing = await idbGetByIndex(STORE_OUTBOX, 'by_client_id', client_id);
  if (existing) return existing;

  return idbAdd(STORE_OUTBOX, {
    client_id,
    kind: item.kind,
    payload: item.payload,
    label: item.label || item.kind,
    created_at: Date.now(),
    attempts: 0,
    last_error: null,
  });
}

export async function listOutbox() {
  const rows = await idbGetAll(STORE_OUTBOX);
  return rows.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}

export async function pendingCount() {
  const rows = await idbGetAll(STORE_OUTBOX);
  return rows.length;
}

export async function removeOutbox(id) {
  await idbDelete(STORE_OUTBOX, id);
}

export async function updateOutbox(row) {
  await idbPut(STORE_OUTBOX, row);
}

export async function setAuthPaused(paused) {
  await idbPut(STORE_META, { key: META_AUTH_PAUSED, value: !!paused });
}

export async function isAuthPaused() {
  const row = await idbGet(STORE_META, META_AUTH_PAUSED);
  return !!(row && row.value);
}

export { newClientId };
