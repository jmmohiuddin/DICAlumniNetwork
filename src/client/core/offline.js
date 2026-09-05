/*
 * offline.js — PRD REQ-10, the Low-Bandwidth & Offline Sync Engine.
 *
 * Three jobs, in one classic <script> like every other client module:
 *
 *   1. Register the root service worker (sw.js) for the static app shell.
 *   2. Keep a per-user IndexedDB copy of directory / API reads, draft
 *      submissions and critical local state, and serve it when the network
 *      is gone (network-first, offline-fallback).
 *   3. Queue outgoing writes made while offline and replay them, oldest
 *      first, when the connection returns — idempotently, and capped.
 *
 * WHY NOT DEXIE
 * -------------
 * The PRD names Dexie.js. This project has no bundler and no build step, so
 * using it would mean a third-party <script> from a CDN — a new runtime
 * dependency, a new origin to trust, and one more thing that has to load
 * before the app works on the exact slow connection this feature exists for.
 * The subset of Dexie actually needed here is "open a database and get/put/
 * delete with promises", which is the ~90 lines below.
 *
 * WHY THE API CACHE LIVES HERE AND NOT IN THE SERVICE WORKER
 * ----------------------------------------------------------
 * Cache Storage is one bucket per origin, shared by every session on the
 * device, and a service worker cannot read the bearer token in localStorage,
 * so it cannot tell whose data a response holds. Every record written here is
 * therefore tagged with a namespace derived from the signed-in user, reads are
 * filtered by that namespace, and a change of session drops the previous
 * namespace's cached data before anything can be read out of it. sw.js passes
 * /api/ straight through to the network for the same reason — see its header.
 *
 * FAIL-SAFE
 * ---------
 * Every entry point is wrapped. Without IndexedDB, without service workers, or
 * in a private window where opening a database throws, this file does nothing
 * at all and the app behaves exactly as it did before it existed.
 */

'use strict';

// ─── LIMITS (from the PRD's approved open-questions matrix) ──
// 5 MB per background sync cycle: a replay must not saturate a 2G uplink or
// blow through a metered data plan the moment the phone finds signal. Anything
// still queued after the budget is spent waits for the next cycle.
const OFFLINE_SYNC_CYCLE_BYTES = 5 * 1024 * 1024;
// 100 MB dynamic cache ceiling with LRU eviction.
const OFFLINE_CACHE_LIMIT_BYTES = 100 * 1024 * 1024;
// Evicting exactly to the ceiling would re-trigger eviction on the next write,
// so drain to 90% and get many writes before paying that cost again.
const OFFLINE_CACHE_TARGET_BYTES = Math.floor(OFFLINE_CACHE_LIMIT_BYTES * 0.9);
// A mutation this old is not replayed. A week-old edit landing on top of newer
// server state is worse than losing it, and the user has long since moved on.
const OFFLINE_MUTATION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Gap between sync cycles when the budget ran out with work left over.
const OFFLINE_CYCLE_COOLDOWN_MS = 15 * 1000;
// Cached reads older than this are still served offline (better than nothing)
// but are reported as stale via the X-DIC-Cached-At response header.
const OFFLINE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const OFFLINE_DB_NAME = 'dic-offline';
const OFFLINE_DB_VERSION = 1;

// Endpoints whose responses are never written to IndexedDB. Auth replies carry
// credentials; the vault, DSAR export and audit log carry decrypted PII or
// another person's access history, and none of them are useful offline.
const OFFLINE_NEVER_CACHE = [
  '/api/auth/',
  '/api/vault',
  '/api/dsar/',
  '/api/audit-logs',
  '/api/planner/report'
];

// The one authenticated response that IS cached, and the reason it has to be.
//
// core/runtime.js boots with `const user = await API.me(); if (!user)
// API.logout()`. API.me() returns null for *any* failure, including "the
// server is unreachable" — so without this, the first reload on a train
// deletes the session token and drops the user at the login screen with no
// way back in until they have signal. Every offline feature below is dead
// weight if the app signs itself out the moment it goes offline.
//
// Caching the identity payload lets that boot succeed from IndexedDB. It does
// not weaken anything: the token itself is unchanged and still has to be
// accepted by the server for any real request, the record is namespaced to
// that exact token so a different session never resolves it, and queued
// writes are validated server-side when they replay. This is the standard
// offline-first bargain — the session is *presented* optimistically, never
// *authorised* locally.
const OFFLINE_CACHE_EXCEPTIONS = ['/api/auth/me'];

// Writes to these are never queued. A failed login must surface as a failed
// login, not as "we'll sign you in later", and a bulk import is far too large
// to belong in a sync cycle.
const OFFLINE_NEVER_QUEUE = [
  '/api/auth/',
  '/api/bulk-import'
];

/* ============================================================
   SMALL UTILITIES
   These avoid URL, TextEncoder, Blob and CustomEvent at load time on purpose:
   tools/smoke-load-client.js executes this file in a bare VM context where
   none of them exist, and a load-time throw there fails the build.
   ============================================================ */

function offlineByteLength(str) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(str).length;
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF) { bytes += 4; i++; } // surrogate pair
    else bytes += 3;
  }
  return bytes;
}

function offlineRequestUrl(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return String(input || '');
}

// Origin-relative path+query, used as the cache key so the same resource is
// not stored twice under an absolute and a relative spelling.
function offlineCacheKeyFor(url) {
  const origin = (typeof location !== 'undefined' && location.origin) || '';
  let path = String(url || '');
  if (origin && path.indexOf(origin) === 0) path = path.slice(origin.length);
  const hash = path.indexOf('#');
  if (hash !== -1) path = path.slice(0, hash);
  return path;
}

function offlineIsApiPath(path) {
  return path.indexOf('/api/') === 0;
}

function offlineMatchesAny(path, prefixes) {
  for (let i = 0; i < prefixes.length; i++) {
    if (path.indexOf(prefixes[i]) === 0) return true;
  }
  return false;
}

// Query strings are ignored: /api/auth/me and /api/auth/me?x=1 are the same
// endpoint as far as the never-cache rules are concerned.
function offlineIsCacheable(path) {
  const bare = path.split('?')[0];
  if (OFFLINE_CACHE_EXCEPTIONS.indexOf(bare) !== -1) return true;
  return !offlineMatchesAny(path, OFFLINE_NEVER_CACHE);
}

// FNV-1a. Not a security primitive — it turns the session token into a short,
// stable namespace tag so two different sessions can never collide on a cache
// key. The token itself is never written to IndexedDB.
function offlineHashTag(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

function offlineSessionToken() {
  try { return localStorage.getItem('dic_session_token'); } catch (err) { return null; }
}

function offlineMutationId() {
  try {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (err) { /* fall through */ }
  return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

function offlineIsOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function offlineEmit(name, detail) {
  try {
    if (typeof CustomEvent !== 'function' || typeof window === 'undefined' ||
        typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(name, { detail: detail }));
  } catch (err) { /* event delivery is best-effort */ }
}

/* ============================================================
   INDEXEDDB — the promise wrapper that stands in for Dexie
   ============================================================ */

let offlineDbPromise = null;

function offlineIdbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function offlineOpenDb() {
  if (offlineDbPromise) return offlineDbPromise;
  offlineDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined' || !indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const open = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      // Cached API reads. `ns` is the per-user namespace; `lastAccess` drives
      // LRU eviction, which is why it is indexed rather than scanned.
      if (!db.objectStoreNames.contains('apiCache')) {
        const store = db.createObjectStore('apiCache', { keyPath: 'key' });
        store.createIndex('ns', 'ns', { unique: false });
        store.createIndex('lastAccess', 'lastAccess', { unique: false });
      }
      // Outgoing writes waiting for a connection. autoIncrement means the
      // primary key is also the chronological order they must replay in.
      if (!db.objectStoreNames.contains('queue')) {
        const store = db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
        store.createIndex('ns', 'ns', { unique: false });
      }
      // Draft submissions and critical local state, keyed ns + name.
      if (!db.objectStoreNames.contains('drafts')) {
        const store = db.createObjectStore('drafts', { keyPath: 'key' });
        store.createIndex('ns', 'ns', { unique: false });
      }
      // Engine bookkeeping: active namespace, cache byte total, last sync.
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error || new Error('IndexedDB open failed'));
    open.onblocked = () => reject(new Error('IndexedDB open blocked by another tab'));
  }).catch((err) => {
    // Reset so a later attempt can retry — Safari private mode fails the first
    // open of a session and then succeeds.
    offlineDbPromise = null;
    throw err;
  });
  return offlineDbPromise;
}

/**
 * Runs `work(tx)` inside one transaction. `work` must issue its IndexedDB
 * requests without awaiting anything else — an await on an unrelated promise
 * lets the transaction go idle and auto-close between requests.
 */
function offlineTx(stores, mode, work) {
  return offlineOpenDb().then((db) => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(stores, mode);
    } catch (err) { reject(err); return; }
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    Promise.resolve()
      .then(() => work(tx))
      .then((value) => { result = value; })
      .catch((err) => {
        try { tx.abort(); } catch (abortErr) { /* already finished */ }
        reject(err);
      });
  }));
}

function offlineMetaGet(tx, key, fallback) {
  return offlineIdbRequest(tx.objectStore('meta').get(key))
    .then((rec) => (rec ? rec.value : fallback));
}

function offlineMetaPut(tx, key, value) {
  tx.objectStore('meta').put({ key: key, value: value });
}

/* ============================================================
   USER NAMESPACE

   Resolution order: an explicit id from offlineSetUser() > a tag derived from
   the session token > 'anon'. Whenever the token changes — a sign-in, a
   sign-out, a different person on a shared phone — the explicit id is dropped
   and every other namespace's cached reads and drafts are deleted, so the new
   session cannot read the previous one's data even if nothing called the
   logout hook.
   ============================================================ */

let offlineActiveNs = null;
let offlineActiveTokenTag = null;
let offlineNsRestored = false;

function offlineTokenTag() {
  const token = offlineSessionToken();
  return token ? 'u' + offlineHashTag(token) : 'anon';
}

function offlineNamespace() {
  const tag = offlineTokenTag();
  if (offlineActiveTokenTag === null || tag !== offlineActiveTokenTag) {
    const changed = offlineActiveTokenTag !== null;
    offlineActiveTokenTag = tag;
    offlineActiveNs = tag;
    if (changed) offlinePurgeForeignNamespaces();
  }
  return offlineActiveNs || tag;
}

// Restores the namespace chosen before the last reload, so a page refresh does
// not orphan everything the previous page stored.
function offlineRestoreNamespace() {
  if (offlineNsRestored) return Promise.resolve(offlineNamespace());
  offlineNsRestored = true;
  return offlineTx(['meta'], 'readonly', (tx) => Promise.all([
    offlineMetaGet(tx, 'activeNs', null),
    offlineMetaGet(tx, 'activeTokenTag', null)
  ])).then((values) => {
    const storedNs = values[0];
    const storedTag = values[1];
    const tag = offlineTokenTag();
    if (storedNs && storedTag === tag) {
      offlineActiveNs = storedNs;
      offlineActiveTokenTag = tag;
      return storedNs;
    }
    offlineActiveTokenTag = tag;
    offlineActiveNs = tag;
    // A token we have no record of: treat everything else as another session.
    return offlinePurgeForeignNamespaces().then(() => offlineActiveNs);
  }).catch(() => offlineNamespace());
}

/**
 * Pins the cache namespace to a stable user id. Without this the namespace is
 * derived from the token, so re-authenticating looks like a different person
 * and discards the cache. Call it right after a session is established.
 */
function offlineSetUser(user) {
  const id = user && (user.id !== undefined && user.id !== null ? user.id : user.uid);
  if (id === undefined || id === null) return Promise.resolve(null);
  const ns = 'user-' + String(id);
  const tag = offlineTokenTag();
  const changed = offlineActiveNs !== ns;
  offlineActiveNs = ns;
  offlineActiveTokenTag = tag;
  offlineNsRestored = true;
  return offlineTx(['meta'], 'readwrite', (tx) => {
    offlineMetaPut(tx, 'activeNs', ns);
    offlineMetaPut(tx, 'activeTokenTag', tag);
    return ns;
  }).then(() => (changed ? offlinePurgeForeignNamespaces() : null))
    .then(() => offlineUpdateSyncIndicator())
    .then(() => ns)
    .catch(() => ns);
}

// Deletes cached reads and drafts belonging to any namespace other than the
// current one. Queued mutations are left alone: they are only ever replayed
// under their own namespace, and dropping someone's unsent write the moment a
// colleague borrows the phone loses real work. They still expire after
// OFFLINE_MUTATION_MAX_AGE_MS like every other queue entry.
function offlinePurgeForeignNamespaces() {
  const ns = offlineActiveNs;
  if (!ns) return Promise.resolve(0);
  return offlineTx(['apiCache', 'drafts', 'meta'], 'readwrite', (tx) => {
    let removed = 0;
    let freed = 0;
    const sweep = (storeName) => new Promise((resolve, reject) => {
      const cursorReq = tx.objectStore(storeName).openCursor();
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) { resolve(); return; }
        if (cursor.value && cursor.value.ns !== ns) {
          if (storeName === 'apiCache') freed += cursor.value.bytes || 0;
          removed++;
          cursor.delete();
        }
        cursor.continue();
      };
    });
    return sweep('apiCache')
      .then(() => sweep('drafts'))
      .then(() => offlineMetaGet(tx, 'cacheBytes', 0))
      .then((total) => {
        offlineMetaPut(tx, 'cacheBytes', Math.max(0, (total || 0) - freed));
        offlineMetaPut(tx, 'activeNs', ns);
        offlineMetaPut(tx, 'activeTokenTag', offlineActiveTokenTag);
        return removed;
      });
  }).catch(() => 0);
}

/**
 * Logout hook. Clears this user's cached reads and drafts. Pending mutations
 * are kept unless `force` is true, so signing out on a flaky connection does
 * not silently discard writes; call offlineSyncStatus() first if the UI wants
 * to warn about them. Returns { cleared, pendingKept }.
 */
function offlineClearUserData(force) {
  const ns = offlineNamespace();
  return offlineTx(['apiCache', 'drafts', 'queue', 'meta'], 'readwrite', (tx) => {
    let cleared = 0;
    let freed = 0;
    let pendingKept = 0;
    const sweep = (storeName, drop) => new Promise((resolve, reject) => {
      const cursorReq = tx.objectStore(storeName).index('ns').openCursor(IDBKeyRange.only(ns));
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) { resolve(); return; }
        if (drop) {
          if (storeName === 'apiCache') freed += cursor.value.bytes || 0;
          cleared++;
          cursor.delete();
        } else {
          pendingKept++;
        }
        cursor.continue();
      };
    });
    return sweep('apiCache', true)
      .then(() => sweep('drafts', true))
      .then(() => sweep('queue', !!force))
      .then(() => offlineMetaGet(tx, 'cacheBytes', 0))
      .then((total) => {
        offlineMetaPut(tx, 'cacheBytes', Math.max(0, (total || 0) - freed));
        return { cleared: cleared, pendingKept: pendingKept };
      });
  }).then((result) => {
    // Next resolution falls back to the token tag (which logout just cleared).
    offlineActiveNs = null;
    offlineActiveTokenTag = null;
    offlineNsRestored = false;
    return offlineUpdateSyncIndicator().then(() => result);
  }).catch(() => ({ cleared: 0, pendingKept: 0 }));
}

/* ============================================================
   DYNAMIC CACHE — 100 MB ceiling, LRU eviction
   ============================================================ */

function offlineCacheRead(path) {
  const ns = offlineNamespace();
  const key = ns + '::' + path;
  return offlineTx(['apiCache'], 'readwrite', (tx) => {
    const store = tx.objectStore('apiCache');
    return offlineIdbRequest(store.get(key)).then((rec) => {
      if (!rec || rec.ns !== ns) return null;
      // Touching on read is what makes the eviction order least-*recently*-used
      // rather than least-recently-written.
      rec.lastAccess = Date.now();
      store.put(rec);
      return rec;
    });
  }).catch(() => null);
}

function offlineCacheWrite(path, status, contentType, bodyText) {
  const ns = offlineNamespace();
  const key = ns + '::' + path;
  const bytes = offlineByteLength(bodyText) + offlineByteLength(key) + 64; // + record overhead
  // One response must never be able to blow the whole budget on its own.
  if (bytes > OFFLINE_CACHE_LIMIT_BYTES / 4) return Promise.resolve(false);
  const now = Date.now();
  const record = {
    key: key, ns: ns, path: path, status: status,
    contentType: contentType || 'application/json',
    body: bodyText, bytes: bytes, storedAt: now, lastAccess: now
  };
  return offlineTx(['apiCache', 'meta'], 'readwrite', (tx) => {
    const store = tx.objectStore('apiCache');
    return offlineIdbRequest(store.get(key)).then((existing) => {
      const delta = bytes - (existing ? existing.bytes || 0 : 0);
      store.put(record);
      return offlineMetaGet(tx, 'cacheBytes', 0).then((total) => {
        const next = Math.max(0, (total || 0) + delta);
        offlineMetaPut(tx, 'cacheBytes', next);
        return next;
      });
    });
  }).then((total) => {
    if (total > OFFLINE_CACHE_LIMIT_BYTES) return offlineEvictLru().then(() => true);
    return true;
  }).catch(() => false);
}

// Walks the lastAccess index oldest-first, deleting until the store is back
// under OFFLINE_CACHE_TARGET_BYTES. Eviction spans every namespace, because
// the ceiling is a device storage limit, not a per-user quota.
function offlineEvictLru() {
  return offlineTx(['apiCache', 'meta'], 'readwrite', (tx) => {
    const store = tx.objectStore('apiCache');
    return offlineMetaGet(tx, 'cacheBytes', 0).then((total) => new Promise((resolve, reject) => {
      let remaining = total || 0;
      let evicted = 0;
      if (remaining <= OFFLINE_CACHE_TARGET_BYTES) { resolve({ remaining: remaining, evicted: 0 }); return; }
      const cursorReq = store.index('lastAccess').openCursor();
      cursorReq.onerror = () => reject(cursorReq.error);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || remaining <= OFFLINE_CACHE_TARGET_BYTES) {
          offlineMetaPut(tx, 'cacheBytes', Math.max(0, remaining));
          resolve({ remaining: remaining, evicted: evicted });
          return;
        }
        remaining -= cursor.value.bytes || 0;
        evicted++;
        cursor.delete();
        cursor.continue();
      };
    }));
  }).catch(() => ({ remaining: 0, evicted: 0 }));
}

/* ============================================================
   DRAFTS & CRITICAL LOCAL STATE
   ============================================================ */

function offlineSaveDraft(name, value, kind) {
  const ns = offlineNamespace();
  return offlineTx(['drafts'], 'readwrite', (tx) => {
    tx.objectStore('drafts').put({
      key: ns + '::' + name, ns: ns, name: name,
      kind: kind || 'draft', value: value, updatedAt: Date.now()
    });
    return true;
  }).catch(() => false);
}

function offlineReadDraft(name) {
  const ns = offlineNamespace();
  return offlineTx(['drafts'], 'readonly', (tx) =>
    offlineIdbRequest(tx.objectStore('drafts').get(ns + '::' + name))
  ).then((rec) => (rec && rec.ns === ns ? rec.value : null)).catch(() => null);
}

function offlineDeleteDraft(name) {
  const ns = offlineNamespace();
  return offlineTx(['drafts'], 'readwrite', (tx) => {
    tx.objectStore('drafts').delete(ns + '::' + name);
    return true;
  }).catch(() => false);
}

function offlineListDrafts(kind) {
  const ns = offlineNamespace();
  return offlineTx(['drafts'], 'readonly', (tx) =>
    offlineIdbRequest(tx.objectStore('drafts').index('ns').getAll(IDBKeyRange.only(ns)))
  ).then((rows) => (rows || []).filter((r) => !kind || r.kind === kind)).catch(() => []);
}

// Thin aliases so "critical local state" reads as state, not as a draft.
function offlineSaveState(name, value) { return offlineSaveDraft(name, value, 'state'); }
function offlineReadState(name) { return offlineReadDraft(name); }

/* ============================================================
   BACKGROUND SYNC MANAGER
   ============================================================ */

/**
 * Queues one write for replay. Every entry carries a client mutation id, sent
 * back to the server as `clientMutationId`; the backend records it in
 * sync_mutations and answers a repeat with { duplicate: true } instead of
 * acting twice (see src/server/modules/events/routes.js). That is what makes a
 * replay safe when the response to the original attempt was lost rather than
 * never sent.
 */
function offlineQueueMutation(options) {
  const opts = options || {};
  const ns = offlineNamespace();
  const path = offlineCacheKeyFor(opts.url || '');
  const clientMutationId = opts.clientMutationId || offlineMutationId();
  const bodyText = typeof opts.body === 'string'
    ? opts.body
    : (opts.body === undefined || opts.body === null ? null : JSON.stringify(opts.body));
  const bytes = offlineByteLength(bodyText || '') + offlineByteLength(path) + 128;

  if (bytes > OFFLINE_SYNC_CYCLE_BYTES) {
    // It could never be replayed inside one cycle's budget, so queuing it would
    // only wedge the queue. Refuse loudly instead.
    return Promise.reject(new Error('Mutation exceeds the ' +
      Math.round(OFFLINE_SYNC_CYCLE_BYTES / 1024 / 1024) + 'MB sync cycle limit'));
  }

  const record = {
    ns: ns,
    clientMutationId: clientMutationId,
    method: (opts.method || 'POST').toUpperCase(),
    path: path,
    contentType: opts.contentType || 'application/json',
    body: bodyText,
    label: opts.label || (opts.method || 'POST') + ' ' + path,
    createdAt: offlineStampNow(),
    attempts: 0,
    bytes: bytes
  };

  return offlineTx(['queue'], 'readwrite', (tx) =>
    offlineIdbRequest(tx.objectStore('queue').add(record))
  ).then((id) => {
    offlineEmit('dic:sync-queued', { id: id, label: record.label, clientMutationId: clientMutationId });
    return offlineUpdateSyncIndicator().then(() => ({
      queued: true, id: id, clientMutationId: clientMutationId
    }));
  });
}

// Timestamp validation, half one. A device clock that is wrong in the future
// would make a mutation immortal (never older than MAX_AGE) and would sort
// ahead of everything on the server. Clamp anything implausible to now.
function offlineStampNow() {
  const now = Date.now();
  if (!isFinite(now) || now < 1600000000000) return 1600000000000; // pre-2020 clock
  return now;
}

let offlineFlushing = false;
let offlineCooldownTimer = null;

/**
 * One background sync cycle. Replays queued writes in the order they were made
 * until the 5MB budget is spent, then stops and schedules the next cycle.
 * Returns { sent, dropped, failed, remaining, bytes }.
 */
function offlineFlushQueue() {
  if (offlineFlushing) return Promise.resolve(null);
  if (!offlineIsOnline()) return Promise.resolve(null);
  offlineFlushing = true;
  const ns = offlineNamespace();

  return offlineTx(['queue'], 'readonly', (tx) =>
    offlineIdbRequest(tx.objectStore('queue').index('ns').getAll(IDBKeyRange.only(ns)))
  ).then((rows) => {
    // getAll on the ns index returns primary-key order within the namespace,
    // and the primary key is autoIncrement, so this is already chronological.
    const pending = (rows || []).slice().sort((a, b) => a.id - b.id);
    const summary = { sent: 0, dropped: 0, failed: 0, remaining: 0, bytes: 0 };
    let budget = OFFLINE_SYNC_CYCLE_BYTES;
    let index = 0;

    const step = () => {
      if (index >= pending.length) return Promise.resolve(summary);
      const record = pending[index];

      // Timestamp validation, half two: too old to be safe to apply.
      if (offlineStampNow() - record.createdAt > OFFLINE_MUTATION_MAX_AGE_MS) {
        index++;
        summary.dropped++;
        return offlineQueueDelete(record.id).then(step);
      }
      // Budget check. Always let the first record through, otherwise a single
      // oversized entry at the head would stall the queue forever.
      if (record.bytes > budget && summary.sent > 0) {
        summary.remaining = pending.length - index;
        return Promise.resolve(summary);
      }

      return offlineReplayOne(record).then((outcome) => {
        index++;
        if (outcome === 'done') {
          summary.sent++;
          summary.bytes += record.bytes;
          budget -= record.bytes;
          return offlineQueueDelete(record.id).then(step);
        }
        if (outcome === 'permanent') {
          // The server answered and refused. Retrying forever would block
          // every later mutation behind it, so it is dropped and reported.
          summary.dropped++;
          return offlineQueueDelete(record.id).then(step);
        }
        // 'retry' — network or 5xx. Stop the cycle; order must be preserved.
        summary.failed++;
        summary.remaining = pending.length - index + 1;
        return offlineQueueBumpAttempts(record.id).then(() => summary);
      });
    };

    return step();
  }).then((summary) => {
    offlineFlushing = false;
    if (!summary) return null;
    return offlineTx(['meta'], 'readwrite', (tx) => {
      offlineMetaPut(tx, 'lastSyncAt', Date.now());
      return true;
    }).catch(() => true).then(() => {
      offlineEmit('dic:sync-flushed', summary);
      if (summary.sent || summary.dropped) offlineNotify(offlineFlushMessage(summary));
      if (summary.remaining > 0) offlineScheduleCycle();
      return offlineUpdateSyncIndicator().then(() => summary);
    });
  }).catch((err) => {
    offlineFlushing = false;
    return null;
  });
}

function offlineFlushMessage(summary) {
  const parts = [];
  if (summary.sent) parts.push(summary.sent + ' change' + (summary.sent === 1 ? '' : 's') + ' synced');
  if (summary.dropped) parts.push(summary.dropped + ' discarded');
  if (summary.remaining) parts.push(summary.remaining + ' still queued');
  return '🟢 ' + parts.join(' · ');
}

function offlineQueueDelete(id) {
  return offlineTx(['queue'], 'readwrite', (tx) => {
    tx.objectStore('queue').delete(id);
    return true;
  }).catch(() => false);
}

function offlineQueueBumpAttempts(id) {
  return offlineTx(['queue'], 'readwrite', (tx) => {
    const store = tx.objectStore('queue');
    return offlineIdbRequest(store.get(id)).then((rec) => {
      if (!rec) return false;
      rec.attempts = (rec.attempts || 0) + 1;
      rec.lastAttemptAt = Date.now();
      store.put(rec);
      return true;
    });
  }).catch(() => false);
}

// Sends one queued mutation. Resolves 'done' | 'permanent' | 'retry'.
function offlineReplayOne(record) {
  const token = offlineSessionToken();
  const headers = {};
  if (record.body) headers['Content-Type'] = record.contentType || 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  // The id also travels as a header so an endpoint that does not read it from
  // the body can still be made idempotent server-side without a client change.
  headers['X-Client-Mutation-Id'] = record.clientMutationId;
  headers['X-Client-Mutation-Ts'] = new Date(record.createdAt).toISOString();

  const body = offlineWithMutationId(record.body, record.clientMutationId);

  return offlineNativeFetch(record.path, {
    method: record.method,
    headers: headers,
    body: body === null ? undefined : body
  }).then((res) => {
    if (res.ok) return 'done';
    // 401 means this session is gone. Keep the mutation and stop the cycle —
    // replaying the rest would only produce more 401s.
    if (res.status === 401 || res.status === 403) return 'retry';
    if (res.status === 408 || res.status === 429 || res.status >= 500) return 'retry';
    return 'permanent';
  }).catch(() => 'retry');
}

// Adds clientMutationId to a JSON body so the server's sync_mutations
// idempotency check sees it. A non-JSON or array body is left untouched.
function offlineWithMutationId(bodyText, clientMutationId) {
  if (!bodyText) return JSON.stringify({ clientMutationId: clientMutationId });
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.clientMutationId === undefined) parsed.clientMutationId = clientMutationId;
      return JSON.stringify(parsed);
    }
  } catch (err) { /* not JSON — send as-is */ }
  return bodyText;
}

function offlineScheduleCycle(delayMs) {
  if (typeof setTimeout !== 'function') return;
  if (offlineCooldownTimer) return;
  offlineCooldownTimer = setTimeout(() => {
    offlineCooldownTimer = null;
    offlineFlushQueue();
  }, delayMs === undefined ? OFFLINE_CYCLE_COOLDOWN_MS : delayMs);
}

/** Queue depth and byte total for the current user. */
function offlineQueueStats() {
  const ns = offlineNamespace();
  return offlineTx(['queue'], 'readonly', (tx) =>
    offlineIdbRequest(tx.objectStore('queue').index('ns').getAll(IDBKeyRange.only(ns)))
  ).then((rows) => {
    const list = rows || [];
    let bytes = 0;
    for (let i = 0; i < list.length; i++) bytes += list[i].bytes || 0;
    return { count: list.length, bytes: bytes, oldestAt: list.length ? list[0].createdAt : null };
  }).catch(() => ({ count: 0, bytes: 0, oldestAt: null }));
}

/* ============================================================
   NETWORK-FIRST FETCH

   window.fetch is wrapped rather than api-client.js being edited, so every
   existing call site — API.getAlumni, apiRequest, and anything added later —
   gets offline behaviour without touching a single feature module.

   GET /api/*  : network first; on a network failure, answer from IndexedDB.
   write /api/*: network first; on a network failure, queue for replay and
                 answer 202 with { queued: true }.
   everything else passes through untouched.
   ============================================================ */

const offlineNativeFetch = (typeof fetch === 'function') ? fetch.bind(typeof self !== 'undefined' ? self : this) : null;
let offlineFetchWrapped = false;

function offlineInstallFetchWrapper() {
  if (offlineFetchWrapped || !offlineNativeFetch || typeof window === 'undefined') return;
  offlineFetchWrapped = true;

  window.fetch = function offlineFetch(input, init) {
    const options = init || {};
    const rawUrl = offlineRequestUrl(input);
    const path = offlineCacheKeyFor(rawUrl);
    const method = String(options.method || (input && input.method) || 'GET').toUpperCase();

    if (!offlineIsApiPath(path)) return offlineNativeFetch(input, init);

    if (method === 'GET') {
      return offlineNativeFetch(input, init).then((res) => {
        if (res && res.ok && offlineIsCacheable(path)) {
          // clone() first: the caller still needs to read the original body.
          res.clone().text().then((text) => {
            offlineCacheWrite(path, res.status, res.headers && res.headers.get('Content-Type'), text);
          }).catch(() => { /* body already consumed elsewhere */ });
        }
        return res;
      }).catch((err) => {
        // An AbortError is a client-side timeout, not proof of a dead network,
        // and the request may well have reached the server. Do not pretend it
        // was offline — but a cached copy is still better than an error page.
        return offlineCacheRead(path).then((rec) => {
          if (!rec) throw err;
          offlineUpdateSyncIndicator();
          return offlineCachedResponse(rec);
        });
      });
    }

    return offlineNativeFetch(input, init).catch((err) => {
      const isAbort = err && (err.name === 'AbortError');
      if (isAbort || offlineMatchesAny(path, OFFLINE_NEVER_QUEUE)) throw err;
      return offlineExtractBody(input, options).then((bodyText) =>
        offlineQueueMutation({ method: method, url: path, body: bodyText })
      ).then((queued) => offlineQueuedResponse(queued)).catch(() => { throw err; });
    });
  };
}

// A Request body can only be read once, so a Request object is cloned first.
function offlineExtractBody(input, options) {
  if (options && typeof options.body === 'string') return Promise.resolve(options.body);
  if (options && options.body !== undefined && options.body !== null) {
    try { return Promise.resolve(JSON.stringify(options.body)); } catch (err) { return Promise.resolve(null); }
  }
  if (input && typeof input.clone === 'function' && typeof input.text === 'function') {
    try { return input.clone().text().catch(() => null); } catch (err) { return Promise.resolve(null); }
  }
  return Promise.resolve(null);
}

function offlineCachedResponse(rec) {
  const headers = {
    'Content-Type': rec.contentType || 'application/json',
    'X-DIC-Offline-Cache': '1',
    'X-DIC-Cached-At': new Date(rec.storedAt).toISOString(),
    'X-DIC-Cache-Stale': (Date.now() - rec.storedAt > OFFLINE_CACHE_TTL_MS) ? '1' : '0'
  };
  return new Response(rec.body, { status: rec.status || 200, headers: headers });
}

function offlineQueuedResponse(queued) {
  const body = JSON.stringify({
    queued: true,
    offline: true,
    clientMutationId: queued.clientMutationId,
    message: 'Saved on this device. It will sync when you are back online.'
  });
  // 202 Accepted, not 200: the write has been taken responsibility for but has
  // not happened yet. Callers that only check res.ok still behave sensibly.
  return new Response(body, {
    status: 202,
    headers: { 'Content-Type': 'application/json', 'X-DIC-Offline-Queued': '1' }
  });
}

/* ============================================================
   SYNC INDICATOR  (PRD: Green = Online, Amber = Offline Sync Queue Active)
   ============================================================ */

let offlineLastIndicatorState = null;

/**
 * Recomputes the indicator and pushes it to the DOM plus a dic:sync-state
 * event. Elements updated: anything carrying [data-sync-indicator], plus the
 * existing #offline-status and #drawer-offline-status pills.
 */
function offlineUpdateSyncIndicator() {
  return offlineQueueStats().then((stats) => {
    const online = offlineIsOnline();
    const syncState = (online && stats.count === 0) ? 'online' : (online ? 'syncing' : 'offline');
    const label = syncState === 'online'
      ? 'Online · Synced'
      : (syncState === 'syncing'
        ? 'Syncing ' + stats.count + ' change' + (stats.count === 1 ? '' : 's') + '…'
        : (stats.count ? 'Offline · ' + stats.count + ' queued' : 'Offline'));
    const detail = {
      state: syncState,
      // Green only when there is nothing outstanding; amber covers both being
      // offline and having a queue to drain, exactly as the PRD specifies.
      color: syncState === 'online' ? 'green' : 'amber',
      online: online,
      queued: stats.count,
      bytesQueued: stats.bytes,
      label: label
    };
    offlineApplyIndicatorDom(detail);
    if (offlineLastIndicatorState !== syncState + '|' + stats.count) {
      offlineLastIndicatorState = syncState + '|' + stats.count;
      offlineEmit('dic:sync-state', detail);
    }
    return detail;
  }).catch(() => null);
}

function offlineApplyIndicatorDom(detail) {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  let nodes = [];
  try {
    nodes = Array.prototype.slice.call(document.querySelectorAll('[data-sync-indicator]'));
    ['offline-status', 'drawer-offline-status'].forEach((id) => {
      const el = document.getElementById && document.getElementById(id);
      if (el && nodes.indexOf(el) === -1) nodes.push(el);
    });
  } catch (err) { return; }

  nodes.forEach((el) => {
    if (!el || !el.classList) return;
    el.classList.toggle('online', detail.color === 'green');
    el.classList.toggle('offline', detail.color === 'amber');
    el.classList.toggle('syncing', detail.state === 'syncing');
    if (el.setAttribute) {
      el.setAttribute('data-sync-state', detail.state);
      el.setAttribute('title', detail.label);
    }
    const text = el.querySelector && el.querySelector('.status-text');
    if (text) text.textContent = detail.label;
  });
}

// Uses the app's toast when it exists; silent otherwise, since this module
// loads before runtime.js defines showToast.
function offlineNotify(message) {
  try {
    if (typeof showToast === 'function') showToast(message);
  } catch (err) { /* toast container not ready */ }
}

/** Everything the UI needs to render sync state, in one call. */
function offlineSyncStatus() {
  return Promise.all([
    offlineQueueStats(),
    offlineTx(['meta'], 'readonly', (tx) => Promise.all([
      offlineMetaGet(tx, 'cacheBytes', 0),
      offlineMetaGet(tx, 'lastSyncAt', null)
    ])).catch(() => [0, null])
  ]).then((values) => {
    const stats = values[0];
    return {
      online: offlineIsOnline(),
      queued: stats.count,
      bytesQueued: stats.bytes,
      oldestQueuedAt: stats.oldestAt,
      cacheBytes: values[1][0] || 0,
      cacheLimitBytes: OFFLINE_CACHE_LIMIT_BYTES,
      cycleLimitBytes: OFFLINE_SYNC_CYCLE_BYTES,
      lastSyncAt: values[1][1] || null,
      namespace: offlineNamespace()
    };
  });
}

/* ============================================================
   SERVICE WORKER REGISTRATION
   ============================================================ */

let offlineSwRegistration = null;

function offlineRegisterServiceWorker() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return Promise.resolve(null);
  // A service worker needs a secure context. file:// and plain http on a
  // non-localhost host silently fail to register, so do not even try.
  const secure = (typeof window !== 'undefined' && window.isSecureContext) ||
    (typeof location !== 'undefined' &&
     (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'));
  if (!secure) return Promise.resolve(null);

  // updateViaCache 'none' keeps the HTTP cache from serving a stale sw.js,
  // which is the failure mode that pins users to old JavaScript forever.
  return navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then((reg) => {
      offlineSwRegistration = reg;
      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // A worker that reaches 'installed' while one is already controlling
          // the page is a new deployment waiting to take over.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            offlineEmit('dic:app-update-available', { registration: reg });
            offlineNotify('🔄 A new version of DIC Alumni is ready — reload to apply.');
          }
        });
      });
      return reg;
    })
    .catch(() => null);
}

/** Applies a waiting update and reloads. Wire this to an update prompt. */
function offlineApplyUpdate() {
  const reg = offlineSwRegistration;
  if (!reg || !reg.waiting) {
    if (typeof location !== 'undefined' && location.reload) location.reload();
    return;
  }
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  }
}

/* ============================================================
   BOOT
   ============================================================ */

let offlineEngineStarted = false;

/**
 * Starts the engine. Idempotent, and safe to call before or after DOM ready.
 * Returns a promise that resolves to { enabled } so callers can branch on
 * whether offline support is actually available in this browser.
 */
function initOfflineEngine() {
  if (offlineEngineStarted) return Promise.resolve({ enabled: true });
  offlineEngineStarted = true;

  if (typeof indexedDB === 'undefined' || !indexedDB) {
    // No IndexedDB: no cache, no queue, no fetch wrapper. The app is exactly
    // what it was before this module existed.
    return offlineRegisterServiceWorker().then(() => ({ enabled: false }));
  }

  offlineInstallFetchWrapper();

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', () => {
      offlineNotify('🟢 Back online. Syncing queued changes…');
      offlineUpdateSyncIndicator();
      offlineFlushQueue();
    });
    window.addEventListener('offline', () => {
      offlineNotify('🟡 Offline. Changes are saved on this device and will sync later.');
      offlineUpdateSyncIndicator();
    });
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    // Returning to the tab is the cheapest reliable signal that a phone which
    // was asleep in a lift now has signal again.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') offlineFlushQueue();
    });
  }

  return offlineRestoreNamespace()
    .then(() => offlineRegisterServiceWorker())
    .then(() => offlineUpdateSyncIndicator())
    .then(() => offlineFlushQueue())
    .then(() => ({ enabled: true }))
    .catch(() => ({ enabled: false }));
}

// Matches the boot pattern in core/runtime.js: run immediately if the document
// is already parsed, otherwise on DOMContentLoaded. Registering here rather
// than calling initOfflineEngine() at load time keeps this file inert inside
// tools/smoke-load-client.js, which never fires either event.
if (typeof document !== 'undefined') {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initOfflineEngine, 0);
  } else if (typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', initOfflineEngine);
  }
}
