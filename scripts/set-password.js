#!/usr/bin/env node
/* Provision a password for an existing account.
 *
 *   node scripts/set-password.js <email>                 # generate a strong one
 *   node scripts/set-password.js <email> <password>      # set a specific one
 *   node scripts/set-password.js --list-locked           # who cannot sign in
 *
 * verifyPassword() accepts only `scrypt$<salt>$<derived>`, so rows holding a
 * plaintext value or the seed sentinel can never authenticate and cannot be
 * recovered through the API either — /api/auth/change-password requires the
 * current password, which by definition does not work for those rows. This is
 * the out-of-band reset that situation assumes exists.
 *
 * It writes only the password_hash and must_change_password columns of one
 * row, matched by exact email. It never deletes, and it prints the target row
 * and asks for confirmation before writing unless --yes is passed.
 */
const crypto = require('crypto');
const readline = require('readline');
const db = require('../src/server/db/pool');
const { hashPassword } = require('../src/server/middleware/auth');

const args = process.argv.slice(2);
const yes = args.includes('--yes');
const listLocked = args.includes('--list-locked');
const positional = args.filter(a => !a.startsWith('--'));
const [email, explicitPassword] = positional;

/** A readable password with enough entropy to be a real secret (~93 bits). */
function generatePassword() {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

async function main() {
  if (listLocked) {
    const { rows } = await db.query(`
      SELECT id, email, role, created_via
        FROM users
       WHERE password_hash IS NULL OR password_hash NOT LIKE 'scrypt$%'
       ORDER BY id`);
    if (!rows.length) {
      console.log('Every account has a usable scrypt hash — nothing is locked out.');
      return;
    }
    console.log(`${rows.length} account(s) cannot sign in (no scrypt hash):\n`);
    for (const r of rows) {
      console.log(`  id=${String(r.id).padEnd(6)}${r.email.padEnd(34)}${String(r.role).padEnd(14)}via=${r.created_via ?? '—'}`);
    }
    console.log('\nGive one a password with:  node scripts/set-password.js <email>');
    return;
  }

  if (!email) {
    console.error('Usage: node scripts/set-password.js <email> [password] [--yes]');
    console.error('       node scripts/set-password.js --list-locked');
    process.exitCode = 1;
    return;
  }

  if (explicitPassword && explicitPassword.length < 8) {
    console.error('Password must be at least 8 characters — the API enforces the same rule.');
    process.exitCode = 1;
    return;
  }

  const { rows } = await db.query(
    'SELECT id, email, full_name, role, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  if (!rows.length) {
    console.error(`No account with email "${email}".`);
    process.exitCode = 1;
    return;
  }

  const user = rows[0];
  const usable = typeof user.password_hash === 'string' && user.password_hash.startsWith('scrypt$');

  console.log('\nTarget account');
  console.log(`  id      ${user.id}`);
  console.log(`  email   ${user.email}`);
  console.log(`  name    ${user.full_name}`);
  console.log(`  role    ${user.role}`);
  console.log(`  status  ${usable ? 'has a usable password (it will be REPLACED)' : 'cannot currently sign in'}`);
  console.log(`  target  ${db.isCloud ? 'CLOUD database' : 'local database'}`);

  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(r => rl.question('\nSet a new password for this account? [y/N] ', r));
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('Cancelled. Nothing was written.');
      return;
    }
  }

  const password = explicitPassword || generatePassword();
  await db.query(
    'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
    [hashPassword(password), user.id]
  );

  console.log('\n  Password updated.\n');
  console.log(`    email     ${user.email}`);
  console.log(`    password  ${password}`);
  console.log('\n  Shown once — it is stored only as a scrypt hash and cannot be read back.');
  if (!explicitPassword) console.log('  Copy it now.');
}

main()
  .catch(err => { console.error('Failed:', err.message); process.exitCode = 1; })
  .finally(() => db.pool && db.pool.end());
