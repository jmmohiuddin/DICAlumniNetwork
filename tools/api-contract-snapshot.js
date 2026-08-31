/* STRICTLY NON-DESTRUCTIVE API contract snapshot.
 *
 * Boots the Express app and probes every registered route:
 *   GET/HEAD          -> anonymous, alumni, super_admin  (reads only)
 *   POST/PUT/DELETE   -> ANONYMOUS ONLY (guard rejects with 401 before the
 *                        handler runs). No authenticated write is ever issued.
 *
 * For successful GETs it also records the top-level JSON response shape, so a
 * refactor that silently changes a payload key is caught.
 *
 * Usage: node contract_snapshot.js <repoRoot>
 */
const path = require('path');
const crypto = require('crypto');
const ROOT = process.argv[2] || require('path').join(__dirname, '..');
const db = require(path.join(ROOT, 'db.js'));
const app = require(path.join(ROOT, 'server.js'));

const SECRET = process.env.SESSION_SECRET;
if (!SECRET) { console.error('SESSION_SECRET missing'); process.exit(1); }

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

const SAFE_ID = '999999999';
const concretePath = p =>
  p.replace(/:([A-Za-z_]+)\??/g, (_, n) => (/action/i.test(n) ? 'approve' : SAFE_ID));

// Stable, order-independent description of a JSON body's shape.
function shape(v, depth = 0) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return depth > 1 ? 'array' : `[${v.length ? shape(v[0], depth + 1) : ''}]`;
  if (typeof v === 'object') {
    if (depth > 1) return 'object';
    return '{' + Object.keys(v).sort().map(k => `${k}:${shape(v[k], depth + 1)}`).join(',') + '}';
  }
  return typeof v;
}

(async () => {
  const users = await db.query(
    "SELECT id, role FROM users WHERE role IN ('alumni','super_admin') ORDER BY role, id");
  const alumni = users.rows.find(u => u.role === 'alumni');
  const admin  = users.rows.find(u => u.role === 'super_admin');
  if (!alumni || !admin) { console.error('need one alumni + one super_admin row'); process.exit(1); }

  const exp = Date.now() + 3600e3;
  const tok = {
    anon:   null,
    alumni: signToken({ uid: alumni.id, role: 'alumni',      exp }),
    admin:  signToken({ uid: admin.id,  role: 'super_admin', exp }),
  };

  const router = app.router || app._router;
  const routes = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    for (const m of Object.keys(layer.route.methods)) {
      if (layer.route.methods[m]) routes.push({ method: m.toUpperCase(), path: layer.route.path });
    }
  }

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const lines = [];
  let reads = 0, writes = 0;
  for (const r of routes) {
    const isRead = r.method === 'GET' || r.method === 'HEAD';
    isRead ? reads++ : writes++;
    const probe = isRead ? ['anon', 'alumni', 'admin'] : ['anon'];   // writes: anon only
    const url = base + concretePath(r.path);
    const cells = [];
    for (const a of probe) {
      const headers = tok[a] ? { Authorization: `Bearer ${tok[a]}` } : {};
      try {
        const res = await fetch(url, { method: r.method, headers });
        let s = `${a}=${res.status}`;
        if (isRead && res.status === 200) {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('json')) { try { s += `:${shape(await res.json())}`; } catch {} }
        }
        cells.push(s);
      } catch { cells.push(`${a}=ERR`); }
    }
    lines.push(`${r.method.padEnd(6)} ${r.path.padEnd(42)} ${cells.join(' ')}`);
  }

  for (const [label, url] of [
    ['api-404',    base + '/api/definitely-not-a-route'],
    ['static-404', base + '/definitely-missing.png'],
    ['spa-shell',  base + '/some/client/route'],
    ['root',       base + '/'],
    ['app.js',     base + '/app.js'],
    ['styles.css', base + '/styles.css'],
  ]) {
    const res = await fetch(url);
    lines.push(`FALLBACK ${label.padEnd(41)} status=${res.status} type=${(res.headers.get('content-type')||'').split(';')[0]}`);
  }

  lines.sort();
  console.log(lines.join('\n'));
  console.log(`\nROUTES: ${routes.length} (reads probed 3x: ${reads}, writes probed anon-only: ${writes})`);
  server.close();
  process.exit(0);
})();
