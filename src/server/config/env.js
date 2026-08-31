/* Minimal .env loader.
 *
 * Lifted verbatim (behaviour-for-behaviour) out of db.js, where it ran as a
 * side effect of requiring the database pool. Loading configuration and
 * opening a connection pool are two different jobs, so they are two modules
 * now — but the parsing rules are unchanged:
 *
 *   - blank lines and lines starting with # are skipped
 *   - the first '=' splits key from value, so '=' inside a value survives
 *   - one matching pair of surrounding single or double quotes is stripped
 *   - an existing process.env value always wins, so the real environment
 *     (Vercel, CI, the shell) is never overridden by a stray local file
 *
 * Requiring this module loads the file once; repeat requires are no-ops
 * because Node caches the module.
 */
const fs = require('fs');
const { ENV_FILE } = require('./paths');

function loadEnvFile(file = ENV_FILE) {
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;

    const key = trimmed.substring(0, idx).trim();
    let val = trimmed.substring(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.substring(1, val.length - 1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

module.exports = { loadEnvFile };
