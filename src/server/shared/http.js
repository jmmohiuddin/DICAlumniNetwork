/* Shared HTTP helpers.
 *
 * `ok` was defined four times — routes_v2.js:62, routes_planner.js:17 and :69,
 * and routes_compliance.js:18 — as four byte-identical copies. They are one
 * function now. The implementation is unchanged, including the fact that it
 * returns err.message to the client.
 *
 * NOTE: returning err.message leaks internal detail (SQL text, constraint
 * names) on a 500. That is pre-existing behaviour and is preserved here rather
 * than silently changed; see docs/CODE_ORGANIZATION.md for the recommended fix.
 */

/** Runs an async route body and turns a rejection into a 500 JSON error. */
const ok = (res, fn) => fn().catch(err => res.status(500).json({ error: err.message }));

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
