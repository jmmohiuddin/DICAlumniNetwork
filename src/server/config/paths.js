/* Single source of truth for filesystem locations.
 *
 * Backend modules live under src/server/, so __dirname no longer points at the
 * repository root the way it did when every file sat there. Everything that
 * needs a real path resolves it from here instead of recomputing ../.. chains.
 */
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');

module.exports = {
  ROOT,
  ENV_FILE: path.join(ROOT, '.env'),
  SCHEMA_SQL: path.join(ROOT, 'db', 'schema.sql'),
  SEED_SQL: path.join(ROOT, 'db', 'seed.sql'),
  INDEX_HTML: path.join(ROOT, 'public', 'index.html'),

  /* The web root is public/, not the repository root.
   *
   * It used to be ROOT so that Vercel's zero-config static serving and
   * express.static resolved the same files. That was the problem: Vercel's CDN
   * resolves static files from the project root BEFORE the function runs, so
   * with the repository root as the web root, /server.js, /db/seed.sql and
   * /scripts/set-password.js were all fetchable in production no matter what
   * the Express allow-list said. Recorded as SEC-6 and deferred; a deploy is
   * where it stops being deferrable.
   *
   * With a public/ directory present, Vercel serves only that, and everything
   * outside it is function source rather than a web asset. express.static and
   * the CDN still resolve the same files, which was the original goal — they
   * just resolve a smaller set of them.
   *
   * sw.js deliberately stays OUTSIDE public/. It has to be served by the
   * function so the build stamp can be substituted into it, and a static copy
   * would shadow the route that does that. */
  PUBLIC_DIR: path.join(ROOT, 'public'),
  SW_SOURCE: path.join(ROOT, 'sw.js'),
};
