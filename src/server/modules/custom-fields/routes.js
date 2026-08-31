/* ============================================================
   DIC ALUMNI PLATFORM — CUSTOM FIELDS

   Owns: GET/POST/DELETE /api/custom-fields, /api/custom-fields/:id.

   Table existed, zero endpoints.
   ============================================================ */

const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { writeAudit } = require('../../shared/audit');

module.exports = function mountCustomFields(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {

  app.get('/api/custom-fields', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query('SELECT * FROM custom_fields ORDER BY created_at ASC');
    res.json(rows.rows);
  }));

  app.post('/api/custom-fields', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const { label, section, fieldType, isRequired } = req.body;
    if (!label || !label.trim()) return res.status(400).json({ error: 'Field label is required' });
    const id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const exists = await db.query('SELECT 1 FROM custom_fields WHERE id=$1', [id]);
    if (exists.rows.length) return res.status(409).json({ error: 'A field with that name already exists' });

    const row = await db.query(`
      INSERT INTO custom_fields (id, label, section, field_type, is_required)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [id, label.trim(), section || 'academic', fieldType || 'text', !!isRequired]);
    await writeAudit('Custom Field Created', `"${label.trim()}" by user ${req.user.uid}`, '🧩');
    res.json(row.rows[0]);
  }));

  app.delete('/api/custom-fields/:id', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const row = await db.query('DELETE FROM custom_fields WHERE id=$1 RETURNING label', [req.params.id]);
    if (!row.rows.length) return res.status(404).json({ error: 'Field not found' });
    await writeAudit('Custom Field Deleted', `"${row.rows[0].label}" by user ${req.user.uid}`, '🗑');
    res.json({ success: true });
  }));
};
