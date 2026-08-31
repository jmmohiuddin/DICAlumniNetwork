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
   Stored as `scrypt$<salt>$<derived>`. Seed rows still hold the legacy
   plaintext '12345678', so verifyPassword accepts those once and the login
   handler transparently re-hashes them.
   ──────────────────────────────────────────────────────────── */

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(plain, stored) {
  if (!stored) return false;
  if (!stored.startsWith('scrypt$')) {
    // Legacy plaintext row — constant-time compare, then caller upgrades it.
    const a = Buffer.from(String(plain));
    const b = Buffer.from(String(stored));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const [, salt, expected] = stored.split('$');
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
  requireRole,
};
