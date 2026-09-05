/* sw.js — DIC Alumni Platform service worker (PRD REQ-10, Low-Bandwidth & Offline).
 *
 * Lives at the repository root on purpose: a service worker can only control
 * URLs at or below the path it was served from, so a worker at /src/client/sw.js
 * would only ever see /src/client/* requests. Root script, root scope.
 *
 * WHAT THIS FILE DOES AND DELIBERATELY DOES NOT DO
 * ------------------------------------------------
 * It owns *static* traffic only — the app shell, the client JS/CSS, images and
 * the pinned vendor scripts. Every /api/ request is passed straight through to
 * the network, untouched and uncached.
 *
 * That split is a security decision, not an oversight. API responses are
 * authenticated: the session token is an HMAC bearer header held in
 * localStorage (see src/client/core/api-client.js), which a service worker
 * cannot read. So the worker has no way to tell *whose* data a response is,
 * and the Cache Storage API is a single per-origin bucket shared by every
 * session on the device. Caching an authenticated response here would leave
 * one alumnus's directory, ticket and vault payloads readable by the next
 * person who signs in on the same browser.
 *
 * The network-first-with-offline-fallback behaviour the PRD asks for is
 * therefore implemented one layer up, in src/client/core/offline.js, which
 * runs in the page, knows which user is signed in, and stores those responses
 * in IndexedDB under a per-user namespace it can wipe on logout.
 *
 * CACHE VERSIONING
 * ----------------
 * This app has no bundler and therefore no content hashes in its filenames —
 * /src/client/core/auth.js is the same URL forever. A stale worker pinning
 * users to last month's JavaScript is strictly worse than having no worker at
 * all, so two things guard against it:
 *
 *   1. SW_VERSION below. It is NOT maintained by hand — the server rewrites
 *      the __SW_BUILD__ placeholder on every request with a hash of the size
 *      and mtime of every file this worker caches (index.html, styles.css and
 *      each client module). Touch any of them and the served bytes of this
 *      file change, which is exactly what makes the browser install a new
 *      worker; activate() then deletes every cache not in KEEP.
 *
 *      This is deliberate. The original design required bumping a constant on
 *      every deploy, and the one deploy where somebody forgets is the deploy
 *      that pins every returning user to stale JavaScript with no way to
 *      recover short of clearing site data. A version nobody has to remember
 *      cannot be forgotten. The literal below is the fallback used only when
 *      the file is read straight off disk without the server in front of it.
 *   2. The app shell and client JS use stale-while-revalidate rather than
 *      pure cache-first, so even *without* a version bump a returning user is
 *      at most one page load behind. Only genuinely immutable things —
 *      /assets/ images and version-pinned CDN scripts — get true cache-first.
 */

const SW_VERSION = '__SW_BUILD__';

const SHELL_CACHE  = 'dic-shell-' + SW_VERSION;   // index.html, styles.css, client JS
const ASSET_CACHE  = 'dic-assets-' + SW_VERSION;  // /assets/ images, immutable
const VENDOR_CACHE = 'dic-vendor-' + SW_VERSION;  // pinned CDN scripts + fonts
const KEEP = [SHELL_CACHE, ASSET_CACHE, VENDOR_CACHE];

// Used when index.html cannot be parsed at install time (offline install, or a
// fetch failure). The app still boots from these; the rest fills in at runtime.
const FALLBACK_SHELL = ['/', '/index.html', '/styles.css', '/manifest.json'];

// Cross-origin hosts whose responses may be cached. Everything else cross-origin
// is left to the browser: an unbounded third-party cache is how a service worker
// quietly eats a phone's storage quota.
const VENDOR_HOSTS = [
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* ─── INSTALL ────────────────────────────────────────────────
 * The precache list is *derived from index.html* rather than hardcoded, the
 * same way tools/client-scripts.js derives the smoke-test list. With ~20
 * <script> tags and no build step, a hand-maintained copy of that list in this
 * file would be wrong within a week, and a shell precache that is missing one
 * script is a blank page offline.
 */
async function shellUrls() {
  try {
    const res = await fetch('/index.html', { cache: 'reload' });
    if (!res.ok) return FALLBACK_SHELL.slice();
    const html = await res.text();
    const urls = new Set(FALLBACK_SHELL);

    const collect = (pattern) => {
      let m;
      while ((m = pattern.exec(html))) {
        const src = m[1];
        if (/^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) continue; // CDN / inline
        urls.add('/' + src.replace(/^\.?\//, ''));
      }
    };
    collect(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi);
    collect(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi);
    return Array.from(urls);
  } catch (err) {
    return FALLBACK_SHELL.slice();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const urls = await shellUrls();
    // Individually rather than cache.addAll: addAll is all-or-nothing, so one
    // 404 (a script renamed but still linked, say) would abort the whole
    // install and leave the user with no worker at all.
    await Promise.all(urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res && res.ok) await cache.put(url, res.clone());
      } catch (err) { /* asset stays uncached; runtime handlers will retry */ }
    }));
    // Take over as soon as the new bytes are in place. Paired with clients.claim()
    // below this is what stops a deploy from stranding a tab on the old worker.
    await self.skipWaiting();
  })());
});

/* ─── ACTIVATE ───────────────────────────────────────────────
 * Bump-and-clean: anything from a previous SW_VERSION is deleted outright.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      if (name.indexOf('dic-') !== 0) return Promise.resolve(false); // not ours
      if (KEEP.indexOf(name) !== -1) return Promise.resolve(false);
      return caches.delete(name);
    }));
    await self.clients.claim();
  })());
});

/* ─── STRATEGIES ─────────────────────────────────────────────*/

// Immutable resources: /assets/ images and version-pinned vendor scripts. Their
// URL changes when their content changes, so a hit never needs revalidating.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // type === 'opaque' is a no-cors cross-origin response: status is 0 and we
  // cannot tell success from failure. Cache it anyway — the alternative is
  // never caching fonts — and rely on the version bump to flush mistakes.
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

// App shell JS/CSS: serve the cached copy immediately (this is the whole point
// on a 2G connection), then refresh it in the background for the next load.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => null);
  if (hit) return hit;
  const res = await network;
  if (res) return res;
  return new Response('', { status: 504, statusText: 'Offline and not cached' });
}

// Navigations: try the network so a fresh index.html wins, fall back to the
// cached shell. The SPA renders its own offline state from there.
async function navigationHandler(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/index.html', res.clone());
    }
    return res;
  } catch (err) {
    const cache = await caches.open(SHELL_CACHE);
    const shell = await cache.match('/index.html') || await cache.match('/');
    if (shell) return shell;
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
      '<body style="font:15px system-ui;padding:40px;background:#070B14;color:#F1F5FF">' +
      '<h1>You are offline</h1><p>DIC Alumni will load again once you reconnect.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Writes are never cached and never replayed from here. Queuing them is the
  // page layer's job (offline.js) because only the page holds the bearer token
  // needed to replay them, and only the page can tell the user it happened.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Authenticated data. See the header comment: passed through untouched.
    if (url.pathname.indexOf('/api/') === 0) return;

    if (request.mode === 'navigate') {
      event.respondWith(navigationHandler(request));
      return;
    }
    if (url.pathname.indexOf('/assets/') === 0) {
      event.respondWith(cacheFirst(request, ASSET_CACHE));
      return;
    }
    if (url.pathname.indexOf('/src/client/') === 0 ||
        url.pathname === '/styles.css' ||
        url.pathname === '/manifest.json' ||
        url.pathname === '/sw.js') {
      // Never serve sw.js itself from a cache we control — that is exactly how
      // a worker becomes permanently stuck on an old version.
      if (url.pathname === '/sw.js') return;
      event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
      return;
    }
    return;
  }

  if (VENDOR_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(cacheFirst(request, VENDOR_CACHE));
  }
});

/* ─── MESSAGES ───────────────────────────────────────────────
 * offline.js posts SKIP_WAITING when the user accepts an update prompt, and
 * CACHE_USAGE to render storage diagnostics.
 */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CACHE_USAGE' && event.ports && event.ports[0]) {
    const port = event.ports[0];
    (async () => {
      let entries = 0;
      for (const name of KEEP) {
        try {
          const cache = await caches.open(name);
          entries += (await cache.keys()).length;
        } catch (err) { /* cache missing is not an error here */ }
      }
      port.postMessage({ version: SW_VERSION, caches: KEEP, entries: entries });
    })();
  }
});
