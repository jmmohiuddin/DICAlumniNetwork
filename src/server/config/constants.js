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

// Shared initial credential for bulk-imported accounts. Stored only as a
// scrypt hash; every imported user is flagged must_change_password.
const DEFAULT_IMPORT_PASSWORD = '12345678';

module.exports = {
  ADMIN_ROLES,
  MODERATOR_ROLES,
  SESSION_TTL_MS,
  DEFAULT_IMPORT_PASSWORD,
};
