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
const { PUBLIC_DIR } = require('../config/paths');

// Exact files that make up the web app shell.
const PUBLIC_FILES = new Set([
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/favicon.ico',
]);

// Directory prefixes whose contents are public.
const PUBLIC_PREFIXES = [
  '/assets/',      // logos, images
  '/src/client/',  // browser JavaScript modules
];

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
    return serve(req, res, next);
  };
}

module.exports = { staticAssets, isPublic, PUBLIC_FILES, PUBLIC_PREFIXES };
