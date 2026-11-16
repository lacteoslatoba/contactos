// Two-way sync between the app and Google Contacts (People API), entirely in the browser.
import { mergeRemote, toPerson, type Contact, type Person } from './syncMerge';

export type { Contact } from './syncMerge';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'https://www.googleapis.com/auth/contacts';
const API = 'https://people.googleapis.com/v1';
const PERSON_FIELDS = 'names,phoneNumbers,emailAddresses,addresses,metadata';
const UPDATE_FIELDS = 'names,phoneNumbers,emailAddresses,addresses';
const META_KEY = 'score_google_sync_v1';
const TOKEN_KEY = 'score_google_token_v1';

interface SyncMeta {
  connected: boolean;
  syncToken?: string;
  pendingDeletes: string[];
  lastSync?: number;
}

export interface SyncResult {
  contacts: Contact[];
  summary: string;
  errors: number;
}

export class GoogleAuthError extends Error {}

class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Google API ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

// ---------- local state ----------

const loadMeta = (): SyncMeta => {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return { connected: !!m.connected, syncToken: m.syncToken, pendingDeletes: m.pendingDeletes ?? [], lastSync: m.lastSync };
  } catch {
    return { connected: false, pendingDeletes: [] };
  }
};

const saveMeta = (m: SyncMeta) => localStorage.setItem(META_KEY, JSON.stringify(m));

export const isGoogleConfigured = () => !!CLIENT_ID;
export const isGoogleConnected = () => loadMeta().connected;
export const getLastSync = () => loadMeta().lastSync;

/** Remember Google contacts deleted in the app so the next sync deletes them on the phone too. */
export const queueGoogleDeletes = (contacts: Contact[]) => {
  const ids = contacts.map(c => c.googleId).filter((x): x is string => !!x);
  if (ids.length === 0) return;
  const m = loadMeta();
  m.pendingDeletes = Array.from(new Set([...m.pendingDeletes, ...ids]));
  saveMeta(m);
};

export const disconnectGoogle = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(META_KEY);
};

// ---------- auth (Google Identity Services token flow) ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { google?: any }
}

let gisPromise: Promise<void> | null = null;
let tokenClient: any = null;
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

const loadGis = (): Promise<void> => {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(new Error('No se pudo cargar Google. ¿Hay internet?')); };
    document.head.appendChild(s);
  });
  return gisPromise;
};

const initClient = () => {
  if (tokenClient || !CLIENT_ID) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp: any) => {
      const p = pending; pending = null;
      if (!p) return;
      if (resp.error || !resp.access_token) {
        p.reject(new GoogleAuthError(resp.error_description || resp.error || 'Permiso denegado'));
        return;
      }
      const expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60_000;
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ token: resp.access_token, expiresAt }));
      p.resolve(resp.access_token);
    },
    error_callback: (err: any) => {
      const p = pending; pending = null;
      p?.reject(new GoogleAuthError(err?.type === 'popup_closed' ? 'Se cerró la ventana de Google' : 'No se pudo abrir la ventana de Google'));
    },
  });
};

/** Load Google's script ahead of time so the login popup can open instantly on a click. */
export const prepareGoogle = () => {
  if (!CLIENT_ID) return;
  loadGis().then(initClient).catch(() => { /* retried on demand */ });
};

export const getStoredToken = (): string | null => {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    return t && t.expiresAt > Date.now() ? t.token : null;
  } catch {
    return null;
  }
};

/**
 * Get an access token, opening Google's popup if needed.
 * Call it directly inside a click/keypress handler so the browser allows the popup.
 */
export const getToken = (): Promise<string> => {
  const stored = getStoredToken();
  if (stored) return Promise.resolve(stored);
  if (!CLIENT_ID) return Promise.reject(new Error('Falta configurar Google (VITE_GOOGLE_CLIENT_ID).'));
  const ask = () => new Promise<string>((resolve, reject) => {
    pending?.reject(new GoogleAuthError('Cancelado'));
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt: '' });
  });
  if (tokenClient) return ask();
  return loadGis().then(() => { initClient(); return ask(); });
};

// ---------- People API ----------

const api = async (token: string, path: string, body?: unknown, method = body ? 'POST' : 'GET') => {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new GoogleAuthError('La sesión de Google venció');
  }
  const text = await r.text();
  if (!r.ok) throw new ApiError(r.status, text);
  return text ? JSON.parse(text) : {};
};

const chunks = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const fetchChanges = async (token: string, syncToken?: string): Promise<{ people: Person[]; nextSyncToken?: string; full: boolean }> => {
  const people: Person[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  try {
    do {
      const q = new URLSearchParams({ personFields: PERSON_FIELDS, pageSize: '1000', requestSyncToken: 'true' });
      if (syncToken) q.set('syncToken', syncToken);
      if (pageToken) q.set('pageToken', pageToken);
      const res = await api(token, `/people/me/connections?${q}`);
      people.push(...(res.connections ?? []));
      pageToken = res.nextPageToken;
      nextSyncToken = res.nextSyncToken ?? nextSyncToken;
    } while (pageToken);
  } catch (e) {
    // Sync tokens expire after ~7 days: fall back to a full download.
    if (syncToken && e instanceof ApiError && (e.status === 410 || /EXPIRED_SYNC_TOKEN|sync token/i.test(e.body))) {
      return fetchChanges(token);
    }
    throw e;
  }
  return { people, nextSyncToken, full: !syncToken };
};

const isOk = (status?: { code?: number }) => !status || !status.code;

/** Full two-way sync. Google wins when the same contact changed on both sides. */
export async function syncWithGoogle(token: string, localContacts: Contact[]): Promise<SyncResult> {
  const meta = loadMeta();
  let errors = 0;

  // 1) Pull changes from Google.
  const { people, nextSyncToken, full } = await fetchChanges(token, meta.syncToken);
  const merged = mergeRemote(localContacts, people, full);
  let contacts = merged.contacts;
  // A contact deleted here but edited on the phone survives (Google wins); already-deleted ones are done.
  const toDelete = meta.pendingDeletes.filter(id => !merged.touched.has(id) && !merged.deleted.has(id));

  // 2) Push deletions.
  const deletedOk: string[] = [];
  for (const group of chunks(toDelete, 500)) {
    try {
      await api(token, '/people:batchDeleteContacts', { resourceNames: group });
      deletedOk.push(...group);
    } catch (e) {
      if (e instanceof GoogleAuthError) throw e;
      for (const id of group) {
        try { await api(token, `/${id}:deleteContact`, undefined, 'DELETE'); deletedOk.push(id); }
        catch (err) {
          if (err instanceof ApiError && err.status === 404) deletedOk.push(id);
          else if (err instanceof GoogleAuthError) throw err;
          else errors++;
        }
      }
    }
  }

  // 3) Push new contacts.
  const toCreate = contacts.filter(c => !c.googleId);
  let created = 0;
  for (const group of chunks(toCreate, 200)) {
    try {
      const res = await api(token, '/people:batchCreateContacts', {
        contacts: group.map(c => ({ contactPerson: toPerson(c) })),
        readMask: PERSON_FIELDS,
      });
      const results: any[] = res.createdPeople ?? [];
      const linked = new Map<string, Person>();
      group.forEach((c, i) => {
        const r = results[i];
        if (r?.person?.resourceName && isOk(r.status)) linked.set(c.id, r.person);
        else errors++;
      });
      contacts = contacts.map(c => {
        const p = linked.get(c.id);
        return p ? { ...c, googleId: p.resourceName, etag: p.etag, raw: { names: p.names, phoneNumbers: p.phoneNumbers, emailAddresses: p.emailAddresses, addresses: p.addresses }, dirty: false } : c;
      });
      created += linked.size;
    } catch (e) {
      if (e instanceof GoogleAuthError) throw e;
      errors += group.length;
    }
  }

  // 4) Push local edits.
  const toUpdate = contacts.filter(c => c.googleId && c.dirty);
  let updated = 0;
  for (const group of chunks(toUpdate, 200)) {
    try {
      const body: Record<string, unknown> = {};
      group.forEach(c => { body[c.googleId!] = { ...toPerson(c), resourceName: c.googleId, etag: c.etag }; });
      const res = await api(token, '/people:batchUpdateContacts', { contacts: body, updateMask: UPDATE_FIELDS, readMask: PERSON_FIELDS });
      const results: Record<string, any> = res.updateResult ?? {};
      contacts = contacts.map(c => {
        const r = c.googleId ? results[c.googleId] : undefined;
        if (!r) return c;
        if (!r.person || !isOk(r.status)) { errors++; return c; }
        updated++;
        const p: Person = r.person;
        return { ...c, etag: p.etag, raw: { names: p.names, phoneNumbers: p.phoneNumbers, emailAddresses: p.emailAddresses, addresses: p.addresses }, dirty: false };
      });
    } catch (e) {
      if (e instanceof GoogleAuthError) throw e;
      errors += group.length;
    }
  }

  saveMeta({
    connected: true,
    syncToken: nextSyncToken ?? meta.syncToken,
    pendingDeletes: meta.pendingDeletes.filter(id => !deletedOk.includes(id) && toDelete.includes(id)),
    lastSync: Date.now(),
  });

  const down = merged.added + merged.removed + (full ? 0 : merged.updated);
  const up = created + updated + deletedOk.length;
  const parts: string[] = [];
  if (full) parts.push(`${contacts.filter(c => c.googleId).length} contactos enlazados`);
  if (down) parts.push(`${down} cambios del celular`);
  if (up) parts.push(`${up} cambios enviados`);
  const summary = parts.length ? `Sincronizado: ${parts.join(', ')}` : 'Todo al día';
  return { contacts, summary: errors ? `${summary} (${errors} con error)` : summary, errors };
}
