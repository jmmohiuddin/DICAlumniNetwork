/* ============================================================
   DIC ALUMNI PLATFORM — AUDIT LOG

   Owns: GET /api/audit-logs.

   Write path lives in src/server/shared/audit.js; this is the read path that
   was missing.
   ============================================================ */

const db = require('../../db/pool');
const { ok } = require('../../shared/http');

module.exports = function mountAudit(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {

  app.get('/api/audit-logs', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const rows = await db.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50');
    res.json(rows.rows);
  }));
};
