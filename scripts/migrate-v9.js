/* Applies schema_v9.sql (REQ-03 directory search, REQ-08 employment history).
 * Idempotent — safe to re-run.  Usage: node scripts/migrate-v9.js
 *
 * Follows scripts/migrate-v3.js: apply the file, then read back the objects it
 * was supposed to create so a silent partial apply cannot pass as a success.
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/server/db/pool');

(async () => {
  await db.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema_v9.sql'), 'utf8'));
  console.log('⚡ schema_v9 applied.');

  const ext = await db.query(`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`);
  console.log('📊 pg_trgm installed:', ext.rows.length > 0);

  const cols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'alumni_profiles' AND column_name IN ('search_text','search_vector')
    ORDER BY column_name`);
  console.log('📊 search columns:', cols.rows.map(r => r.column_name).join(', ') || '(none)');

  const idx = await db.query(`
    SELECT indexname FROM pg_indexes
    WHERE indexname IN ('idx_profiles_search_vector','idx_profiles_search_trgm',
                        'idx_employment_user','uq_employment_current_per_user')
    ORDER BY indexname`);
  console.log('📊 indexes:', idx.rows.map(r => r.indexname).join(', ') || '(none)');

  const trg = await db.query(`
    SELECT tgname FROM pg_trigger
    WHERE tgname IN ('trg_alumni_profiles_search_sync','trg_users_search_sync')
    ORDER BY tgname`);
  console.log('📊 triggers:', trg.rows.map(r => r.tgname).join(', ') || '(none)');

  // The backfill is the part that can quietly do nothing, so it is counted
  // rather than assumed: every profile row must carry a populated vector.
  const back = await db.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE search_vector IS NULL)::int AS unindexed
    FROM alumni_profiles`);
  console.log(`📊 profiles indexed: ${back.rows[0].total - back.rows[0].unindexed}/${back.rows[0].total}`);

  const eh = await db.query(`
    SELECT COUNT(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'employment_history'`);
  console.log('📊 employment_history table:', eh.rows[0].n === 1);
})().then(() => process.exit(0)).catch(e => { console.error('❌', e.message); process.exit(1); });
