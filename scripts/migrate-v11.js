/* Applies db/schema_v11.sql — alumni verification review state. Idempotent.
 *
 * Usage: node scripts/migrate-v11.js
 *
 * Adds users.verification_status (+ reason / reviewed_by / reviewed_at), a
 * CHECK constraint on the vocabulary, a partial index for the review queue, and
 * backfills existing verified accounts to 'approved'. Additive only — no column
 * is dropped and no existing value is overwritten once a real review decision
 * has been recorded.
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/server/db/pool');

const SCHEMA = path.join(__dirname, '..', 'db', 'schema_v11.sql');

(async () => {
  await db.query(fs.readFileSync(SCHEMA, 'utf8'));
  console.log('⚡ schema_v11 applied.');

  const cols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name LIKE 'verification%'
    ORDER BY column_name`);
  console.log('📊 new user columns:', cols.rows.map(r => r.column_name).join(', ') || '(none)');

  // Report the queue as the app will actually see it, so a bad backfill is
  // obvious here rather than as an empty dashboard card later.
  const dist = await db.query(`
    SELECT verification_status, COUNT(*)::int AS n
    FROM users GROUP BY verification_status ORDER BY verification_status`);
  dist.rows.forEach(r => console.log(`📊 ${r.verification_status}: ${r.n}`));
})().then(() => process.exit(0)).catch(e => { console.error('❌', e.message); process.exit(1); });
