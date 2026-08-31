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
  INDEX_HTML: path.join(ROOT, 'index.html'),
  // The web root. Kept at the repository root so Vercel's zero-config static
  // serving and express.static resolve the same files.
  PUBLIC_DIR: ROOT,
};
