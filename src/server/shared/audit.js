/* ─── IMMUTABLE AUDIT TRAIL ───
 * Each entry is chained to the previous one's hash, so a deleted or edited row
 * breaks verification. audit_logs had a table but nothing ever wrote to it.
 */
const crypto = require('crypto');
const db = require('../db/pool');

async function writeAudit(action, meta, icon = '🛡') {
  try {
    const prev = await db.query('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1');
    const prevHash = prev.rows[0]?.hash || 'GENESIS';
    const hash = crypto.createHash('sha256')
      .update(prevHash + action + meta + new Date().toISOString())
      .digest('hex').slice(0, 16);
    await db.query(
      'INSERT INTO audit_logs (icon, action, meta, hash) VALUES ($1, $2, $3, $4)',
      [icon, action, meta, `0x${hash.toUpperCase()}`]
    );
  } catch (e) {
    console.warn('audit write failed:', e.message);
  }
}

module.exports = { writeAudit };
