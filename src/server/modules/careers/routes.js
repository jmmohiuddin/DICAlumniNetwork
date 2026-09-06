/* ============================================================
   DIC ALUMNI PLATFORM — CAREER PROGRESSION (REQ-08)

   Owns: GET /api/careers/mine, POST /api/careers,
         PUT /api/careers/:id, DELETE /api/careers/:id,
         GET /api/careers/user/:id.

   REQ-08 asked for a career progression tracker. The PRD's own open-questions
   matrix resolves *how*, and that resolution is marked Approved: "Opt-in
   self-reporting with AI enrichment" — not scraping. So this module is exactly
   that and nothing more. There is no scraper, no scheduled enrichment job and
   no inferred employment here, because none of those exist in this codebase;
   every row in employment_history was typed in by the alumnus it belongs to.

   Data ownership: a user may only write their own history. There is no admin
   write path — an administrator editing someone's employment record would be
   the platform asserting a career fact on the alumnus's behalf, which is the
   thing the "self-reporting" resolution rules out.
   ============================================================ */

const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { writeAudit } = require('../../shared/audit');

/* Columns as the API serves them.
 *
 * start_date/end_date go through to_char rather than coming back as DATE.
 * node-pg parses a DATE into a JS Date at *local* midnight, and JSON.stringify
 * then renders it in UTC — which silently moves "2019-01-01" to "2018-12-31"
 * for any server west of Greenwich. Formatting in PostgreSQL keeps the string
 * the user typed. */
const ENTRY_COLUMNS = `
  id, user_id, company, job_title, industry, location,
  to_char(start_date, 'YYYY-MM-DD') AS start_date,
  to_char(end_date,   'YYYY-MM-DD') AS end_date,
  is_current, description, created_at, updated_at`;

/** Newest first, with the current position pinned to the top of the timeline. */
const ENTRY_ORDER = 'is_current DESC, start_date DESC, id DESC';

function serialiseEntry(row) {
  return {
    id: row.id,
    userId: row.user_id,
    company: row.company,
    jobTitle: row.job_title,
    industry: row.industry,
    location: row.location,
    startDate: row.start_date,
    endDate: row.end_date,
    isCurrent: row.is_current,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* Accepts YYYY-MM-DD or YYYY-MM (nobody remembers the day they started a job
 * from 2012). Anything else is rejected rather than handed to PostgreSQL to
 * interpret, because Postgres would happily accept '01/02/2019' and resolve it
 * by DateStyle — a different month depending on server configuration. */
function parseIsoDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) return undefined;                       // undefined = invalid, distinct from null = absent
  const iso = `${m[1]}-${m[2]}-${m[3] || '01'}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return undefined;
  return iso;
}

const trimOrNull = (v) => (typeof v === 'string' ? (v.trim() || null) : (v == null ? null : String(v).trim() || null));

module.exports = function mountCareers(app, { requireAuth, requireVerified }) {

  /* ─── Read: own timeline ─────────────────────────────────
     Registered before /api/careers/user/:id purely for clarity; the paths do
     not overlap, so ordering is not load-bearing here. */
  app.get('/api/careers/mine', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(
      `SELECT ${ENTRY_COLUMNS} FROM employment_history WHERE user_id = $1 ORDER BY ${ENTRY_ORDER}`,
      [req.user.uid]);
    res.json({ userId: req.user.uid, visible: true, history: rows.rows.map(serialiseEntry) });
  }));

  /* ─── Read: someone else's timeline ──────────────────────
     Mirrors the visibility rule /api/alumni/:id already applies: the owner and
     staff see everything, and for everyone else a field is hidden only when
     privacy_settings marks it 'private'. An absent key means visible, which is
     what keeps this consistent with current_company and job_title — already
     shown unconditionally on the profile card, so employment history must not
     be *more* exposed than they are, and there is no honest reason to make it
     less by default.

     A hidden timeline returns 200 with visible:false and an empty list rather
     than 403, so the client renders "not shared" instead of an error — again
     matching /api/alumni/:id, which nulls hidden fields rather than failing. */
  // Another person's employment history — same trust boundary as the directory.
  app.get('/api/careers/user/:id', requireAuth, requireVerified, (req, res) => ok(res, async () => {
    const targetId = parseInt(req.params.id);
    if (!targetId) return res.status(400).json({ error: 'A numeric user id is required' });

    const target = await db.query(`
      SELECT u.id, ap.privacy_settings
      FROM users u LEFT JOIN alumni_profiles ap ON ap.user_id = u.id
      WHERE u.id = $1
    `, [targetId]);
    if (!target.rows.length) return res.status(404).json({ error: 'Alumni profile not found' });

    const privacy = target.rows[0].privacy_settings || {};
    const isSelf = req.user.uid === targetId;
    const isStaff = ['super_admin', 'univ_admin', 'dept_admin'].includes(req.user.role);
    const visible = isSelf || isStaff || privacy.employment !== 'private';

    if (!visible) return res.json({ userId: targetId, visible: false, history: [] });

    const rows = await db.query(
      `SELECT ${ENTRY_COLUMNS} FROM employment_history WHERE user_id = $1 ORDER BY ${ENTRY_ORDER}`,
      [targetId]);
    res.json({ userId: targetId, visible: true, history: rows.rows.map(serialiseEntry) });
  }));

  /* ─── Write ──────────────────────────────────────────────
     Validation shared by POST and PUT. Returns { error } to send, or a
     normalised field set. */
  function readEntryBody(body, { partial = false, existing = null } = {}) {
    const out = {};

    const company = trimOrNull(body.company);
    const jobTitle = trimOrNull(body.jobTitle);
    if (!partial || body.company !== undefined) {
      if (!company) return { error: 'Company is required' };
      out.company = company;
    }
    if (!partial || body.jobTitle !== undefined) {
      if (!jobTitle) return { error: 'Job title is required' };
      out.jobTitle = jobTitle;
    }

    if (!partial || body.industry !== undefined)    out.industry = trimOrNull(body.industry);
    if (!partial || body.location !== undefined)    out.location = trimOrNull(body.location);
    if (!partial || body.description !== undefined) out.description = trimOrNull(body.description);

    if (!partial || body.startDate !== undefined) {
      const startDate = parseIsoDate(body.startDate);
      if (startDate === undefined) return { error: 'startDate must be YYYY-MM-DD or YYYY-MM' };
      if (!startDate) return { error: 'startDate is required' };
      out.startDate = startDate;
    }
    if (!partial || body.endDate !== undefined) {
      const endDate = parseIsoDate(body.endDate);
      if (endDate === undefined) return { error: 'endDate must be YYYY-MM-DD or YYYY-MM' };
      out.endDate = endDate;
    }
    if (!partial || body.isCurrent !== undefined) {
      out.isCurrent = body.isCurrent === true || body.isCurrent === 'true';
    }

    // Resolve the final values so the cross-field rules are checked against
    // what the row will actually hold after a partial update, not just against
    // whatever the caller happened to send.
    const finalStart   = out.startDate !== undefined ? out.startDate : (existing && existing.start_date);
    const finalEnd     = out.endDate   !== undefined ? out.endDate   : (existing && existing.end_date);
    const finalCurrent = out.isCurrent !== undefined ? out.isCurrent : (existing && existing.is_current);

    // Both of these are also CHECK constraints. They are repeated here to
    // return a readable message instead of a 500 carrying a constraint name.
    if (finalCurrent && finalEnd) {
      return { error: 'A current position cannot have an end date' };
    }
    if (finalStart && finalEnd && finalEnd < finalStart) {
      return { error: 'endDate cannot be earlier than startDate' };
    }

    return { fields: out };
  }

  /* Everything the profile's directory row derives from the current job.
     alumni_profiles.current_company and .job_title are what the search index
     built in schema_v9 reads, so they must not drift from the timeline. */
  async function syncCurrentEmployer(client, userId, company, jobTitle) {
    await client.query(`
      UPDATE alumni_profiles
      SET current_company = $2, job_title = $3, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
    `, [userId, company, jobTitle]);
  }

  /* Clears is_current from the user's other rows. Required before writing a
     new current position: uq_employment_current_per_user is a unique index, so
     without this the insert fails instead of superseding the old job.

     end_date is deliberately left alone. The user said "this is no longer my
     current job" — they did not say when it ended, and inventing a date here
     would be the application asserting a career fact it was not told. */
  async function demoteOtherCurrent(client, userId, exceptId = null) {
    await client.query(`
      UPDATE employment_history
      SET is_current = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_current AND ($2::INT IS NULL OR id <> $2)
    `, [userId, exceptId]);
  }

  app.post('/api/careers', requireAuth, (req, res) => ok(res, async () => {
    const parsed = readEntryBody(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const f = parsed.fields;

    const client = await db.pool.connect();
    let entry;
    try {
      await client.query('BEGIN');
      if (f.isCurrent) await demoteOtherCurrent(client, req.user.uid);

      const ins = await client.query(`
        INSERT INTO employment_history
          (user_id, company, job_title, industry, location, start_date, end_date, is_current, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${ENTRY_COLUMNS}
      `, [req.user.uid, f.company, f.jobTitle, f.industry, f.location,
          f.startDate, f.endDate, f.isCurrent, f.description]);
      entry = ins.rows[0];

      if (f.isCurrent) await syncCurrentEmployer(client, req.user.uid, f.company, f.jobTitle);
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
      // Two of the user's own writes racing to claim "current position".
      // uq_employment_current_per_user is what serialises them, and losing that
      // race is a conflict to retry, not a server fault to log as a 500.
      if (e.code === '23505') {
        return res.status(409).json({ error: 'Another change to your current position is in progress — please retry' });
      }
      throw e;
    } finally {
      client.release();
    }

    await writeAudit('Employment Entry Added',
      `user ${req.user.uid} · ${f.jobTitle} at ${f.company}${f.isCurrent ? ' (current)' : ''}`, '💼');
    res.json({ success: true, entry: serialiseEntry(entry) });
  }));

  app.put('/api/careers/:id', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'A numeric entry id is required' });

    // Read through ENTRY_COLUMNS, not SELECT *, so existing.start_date and
    // .end_date arrive as 'YYYY-MM-DD' strings. The cross-field checks below
    // compare them against the incoming values, and comparing a node-pg Date
    // object to a date string silently succeeds while meaning nothing.
    //
    // Ownership is checked before anything is read back to the caller, so this
    // endpoint cannot be used to probe another user's history by id.
    const cur = await db.query(`SELECT ${ENTRY_COLUMNS} FROM employment_history WHERE id = $1`, [id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Employment entry not found' });
    if (cur.rows[0].user_id !== req.user.uid) {
      return res.status(403).json({ error: 'You can only edit your own employment history' });
    }

    const parsed = readEntryBody(req.body || {}, { partial: true, existing: cur.rows[0] });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const f = parsed.fields;
    if (!Object.keys(f).length) return res.status(400).json({ error: 'No editable fields supplied' });

    // Column whitelist: the caller cannot reach user_id or id by adding keys.
    const COLUMNS = {
      company: 'company', jobTitle: 'job_title', industry: 'industry',
      location: 'location', startDate: 'start_date', endDate: 'end_date',
      isCurrent: 'is_current', description: 'description',
    };
    const sets = [];
    const vals = [id];
    for (const [key, column] of Object.entries(COLUMNS)) {
      if (f[key] === undefined) continue;
      vals.push(f[key]);
      sets.push(`${column} = $${vals.length}`);
    }

    const becomingCurrent = f.isCurrent === true;
    const client = await db.pool.connect();
    let entry;
    try {
      await client.query('BEGIN');
      if (becomingCurrent) await demoteOtherCurrent(client, req.user.uid, id);

      const upd = await client.query(`
        UPDATE employment_history SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING ${ENTRY_COLUMNS}
      `, vals);
      entry = upd.rows[0];

      if (entry.is_current) await syncCurrentEmployer(client, req.user.uid, entry.company, entry.job_title);
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
      // Two of the user's own writes racing to claim "current position".
      // uq_employment_current_per_user is what serialises them, and losing that
      // race is a conflict to retry, not a server fault to log as a 500.
      if (e.code === '23505') {
        return res.status(409).json({ error: 'Another change to your current position is in progress — please retry' });
      }
      throw e;
    } finally {
      client.release();
    }

    await writeAudit('Employment Entry Updated',
      `user ${req.user.uid} · entry #${id} (${entry.job_title} at ${entry.company})`, '💼');
    res.json({ success: true, entry: serialiseEntry(entry) });
  }));

  /* Deleting the current position does NOT clear alumni_profiles.current_company
     or .job_title. Those two columns predate this table and are editable
     directly from the profile form, so wiping them here would destroy data the
     user entered somewhere else. Removing a timeline entry is a statement about
     the timeline, not a resignation. */
  app.delete('/api/careers/:id', requireAuth, (req, res) => ok(res, async () => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'A numeric entry id is required' });

    const cur = await db.query(`SELECT ${ENTRY_COLUMNS} FROM employment_history WHERE id = $1`, [id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Employment entry not found' });
    if (cur.rows[0].user_id !== req.user.uid) {
      return res.status(403).json({ error: 'You can only delete your own employment history' });
    }

    await db.query('DELETE FROM employment_history WHERE id = $1', [id]);
    await writeAudit('Employment Entry Deleted',
      `user ${req.user.uid} · entry #${id} (${cur.rows[0].job_title} at ${cur.rows[0].company})`, '🗑');
    res.json({ success: true, id });
  }));
};
