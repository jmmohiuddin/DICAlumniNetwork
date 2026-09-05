/* ─── TAMPER-EVIDENT AUDIT TRAIL ───
 * Each entry is chained to the previous one's hash, so a deleted or edited row
 * breaks verification. audit_logs had a table but nothing ever wrote to it.
 *
 * The chain is *keyed*. It used to be an unkeyed SHA-256 truncated to 64 bits,
 * concatenated without delimiters, and nothing ever recomputed it — which made
 * it decoration, not evidence:
 *
 *   - unkeyed: anyone who can edit a row can recompute every hash after it and
 *     hand back a chain that verifies. It is now HMAC-SHA-256 under
 *     AUDIT_HMAC_KEY, which lives in the server environment, not the database.
 *   - 64 bits: birthday-bound at ~2^32 work. The full 256-bit digest is stored.
 *   - no delimiters: `('AB','C')` and `('A','BC')` hashed identically. Fields
 *     are byte-length-prefixed now, so no value can be shifted across a
 *     boundary to collide with a different record.
 *   - never verified: verifyAuditChain() below recomputes it.
 *
 * Rows written before this change carry the old 18-character hash. They cannot
 * be retro-verified (the key did not exist, and their created_at was not the
 * timestamp that was hashed); the verifier counts them as `legacy` rather than
 * reporting them as breaks.
 */
const crypto = require('crypto');
const db = require('../db/pool');

/* The chain key. 64 hex chars, same convention as ENCRYPTION_KEY. Without it
 * the writer refuses to append rather than writing an entry anyone could
 * recompute — a forgeable chain presented as immutable is worse than none. */
const AUDIT_HMAC_KEY = process.env.AUDIT_HMAC_KEY || '';
const auditReady = /^[0-9a-fA-F]{64}$/.test(AUDIT_HMAC_KEY);

if (!auditReady) {
  console.error('✖  AUDIT_HMAC_KEY missing or malformed — the audit trail is DISABLED. ' +
                'Entries are refused rather than written unkeyed, because an unkeyed chain ' +
                'can be recomputed by anyone with database write access. ' +
                'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}

// Hash scheme tag. Bump it if the framing below ever changes, so old and new
// rows stay distinguishable instead of silently failing verification.
const SCHEME = 'dic-audit-v2';

/* Unambiguous framing: every field carries its own UTF-8 byte length, so no
 * combination of field values can produce the same input as a different one. */
const frame = (fields) =>
  fields.map(f => { const s = String(f); return `${Buffer.byteLength(s, 'utf8')}:${s}`; }).join('|');

/** The keyed link hash for one entry. The only place the digest is defined. */
function chainHash(prevHash, { action, meta, icon, createdAt }) {
  const digest = crypto.createHmac('sha256', Buffer.from(AUDIT_HMAC_KEY, 'hex'))
    .update(frame([SCHEME, prevHash, action, meta, icon, createdAt]), 'utf8')
    .digest('hex');
  return `0x${digest.toUpperCase()}`;
}

const isCurrentScheme = (hash) => /^0x[0-9A-F]{64}$/.test(hash || '');

async function writeAudit(action, meta, icon = '🛡') {
  if (!auditReady) {
    console.error(`✖  audit entry refused ("${action}"): AUDIT_HMAC_KEY is not configured.`);
    return;
  }
  // db.pool is null when the pool could not be created, so acquiring the
  // connection is inside the guard too: an audit write must never break the
  // request that triggered it.
  let client;
  try {
    client = await db.pool.connect();
    await client.query('BEGIN');
    // Serialise appenders. Two concurrent writers would otherwise read the same
    // previous hash and fork the chain, which reads as tampering to a verifier.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['dic:audit_logs']);

    const prev = await client.query('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1');
    const prevHash = prev.rows[0]?.hash || 'GENESIS';

    // created_at is written explicitly rather than defaulted, because the
    // timestamp is part of the digest: a verifier has to read back the exact
    // value that was hashed.
    const createdAt = new Date().toISOString();
    const hash = chainHash(prevHash, { action, meta, icon, createdAt });

    await client.query(
      'INSERT INTO audit_logs (icon, action, meta, hash, created_at) VALUES ($1, $2, $3, $4, $5)',
      [icon, action, meta, hash, createdAt]
    );
    await client.query('COMMIT');
  } catch (e) {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* connection already gone */ } }
    console.warn('audit write failed:', e.message);
  } finally {
    if (client) client.release();
  }
}

/* Recompute the chain. A hash chain nothing ever checks is not tamper-evident,
 * and nothing checked this one. Returns a report instead of throwing so an
 * admin endpoint or a scheduled job can render it.
 *
 * `limit` verifies only the most recent N entries, anchoring on the entry
 * immediately before the window; omit it to verify from GENESIS.
 */
async function verifyAuditChain({ limit = null } = {}) {
  if (!auditReady) {
    return { ok: false, reason: 'AUDIT_HMAC_KEY is not configured', checked: 0, legacy: 0, breaks: [] };
  }

  const cols = 'id, icon, action, meta, hash, created_at';
  const rows = limit
    ? (await db.query(
        `SELECT * FROM (SELECT ${cols} FROM audit_logs ORDER BY id DESC LIMIT $1) w ORDER BY id ASC`,
        [limit + 1])).rows
    : (await db.query(`SELECT ${cols} FROM audit_logs ORDER BY id ASC`)).rows;

  // A windowed run starts one row early and uses that row only as the anchor.
  let needsAnchor = !!limit && rows.length > limit;
  let prevHash = 'GENESIS';
  const breaks = [];
  let checked = 0;
  let legacy = 0;

  for (const row of rows) {
    if (needsAnchor) { prevHash = row.hash; needsAnchor = false; continue; }

    if (!isCurrentScheme(row.hash)) {
      // Written under the pre-HMAC scheme; unverifiable by construction.
      legacy++;
      prevHash = row.hash;
      continue;
    }

    const expected = chainHash(prevHash, {
      action: row.action,
      meta: row.meta,
      icon: row.icon,
      createdAt: new Date(row.created_at).toISOString()
    });
    checked++;
    if (expected !== row.hash) {
      breaks.push({ id: row.id, action: row.action, storedHash: row.hash, expectedHash: expected });
    }
    prevHash = row.hash;
  }

  return { ok: breaks.length === 0, checked, legacy, breaks };
}

module.exports = { writeAudit, verifyAuditChain, auditReady };
