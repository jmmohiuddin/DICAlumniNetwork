/* Shared HTTP helpers.
 *
 * `ok` was defined four times — routes_v2.js:62, routes_planner.js:17 and :69,
 * and routes_compliance.js:18 — as four byte-identical copies. They are one
 * function now.
 *
 * It used to return err.message to the client, which handed the caller raw
 * PostgreSQL text naming columns, constraints and query fragments. The detail is
 * logged server-side now and the client gets a generic message; the response
 * shape ({ error }) and the 500 status are unchanged.
 */

/** Runs an async route body, logs the failure server-side and returns a generic 500. */
const ok = (res, fn) => fn().catch(err => {
  const req = res.req || {};
  console.error(`✖  Unhandled error in ${req.method || '?'} ${req.originalUrl || req.url || '?'}:`,
                (err && err.stack) || err);
  res.status(500).json({ error: 'Internal server error' });
});

/** Serialises a user row into the shape the client expects. */
function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.full_name,
    initials: row.initials,
    role: row.role,
    roleLabel: row.role_label,
    dept: row.department,
    icon: row.icon,
    verified: row.is_verified,
  };
}

module.exports = { ok, publicUser };
