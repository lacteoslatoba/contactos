// Pure merge logic between local contacts and Google People API data.
// No network or browser APIs here so it can be tested in isolation.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RemoteItem = Record<string, any>;

export interface RemoteFields {
  names?: RemoteItem[];
  phoneNumbers?: RemoteItem[];
  emailAddresses?: RemoteItem[];
  addresses?: RemoteItem[];
}

export interface Person extends RemoteFields {
  resourceName: string;
  etag?: string;
  metadata?: { deleted?: boolean; [k: string]: any };
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  tag: string;
  avatarSeed: string;
  /** Google resourceName ("people/c123") once linked. */
  googleId?: string;
  etag?: string;
  /** Edited locally since the last successful sync. */
  dirty?: boolean;
  /** Last data received from Google, used to avoid wiping extra phones/emails on update. */
  raw?: RemoteFields;
}

export interface MergeResult {
  contacts: Contact[];
  added: number;
  updated: number;
  removed: number;
  /** resourceNames that Google reported as existing (used to cancel pending deletes). */
  touched: Set<string>;
  /** resourceNames that Google reported as deleted. */
  deleted: Set<string>;
}

export const phoneKey = (phone: string): string => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
};

const primaryIndex = (list?: RemoteItem[]): number => {
  if (!list || list.length === 0) return 0;
  const i = list.findIndex(x => x?.metadata?.primary);
  return i >= 0 ? i : 0;
};

const pick = (list: RemoteItem[] | undefined, field: string): string => {
  if (!list || list.length === 0) return '';
  return (list[primaryIndex(list)]?.[field] ?? '').toString().trim();
};

export const fromPerson = (p: Person): Pick<Contact, 'name' | 'phone' | 'email' | 'address' | 'googleId' | 'etag' | 'raw' | 'dirty'> => {
  const phone = pick(p.phoneNumbers, 'value');
  const email = pick(p.emailAddresses, 'value');
  const name =
    pick(p.names, 'displayName') || pick(p.names, 'unstructuredName') || phone || email || 'Sin Nombre';
  return {
    name,
    phone,
    email,
    address: pick(p.addresses, 'formattedValue'),
    googleId: p.resourceName,
    etag: p.etag,
    raw: {
      names: p.names,
      phoneNumbers: p.phoneNumbers,
      emailAddresses: p.emailAddresses,
      addresses: p.addresses,
    },
    dirty: false,
  };
};

const newLocalId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Apply Google's data onto local contacts. Google wins on conflicts.
 * @param full true when `remote` is the complete list of Google contacts
 *             (first sync or expired sync token); false for incremental changes.
 */
export function mergeRemote(local: Contact[], remote: Person[], full: boolean): MergeResult {
  const contacts = local.map(c => ({ ...c }));
  const touched = new Set<string>();
  const deleted = new Set<string>();
  let added = 0;
  let updated = 0;
  let removed = 0;

  const indexByGoogleId = () => {
    const m = new Map<string, number>();
    contacts.forEach((c, i) => c.googleId && m.set(c.googleId, i));
    return m;
  };
  let byGoogle = indexByGoogleId();

  for (const p of remote) {
    if (!p?.resourceName) continue;
    if (p.metadata?.deleted) {
      deleted.add(p.resourceName);
      const i = byGoogle.get(p.resourceName);
      if (i !== undefined) {
        contacts.splice(i, 1);
        removed++;
        byGoogle = indexByGoogleId();
      }
      continue;
    }

    touched.add(p.resourceName);
    const data = fromPerson(p);
    const i = byGoogle.get(p.resourceName);
    if (i !== undefined) {
      contacts[i] = { ...contacts[i], ...data, avatarSeed: data.name };
      updated++;
      continue;
    }

    // Not linked yet: try to pair with an unlinked local contact with the same phone.
    const key = phoneKey(data.phone);
    const j = key ? contacts.findIndex(c => !c.googleId && phoneKey(c.phone) === key) : -1;
    if (j >= 0) {
      contacts[j] = { ...contacts[j], ...data, avatarSeed: data.name };
      byGoogle.set(p.resourceName, j);
      updated++;
      continue;
    }

    contacts.push({
      id: newLocalId(),
      tag: 'Celular',
      avatarSeed: data.name,
      ...data,
    });
    byGoogle.set(p.resourceName, contacts.length - 1);
    added++;
  }

  let result = contacts;
  if (full) {
    // Linked contacts that no longer exist in Google were deleted on the phone.
    const before = result.length;
    result = result.filter(c => !c.googleId || touched.has(c.googleId));
    removed += before - result.length;
  }

  // Drop unlinked local duplicates of a contact that already mirrors Google (same phone).
  const linkedKeys = new Set(result.filter(c => c.googleId).map(c => phoneKey(c.phone)).filter(Boolean));
  const before = result.length;
  result = result.filter(c => c.googleId || !phoneKey(c.phone) || !linkedKeys.has(phoneKey(c.phone)));
  removed += before - result.length;

  return { contacts: result, added, updated, removed, touched, deleted };
}

const keep = (item: RemoteItem, keys: string[]): RemoteItem => {
  const out: RemoteItem = {};
  for (const k of keys) if (item[k] !== undefined) out[k] = item[k];
  return out;
};

const NAME_KEYS = ['givenName', 'familyName', 'middleName', 'honorificPrefix', 'honorificSuffix',
  'phoneticGivenName', 'phoneticFamilyName', 'phoneticMiddleName', 'unstructuredName'];
const VALUE_KEYS = ['value', 'type'];
const ADDRESS_KEYS = ['formattedValue', 'type', 'poBox', 'streetAddress', 'extendedAddress', 'city',
  'region', 'postalCode', 'country', 'countryCode'];

/** Replace the primary entry of a list with `value`, keeping every other entry untouched. */
const replacePrimary = (
  list: RemoteItem[] | undefined,
  keys: string[],
  field: string,
  value: string,
  makeNew: (v: string) => RemoteItem,
): RemoteItem[] => {
  const idx = primaryIndex(list);
  const out = (list ?? []).map(x => keep(x, keys));
  const current = (out[idx]?.[field] ?? '').toString().trim();
  if (value) {
    if (out[idx]) {
      if (current !== value) {
        const type = out[idx].type;
        out[idx] = type ? { ...makeNew(value), type } : makeNew(value);
      }
    } else {
      out.push(makeNew(value));
    }
  } else if (out[idx]) {
    out.splice(idx, 1);
  }
  return out;
};

/** Build the People API body for a local contact (create or update). */
export function toPerson(c: Contact): RemoteFields {
  const raw = c.raw ?? {};
  const rawName = pick(raw.names, 'displayName') || pick(raw.names, 'unstructuredName');
  const names = raw.names && rawName === c.name
    ? raw.names.map(n => keep(n, NAME_KEYS))
    : (c.name ? [{ givenName: c.name }] : []);
  return {
    names,
    phoneNumbers: replacePrimary(raw.phoneNumbers, VALUE_KEYS, 'value', c.phone.trim(), v => ({ value: v })),
    emailAddresses: replacePrimary(raw.emailAddresses, VALUE_KEYS, 'value', c.email.trim(), v => ({ value: v })),
    addresses: replacePrimary(raw.addresses, ADDRESS_KEYS, 'formattedValue', c.address.trim(), v => ({ formattedValue: v })),
  };
}
