/* Applies schema_v10.sql. Idempotent.  Usage: node scripts/migrate-v10.js
 *
 * Verifies afterwards rather than trusting the DDL: every statement in v10 is
 * an IF NOT EXISTS or a guarded ADD CONSTRAINT, so a partially-applied run
 * leaves no error behind to notice. The checks below read the catalogue back
 * and print what actually landed. */
const fs = require('fs');
const path = require('path');
const db = require('../src/server/db/pool');

const SCHEMA = path.join(__dirname, '..', 'db', 'schema_v10.sql');

async function columns(table, names) {
  const r = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1 AND column_name = ANY($2)
    ORDER BY column_name`, [table, names]);
  const found = r.rows.map(x => x.column_name);
  const missing = names.filter(n => !found.includes(n));
  console.log(`📊 ${table}: ${found.join(', ') || '(none)'}${missing.length ? `   ❌ MISSING: ${missing.join(', ')}` : ''}`);
  return missing.length === 0;
}

(async () => {
  await db.query(fs.readFileSync(SCHEMA, 'utf8'));
  console.log('⚡ schema_v10 applied.\n');

  let allOk = true;
  allOk &= await columns('donations',
    ['settled_by', 'settlement_reference', 'settlement_method', 'settlement_note', 'settled_at']);
  allOk &= await columns('event_registrations',
    ['amount_due', 'payment_status', 'paid_at', 'payment_confirmed_by', 'payment_reference']);
  allOk &= await columns('job_applications', ['resume_file_id']);
  allOk &= await columns('users', ['erased_at']);
  allOk &= await columns('deletion_requests', ['purged_at', 'purge_summary']);
  allOk &= await columns('resume_files',
    ['id', 'user_id', 'filename', 'content_type', 'byte_size', 'sha256', 'content', 'created_at']);

  const con = await db.query(
    `SELECT conname FROM pg_constraint WHERE conname='event_registrations_payment_status_check'`);
  console.log(`📊 payment_status CHECK: ${con.rows.length ? 'present' : '❌ MISSING'}`);

  // The existing ledger must be untouched by this migration.
  const d = await db.query(`SELECT status, COUNT(*)::int n FROM donations GROUP BY status ORDER BY status`);
  console.log(`📊 donations by status: ${d.rows.map(r => `${r.status}=${r.n}`).join(', ') || '(none)'}`);

  const reg = await db.query(`
    SELECT payment_status, COUNT(*)::int n, COALESCE(SUM(amount_due),0)::text due
    FROM event_registrations GROUP BY payment_status ORDER BY payment_status`);
  console.log(`📊 registrations by payment_status: ${reg.rows.map(r => `${r.payment_status}=${r.n} (due ${r.due})`).join(', ') || '(none)'}`);

  if (!allOk) throw new Error('one or more objects are missing — see ❌ above');
})().then(() => process.exit(0)).catch(e => { console.error('❌', e.message); process.exit(1); });
