/* Static asset serving, restricted to an allow-list.
 *
 * The app previously ran `express.static(__dirname)` over the repository root,
 * which served every file in the repo over HTTP — server.js, db.js, schema.sql,
 * seed.sql (credentials and all), package.json and the migration scripts were
 * all publicly readable. Verified before this change:
 *
 *     GET /db.js      -> 200, full source
 *     GET /seed.sql   -> 200, full seed data
 *     GET /server.js  -> 200, the entire auth implementation
 *
 * The web root has to stay at the repository root so Vercel's zero-config
 * static serving keeps resolving the same URLs, so the fix is to decide what
 * is public rather than to move the public files. Only paths matching the
 * allow-list below are served; everything else falls through to the API 404
 * and SPA-shell handlers exactly as an absent file always did.
 *
 * NOTE: this closes the hole for the Express server (local, and any non-Vercel
 * host). On Vercel the CDN serves static files itself, before the function is
 * invoked, so it is NOT covered by this middleware — see
 * docs/code-organization.html, "Vercel static exposure", for that fix.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PUBLIC_DIR } = require('../config/paths');

// Exact files that make up the web app shell.
//
// /sw.js has to be served from the root: a service worker can only control
// URLs at or below the path it was fetched from, so serving it from
// /src/client/ would scope it to /src/client/ and leave the rest of the app
// uncontrolled. It is the offline engine's worker — see sw.js.
const PUBLIC_FILES = new Set([
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/favicon.ico',
  '/sw.js',
]);

// Directory prefixes whose contents are public.
const PUBLIC_PREFIXES = [
  '/assets/',      // logos, images
  '/src/client/',  // browser JavaScript modules
];

/* ─── SERVICE WORKER BUILD STAMP ───
 *
 * sw.js ships a literal `__SW_BUILD__` where its cache version belongs, and
 * this middleware substitutes a real value on the way out.
 *
 * The problem it solves: this app has no bundler, so /src/client/core/auth.js
 * is that URL forever with no content hash. A service worker only reinstalls
 * when its own bytes change, so a hand-maintained version constant means the
 * single deploy where someone forgets to bump it strands every returning user
 * on stale JavaScript — and because the worker then serves that stale copy,
 * they cannot recover by reloading.
 *
 * The stamp is a hash of the size and mtime of every file the worker caches.
 * Change any of them and the served bytes of sw.js change, the browser
 * installs the new worker, and activate() drops the old caches. Nobody has to
 * remember anything.
 *
 * Cost is one stat() per client file per request for sw.js — a request each
 * browser makes roughly once per page load, not per asset. The result is
 * cached in-process and re-derived only when a file actually changes, so the
 * steady state is a Map lookup.
 */
let swCache = { stamp: null, body: null, key: null };

function swBuildKey() {
  const files = ['index.html', 'styles.css'];
  try {
    const clientDir = path.join(PUBLIC_DIR, 'src', 'client');
    for (const sub of ['core', 'features']) {
      const dir = path.join(clientDir, sub);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith('.js')) files.push(path.join('src', 'client', sub, f));
      }
    }
  } catch { /* fall through with whatever was collected */ }

  const parts = [];
  for (const rel of files.sort()) {
    try {
      const st = fs.statSync(path.join(PUBLIC_DIR, rel));
      parts.push(`${rel}:${st.size}:${st.mtimeMs}`);
    } catch { parts.push(`${rel}:absent`); }
  }
  return parts.join('|');
}

/** The rewritten sw.js body, rebuilt only when a cached file actually changed. */
function serviceWorkerBody() {
  const key = swBuildKey();
  if (swCache.key === key && swCache.body) return swCache.body;

  const stamp = crypto.createHash('sha256').update(key).digest('hex').slice(0, 12);
  let source = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8');
  // Global replace: the placeholder appears in the prose comment too, and
  // leaving that one stale would make the file lie about its own versioning.
  source = source.split('__SW_BUILD__').join(stamp);

  swCache = { stamp, body: source, key };
  return source;
}

function isPublic(urlPath) {
  if (PUBLIC_FILES.has(urlPath)) return true;
  return PUBLIC_PREFIXES.some(prefix => urlPath.startsWith(prefix));
}

/**
 * Serves the allow-listed static assets. Anything else is passed through
 * untouched, so it reaches the API 404 / static 404 / SPA handlers.
 */
function staticAssets() {
  const serve = express.static(PUBLIC_DIR, {
    // Never serve dotfiles, even if one is somehow allow-listed.
    dotfiles: 'ignore',
    index: 'index.html',
  });

  return function serveStatic(req, res, next) {
    if (!isPublic(req.path)) return next();

    // sw.js is templated, so it cannot go through express.static.
    if (req.path === '/sw.js') {
      try {
        const body = serviceWorkerBody();
        res.set('Content-Type', 'application/javascript; charset=utf-8');
        // The worker script itself must never be cached by the HTTP layer, or
        // the browser cannot discover that a new version exists. Chrome caps
        // this at 24h regardless; being explicit costs nothing.
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        // Belt and braces: allows the root scope even if the file were ever
        // served from somewhere else.
        res.set('Service-Worker-Allowed', '/');
        return res.send(body);
      } catch (err) {
        console.error('✖  Could not serve /sw.js:', err.message);
        return res.status(500).end();
      }
    }

    return serve(req, res, next);
  };
}

module.exports = { staticAssets, isPublic, PUBLIC_FILES, PUBLIC_PREFIXES };
