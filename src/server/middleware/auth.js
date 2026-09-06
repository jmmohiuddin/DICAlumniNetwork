/* Authentication and role-based authorisation.
 *
 * Password storage, session signing, and the three guards every route uses.
 * Extracted from server.js unchanged — the hashing format, the token format,
 * and each guard's status codes and messages are byte-for-byte what they were,
 * because existing sessions in the wild must keep verifying and the API's
 * 401/403 contract is depended on by the client.
 */
const crypto = require('crypto');
const { SESSION_TTL_MS } = require('../config/constants');

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) {
  console.warn('⚠  SESSION_SECRET not set — using an ephemeral secret. ' +
               'Sessions will be invalidated on restart. Set SESSION_SECRET in .env for production.');
}

/* ─── Passwords ───────────────────────────────────────────────
   Stored as `scrypt$<salt>$<derived>` — the only format that can ever
   authenticate. Legacy rows holding anything else (plaintext, a sentinel,
   an empty string) are non-authenticating by design: they must be reset out
   of band by provisioning a real password, never silently upgraded on login.
   ──────────────────────────────────────────────────────────── */

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(plain, stored) {
  if (!stored) return false;
  // Anything that is not a scrypt$ hash can never authenticate.
  if (!stored.startsWith('scrypt$')) return false;
  const [, salt, expected] = stored.split('$');
  if (!salt || !expected) return false;
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ─── Sessions ────────────────────────────────────────────── */

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/* ─── Guards ──────────────────────────────────────────────── */

/** Attaches req.user when a valid token is present; never rejects. */
function attachUser(req, res, next) {
  req.user = verifyToken(readToken(req));
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/* ─── VERIFICATION GATE ───
 *
 * `users.is_verified` was written by four code paths — the verification queue,
 * self-registration, bulk import and the deletion purge — and read by NO
 * authorization check anywhere in the application. Login checked the password
 * and nothing else, then minted a full 12-hour alumni token.
 *
 * That made the review queue decorative in the most dangerous way: an operator
 * clicking Reject reasonably believes access is revoked, and it was not. It
 * also left self-registration wide open — a stranger with a throwaway address
 * could register and immediately read the entire alumni directory, including
 * email addresses, student IDs and mobile numbers. A security review proved
 * exactly that against a running instance: 191 records from one signup.
 *
 * The token now carries a `verified` claim, and this guard sits on every route
 * that returns another person's data.
 *
 * The claim is a cache, not the authority. A token is valid for 12 hours, so a
 * user approved five minutes ago still holds a token that says false — and
 * making them wait out the token would be a terrible first experience. So a
 * false claim falls through to the database, and only a false claim does: the
 * ~190 already-verified users take the fast path with no query at all, while
 * the handful of genuinely pending accounts pay one indexed lookup.
 *
 * The reverse case — an approved user rejected mid-session — keeps access for
 * the remainder of their token, because a true claim is trusted without a
 * read. That is a deliberate trade against a query on every authenticated
 * request. It is bounded by SESSION_TTL_MS and closed at the front door: login
 * refuses a rejected or erased account outright, so they cannot come back.
 */
async function requireVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  if (req.user.verified === true) return next();

  // Claim says unverified. It may simply be stale — check the row.
  try {
    const db = require('../db/pool');
    const row = await db.query(
      'SELECT is_verified, verification_status, erased_at FROM users WHERE id = $1',
      [req.user.uid]
    );
    if (!row.rows.length) return res.status(401).json({ error: 'Authentication required' });

    const u = row.rows[0];
    if (u.erased_at) return res.status(403).json({ error: 'This account has been deleted' });
    if (u.verification_status === 'rejected') {
      return res.status(403).json({ error: 'This account was not approved' });
    }
    if (u.is_verified === true) {
      req.user.verified = true;   // for the rest of this request only
      return next();
    }
    return res.status(403).json({
      error: 'Your account is awaiting verification by a DIC administrator.',
      pendingVerification: true,
    });
  } catch (err) {
    // Fail closed. An unavailable database is not a reason to hand out data.
    console.error('✖  requireVerified lookup failed:', err.message);
    return res.status(503).json({ error: 'Could not confirm your account status' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

module.exports = {
  SESSION_TTL_MS,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  readToken,
  attachUser,
  requireAuth,
  requireVerified,
  requireRole,
};
