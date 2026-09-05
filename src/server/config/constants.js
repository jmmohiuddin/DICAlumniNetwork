/* Application constants that more than one module needs.
 *
 * These were previously declared inline in server.js, which meant the route
 * modules could not see them and received them through a hand-passed `guards`
 * object instead.
 */

// Role groups used by requireRole(). Kept as the exact arrays server.js used
// so every existing authorisation decision resolves identically.
const ADMIN_ROLES = ['super_admin', 'univ_admin'];
const MODERATOR_ROLES = ['super_admin', 'univ_admin', 'dept_admin', 'moderator'];

// Signed-session lifetime.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// There is deliberately no shared import credential. Bulk-imported accounts
// each get their own random secret, hashed and discarded, so no account is
// created with a password anyone knows. Do not reintroduce a constant here.

module.exports = {
  ADMIN_ROLES,
  MODERATOR_ROLES,
  SESSION_TTL_MS,
};
