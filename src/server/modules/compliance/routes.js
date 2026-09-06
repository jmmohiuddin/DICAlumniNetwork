/* ============================================================
   DIC ALUMNI PLATFORM — COMPLIANCE ROUTES (REQ-14)
   PDPA 2026 & Cybersecurity Act 2023.

   The UI previously displayed green "compliant" pills over features that did
   not exist: decryptVaultField() revealed a hardcoded string, there was no
   consent log, and DSAR export/delete were toast messages. These endpoints
   implement the behaviour those claims describe.
   ============================================================ */

const crypto = require('crypto');
const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { sweepEventStatuses, sweepTaskReminders } = require('../events/routes');

// A DSAR export carries other people's text into the requester's file (a
// mentorship counterpart's name, for one), so a cell opening with = + - @ TAB
// or CR would run as a formula when a *different* person opens their own lawful
// export. Neutralise the leading character with an apostrophe, then quote per
// RFC 4180 — wrap in double quotes, double any embedded double quote.
function csvCell(value) {
  // The widened export carries jsonb payloads, text[] columns and timestamps,
  // which String() renders as '[object Object]' and as a locale-dependent
  // date. Serialise them to something a reader can actually use before the
  // neutralisation runs — the neutralisation itself is unchanged.
  const text = value === null || value === undefined ? ''
             : value instanceof Date ? value.toISOString()
             : typeof value === 'object' ? JSON.stringify(value)
             : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

module.exports = function mountCompliance(app, {
  requireAuth, requireRole, ADMIN_ROLES,
  encryptField, decryptField, encryptionReady, writeAudit
}) {


  /* The IP on a consent record is legal evidence under PDPA 2026, so it must
   * not be attacker-supplied. This used to read the left-most X-Forwarded-For
   * entry, which is exactly the hop a client writes itself: any caller could
   * stamp a consent record with any IP they liked.
   *
   * `req.ip` is the Express-sanctioned answer. It consults the app's
   * `trust proxy` setting: with it off (the default, and this app's current
   * state) Express ignores X-Forwarded-For entirely and returns the socket
   * address; with it set to a hop count or a subnet, Express walks the header
   * from the right and stops at the first untrusted hop.
   *
   * DEPLOYMENT: when this app runs behind a proxy or CDN (Vercel, nginx),
   * server.js must declare it — `app.set('trust proxy', 1)`, where 1 is the
   * number of proxies in front of the app. Never `app.set('trust proxy', true)`:
   * that trusts the whole chain and re-opens the forgery above. Until that line
   * exists, consent records behind a proxy carry the proxy's address, which is
   * wrong but honest — unlike a client-chosen one.
   */
  const clientIp = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

  /* ─── CONSENT LOGGING ───
     PDPA 2026 requires IP, timestamp and policy version behind each consent. */

  app.post('/api/consent', requireAuth, (req, res) => ok(res, async () => {
    const { consentType, granted, policyVersion } = req.body || {};
    if (!consentType) return res.status(400).json({ error: 'consentType is required' });

    const row = await db.query(`
      INSERT INTO consent_logs (user_id, consent_type, granted, policy_version, ip_address, user_agent)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [req.user.uid, consentType, granted !== false,
        policyVersion || 'PDPA-2026.1', clientIp(req), req.headers['user-agent'] || null]);

    await writeAudit('Consent Recorded',
      `user ${req.user.uid} ${granted !== false ? 'granted' : 'withdrew'} "${consentType}"`, '📜');
    res.json({ success: true, consent: row.rows[0] });
  }));

  app.get('/api/consent', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(
      'SELECT * FROM consent_logs WHERE user_id=$1 ORDER BY created_at DESC', [req.user.uid]);
    res.json(rows.rows);
  }));

  /* ─── ENCRYPTED IDENTITY VAULT (AES-256-GCM) ─── */

  app.get('/api/vault', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    // Masked view: never decrypts. last_four is stored alongside the ciphertext
    // so the list can render without touching the key.
    const rows = await db.query(`
      SELECT v.id, v.field_type, v.last_four, v.created_at,
             u.id AS user_id, u.full_name AS owner_name
      FROM identity_vault v JOIN users u ON u.id = v.user_id
      ORDER BY v.created_at DESC LIMIT 50
    `);
    res.json({ encryptionEnabled: encryptionReady, entries: rows.rows });
  }));

  app.post('/api/vault', requireAuth, (req, res) => ok(res, async () => {
    if (!encryptionReady) {
      return res.status(503).json({ error: 'Encryption key not configured — refusing to store identity data.' });
    }
    const { fieldType, value } = req.body || {};
    if (!['nid', 'brc', 'passport'].includes(fieldType)) {
      return res.status(400).json({ error: 'fieldType must be nid, brc or passport' });
    }
    if (!value || !String(value).trim()) return res.status(400).json({ error: 'A value is required' });

    const plain = String(value).trim();
    const { ciphertext, iv, authTag } = encryptField(plain);

    const row = await db.query(`
      INSERT INTO identity_vault (user_id, field_type, ciphertext, iv, auth_tag, last_four)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id, field_type) DO UPDATE
        SET ciphertext=EXCLUDED.ciphertext, iv=EXCLUDED.iv,
            auth_tag=EXCLUDED.auth_tag, last_four=EXCLUDED.last_four
      RETURNING id, field_type, last_four, created_at
    `, [req.user.uid, fieldType, ciphertext, iv, authTag, plain.slice(-4)]);

    await writeAudit('Identity Field Encrypted',
      `${fieldType.toUpperCase()} stored for user ${req.user.uid} (AES-256-GCM)`, '🔐');
    res.json({ success: true, entry: row.rows[0] });
  }));

  // Decryption is privileged, requires a stated reason, and is itself logged.
  app.post('/api/vault/:id/reveal', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    if (!encryptionReady) return res.status(503).json({ error: 'Encryption key not configured' });

    const { reason } = req.body || {};
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ error: 'A reason (min 5 characters) is required to decrypt identity data' });
    }

    const row = await db.query(`
      SELECT v.*, u.full_name FROM identity_vault v
      JOIN users u ON u.id = v.user_id WHERE v.id = $1
    `, [parseInt(req.params.id)]);
    if (!row.rows.length) return res.status(404).json({ error: 'Vault entry not found' });

    let plaintext;
    try {
      plaintext = decryptField(row.rows[0]);
    } catch {
      // GCM auth tag mismatch means the ciphertext or key changed.
      return res.status(500).json({ error: 'Decryption failed — data integrity check did not pass' });
    }

    await db.query('INSERT INTO vault_access_logs (vault_id, accessed_by, reason) VALUES ($1,$2,$3)',
      [row.rows[0].id, req.user.uid, reason.trim()]);
    await writeAudit('Identity Field Decrypted',
      `${row.rows[0].field_type.toUpperCase()} of ${row.rows[0].full_name} by user ${req.user.uid} — "${reason.trim()}"`, '🔓');

    res.json({ value: plaintext, owner: row.rows[0].full_name, fieldType: row.rows[0].field_type });
  }));

  app.get('/api/vault/access-logs', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT l.*, u.full_name AS accessed_by_name, v.field_type, o.full_name AS owner_name
      FROM vault_access_logs l
      LEFT JOIN users u ON u.id = l.accessed_by
      LEFT JOIN identity_vault v ON v.id = l.vault_id
      LEFT JOIN users o ON o.id = v.user_id
      ORDER BY l.created_at DESC LIMIT 50
    `);
    res.json(rows.rows);
  }));

  /* ─── DSAR: STRUCTURED EXPORT (JSON / CSV) ───
   *
   * PDPA 2026 promises a FULL personal data export, and the previous version
   * of this endpoint covered eight of the twenty-two places this platform
   * holds personal data about a person. It silently omitted, among others,
   * their identity-vault entries, every job application and referral they
   * made, their connection graph, their notifications, the broadcasts sent to
   * them, their poll votes, and the record of which administrators had
   * decrypted their national ID. A partial export presented as complete is a
   * worse compliance position than no export at all, because the subject has
   * no way to tell that something is missing.
   *
   * The rule applied per table: if a row's existence or content tells you
   * something about THIS person, it belongs in the export. Rows that are about
   * someone else and merely mention the subject as a counterparty are included
   * only to the extent the counterparty's identity is not disclosed.
   *
   * Two tables are deliberately excluded, and the export says so in
   * `notIncluded` rather than staying quiet about it:
   *
   *   - audit_logs. These are the controller's security records, not the
   *     subject's data. There is no user_id column — the actor is named inside
   *     a free-text `meta` string — so any attempt to select "their" entries
   *     would be a substring match that both misses entries and returns other
   *     people's. Disclosing the chain also discloses the controller's
   *     security posture. Available on request through the compliance owner.
   *   - resume file BYTES. The metadata is exported; the file itself is served
   *     by its own authenticated route, because embedding megabytes of base64
   *     in a CSV cell helps nobody.
   */

  app.get('/api/dsar/export', requireAuth, (req, res) => ok(res, async () => {
    const uid = req.user.uid;
    const format = (req.query.format || 'json').toLowerCase();
    /* Opt-in, because decrypting is not free of consequence — see the block
     * comment above the identity section below. */
    const includeIdentity = String(req.query.includeIdentity || '').toLowerCase() === 'true';

    // Fetched first: the broadcast query needs the subject's role and batch to
    // work out which broadcasts were addressed to them.
    const [user, profile] = await Promise.all([
      db.query('SELECT id, email, full_name, role, role_label, department, is_verified, created_via, created_at FROM users WHERE id=$1', [uid]),
      db.query('SELECT * FROM alumni_profiles WHERE user_id=$1', [uid])
    ]);
    if (!user.rows.length) return res.status(404).json({ error: 'Account not found' });
    const role = user.rows[0].role;
    const batch = profile.rows[0]?.batch ?? null;

    const [
      donations, registrations, mentorships, memberships, consents, stories,
      connections, notifications, applications, referrals, jobsPosted,
      pollVotes, chaptersCreated, proposalsOwned, offlineMutations,
      broadcastsReceived, vaultAccessAboutMe, vaultAccessByMe, resumes,
      deletionRequests, vaultEntries
    ] = await Promise.all([
      db.query(`SELECT amount, currency, payment_gateway, status, receipt_code, is_anonymous,
                       transaction_reference, settlement_reference, settled_at, completed_at, created_at
                FROM donations WHERE donor_user_id=$1 ORDER BY created_at`, [uid]),

      db.query(`SELECT r.ticket_code, r.status, r.checked_in, r.checked_in_at, r.ticket_type,
                       r.amount_due, r.amount_paid, r.payment_status, r.payment_reference,
                       r.created_at, e.title AS event_title, e.event_date
                FROM event_registrations r LEFT JOIN events e ON e.id = r.event_id
                WHERE r.user_id=$1 ORDER BY r.created_at`, [uid]),

      // The counterpart's name is the subject's data too — they knew who they
      // were mentoring — so it is disclosed, but nothing else about them is.
      db.query(`SELECT m.subject, m.message, m.status, m.match_score, m.health_score,
                       m.created_at, m.responded_at, m.completed_at,
                       CASE WHEN m.mentor_id=$1 THEN 'mentor' ELSE 'mentee' END AS my_role,
                       other.full_name AS counterpart_name
                FROM mentorships m
                JOIN users other ON other.id = CASE WHEN m.mentor_id=$1 THEN m.mentee_id ELSE m.mentor_id END
                WHERE m.mentor_id=$1 OR m.mentee_id=$1 ORDER BY m.created_at`, [uid]),

      db.query(`SELECT cm.chapter_id, c.name AS chapter_name, c.type, cm.joined_at
                FROM chapter_memberships cm LEFT JOIN chapters c ON c.id = cm.chapter_id
                WHERE cm.user_id=$1 ORDER BY cm.joined_at`, [uid]),

      db.query(`SELECT consent_type, granted, policy_version, ip_address, user_agent, created_at
                FROM consent_logs WHERE user_id=$1 ORDER BY created_at`, [uid]),

      db.query(`SELECT title, category, excerpt, status, published_date, created_at
                FROM stories WHERE author_id=$1 ORDER BY created_at`, [uid]),

      db.query(`SELECT CASE WHEN c.requester_id=$1 THEN 'sent' ELSE 'received' END AS direction,
                       c.status, c.created_at, other.full_name AS other_person
                FROM connections c
                JOIN users other ON other.id = CASE WHEN c.requester_id=$1 THEN c.addressee_id ELSE c.requester_id END
                WHERE c.requester_id=$1 OR c.addressee_id=$1 ORDER BY c.created_at`, [uid]),

      db.query(`SELECT icon, title, subtitle, is_unread, created_at
                FROM notifications WHERE user_id=$1 ORDER BY created_at`, [uid]),

      db.query(`SELECT a.status, a.cover_note, a.resume_url, a.resume_file_id, a.created_at,
                       j.title AS job_title, j.company
                FROM job_applications a LEFT JOIN jobs j ON j.id = a.job_id
                WHERE a.applicant_id=$1 ORDER BY a.created_at`, [uid]),

      db.query(`SELECT CASE WHEN r.requester_id=$1 THEN 'requested' ELSE 'asked_to_refer' END AS direction,
                       r.message, r.status, r.created_at, j.title AS job_title, j.company
                FROM job_referrals r LEFT JOIN jobs j ON j.id = r.job_id
                WHERE r.requester_id=$1 OR r.referrer_id=$1 ORDER BY r.created_at`, [uid]),

      db.query(`SELECT title, company, salary, type, location, tags, created_at
                FROM jobs WHERE posted_by_id=$1 ORDER BY created_at`, [uid]),

      db.query(`SELECT v.poll_id, p.question, v.option_index, p.options[v.option_index + 1] AS my_answer, v.created_at
                FROM poll_votes v LEFT JOIN polls p ON p.id = v.poll_id
                WHERE v.user_id=$1 ORDER BY v.created_at`, [uid]),

      db.query(`SELECT name, type, description, status, created_at
                FROM chapters WHERE created_by_id=$1 ORDER BY created_at`, [uid]),

      db.query(`SELECT name, category, type, status, event_date, created_at
                FROM event_proposals WHERE owner_id=$1 ORDER BY created_at`, [uid]),

      db.query(`SELECT client_mutation_id, entity, action, payload, applied, created_at
                FROM sync_mutations WHERE user_id=$1 ORDER BY created_at`, [uid]),

      /* "Broadcasts received" is not stored as a per-recipient row — broadcasts
       * are addressed by role and batch — so membership is derived the same way
       * delivery is. A NULL target means "everyone", which includes the subject. */
      db.query(`SELECT title, body, channels, target_role, target_batch, created_at
                FROM broadcasts
                WHERE (target_role IS NULL OR target_role = $1)
                  AND (target_batch IS NULL OR target_batch = $2)
                ORDER BY created_at`, [role, batch]),

      /* Who decrypted the subject's identity documents, when, and why. This is
       * squarely the subject's data — arguably the single most important thing
       * in the export — and it was missing entirely. */
      db.query(`SELECT l.created_at, l.reason, v.field_type, actor.full_name AS accessed_by
                FROM vault_access_logs l
                JOIN identity_vault v ON v.id = l.vault_id
                LEFT JOIN users actor ON actor.id = l.accessed_by
                WHERE v.user_id=$1 ORDER BY l.created_at`, [uid]),

      // And, if the subject is an administrator, the reveals they performed.
      db.query(`SELECT l.created_at, l.reason, v.field_type
                FROM vault_access_logs l LEFT JOIN identity_vault v ON v.id = l.vault_id
                WHERE l.accessed_by=$1 ORDER BY l.created_at`, [uid]),

      db.query(`SELECT id, filename, content_type, byte_size, sha256, created_at
                FROM resume_files WHERE user_id=$1 ORDER BY created_at`, [uid]),

      db.query(`SELECT reason, status, purge_after, purged_at, created_at
                FROM deletion_requests WHERE user_id=$1 ORDER BY created_at`, [uid]),

      db.query(`SELECT id, field_type, last_four, created_at, ciphertext, iv, auth_tag
                FROM identity_vault WHERE user_id=$1 ORDER BY created_at`, [uid])
    ]);

    /* ─── THE ENCRYPTED IDENTITY VAULT IN A SELF-SERVICE DSAR ───
     *
     * A data subject IS entitled to their own NID/BRC/passport number; it is
     * their data and PDPA access rights cover it. Refusing outright would
     * under-deliver on the same promise this endpoint exists to keep.
     *
     * But everywhere else in this codebase decryption is privileged, requires
     * a written reason and is recorded in vault_access_logs, and that is not
     * ceremony — it exists because a decrypted national ID is the most
     * damaging single field the platform holds. A self-service export that
     * silently dumped it would mean one stolen session token exfiltrates a
     * plaintext NID with no trace, which is strictly worse than the privileged
     * path this same file is careful about.
     *
     * The decision taken here:
     *   - Metadata (field type, last four digits, when stored) is ALWAYS
     *     included. It is not sensitive and its absence is what made the old
     *     export incomplete.
     *   - Plaintext is included only when the caller explicitly asks for it
     *     (?includeIdentity=true). It is never the default, so nothing that
     *     merely replays a stored export URL gets it.
     *   - Every plaintext disclosure writes a vault_access_logs row — the SAME
     *     table an administrator's reveal writes to, with the subject recorded
     *     as the accessor — and a hash-chained audit entry. The subject can
     *     then see their own DSAR disclosure in the vaultAccessAboutMe section
     *     of their next export, which is exactly the visibility they should
     *     have if someone else ever obtains their session.
     *
     * FOR THE COMPLIANCE OWNER TO RATIFY: this is a deliberate policy choice,
     * not a technical default. The stricter alternative — export metadata only
     * and hand identity numbers over through an offline identity-verified
     * channel — is a two-line change here. A stronger middle option is to
     * require password re-authentication on this endpoint when
     * includeIdentity=true; that needs a re-auth helper that does not exist in
     * middleware/auth.js yet.
     */
    let identityDisclosed = [];
    const identityVault = vaultEntries.rows.map(v => {
      const entry = {
        fieldType: v.field_type,
        lastFour: v.last_four,
        storedAt: v.created_at,
        encryption: 'AES-256-GCM',
        value: null,
        valueWithheld: 'Re-request with ?includeIdentity=true to include the decrypted value. The disclosure is logged.'
      };
      if (!includeIdentity) return entry;
      if (!encryptionReady) {
        entry.valueWithheld = 'ENCRYPTION_KEY is not configured on this server, so the value cannot be decrypted.';
        return entry;
      }
      try {
        entry.value = decryptField(v);
        entry.valueWithheld = null;
        identityDisclosed.push(v);
      } catch {
        // GCM auth tag mismatch: ciphertext or key changed. Say so rather than
        // returning an empty field the subject would read as "nothing stored".
        entry.valueWithheld = 'Decryption failed — the stored data did not pass its integrity check.';
      }
      return entry;
    });

    for (const v of identityDisclosed) {
      await db.query(
        'INSERT INTO vault_access_logs (vault_id, accessed_by, reason) VALUES ($1,$2,$3)',
        [v.id, uid, 'Self-service DSAR export by the data subject (PDPA 2026 right of access)']);
      await writeAudit('Identity Field Decrypted',
        `${v.field_type.toUpperCase()} disclosed to its own subject (user ${uid}) via DSAR export`, '🔓');
    }

    const bundle = {
      exportedAt: new Date().toISOString(),
      policyVersion: 'PDPA-2026.1',
      subject: user.rows[0] || null,
      profile: profile.rows[0] || null,
      identityVault,
      consentHistory: consents.rows,
      deletionRequests: deletionRequests.rows,
      donations: donations.rows,
      eventRegistrations: registrations.rows,
      mentorships: mentorships.rows,
      connections: connections.rows,
      chapterMemberships: memberships.rows,
      chaptersCreated: chaptersCreated.rows,
      stories: stories.rows,
      jobsPosted: jobsPosted.rows,
      jobApplications: applications.rows,
      jobReferrals: referrals.rows,
      resumeFiles: resumes.rows,
      eventProposals: proposalsOwned.rows,
      pollVotes: pollVotes.rows,
      notifications: notifications.rows,
      broadcastsReceived: broadcastsReceived.rows,
      identityVaultAccessesAboutMe: vaultAccessAboutMe.rows,
      identityVaultAccessesByMe: vaultAccessByMe.rows,
      offlineSyncMutations: offlineMutations.rows,
      notIncluded: [
        'audit_logs — the controller\'s hash-chained security record. It has no user_id column (the actor appears inside free-text metadata), so it cannot be filtered to one person reliably or without exposing other people\'s entries. Available on request from the compliance owner.',
        'resume file contents — metadata is listed under resumeFiles; download each file from /api/resumes/:id.',
        includeIdentity
          ? null
          : 'identity vault plaintext — re-request with ?includeIdentity=true. The disclosure is logged to vault_access_logs and the audit chain.'
      ].filter(Boolean)
    };

    await writeAudit('DSAR Export',
      `user ${uid} exported their data as ${format.toUpperCase()}` +
      (identityDisclosed.length ? ` including ${identityDisclosed.length} decrypted identity field(s)` : ''), '📦');

    // Personal data must not sit in a shared cache or a proxy.
    res.setHeader('Cache-Control', 'no-store');

    if (format === 'csv') {
      // Flatten each section into its own labelled block.
      const lines = [];
      for (const [section, value] of Object.entries(bundle)) {
        if (Array.isArray(value)) {
          lines.push(`# ${section}`);
          if (value.length && value[0] !== null && typeof value[0] === 'object') {
            // A column set has to come from somewhere, and rows in one section
            // are uniform, so the first row defines the header.
            lines.push(Object.keys(value[0]).join(','));
            value.forEach(r => lines.push(Object.values(r).map(csvCell).join(',')));
          } else if (value.length) {
            // A list of plain strings (notIncluded) has no columns; one value
            // per row under a synthetic header beats Object.keys('text')
            // spilling the string out one character per column.
            lines.push('value');
            value.forEach(v => lines.push(csvCell(v)));
          }
          lines.push('');
        } else if (value && typeof value === 'object') {
          lines.push(`# ${section}`);
          lines.push(Object.keys(value).join(','));
          lines.push(Object.values(value).map(csvCell).join(','));
          lines.push('');
        }
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="dic_dsar_export_${uid}.csv"`);
      return res.send(lines.join('\n'));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="dic_dsar_export_${uid}.json"`);
    res.send(JSON.stringify(bundle, null, 2));
  }));

  /* ─── DSAR: ACCOUNT DELETION WITH 30-DAY GRACE ─── */

  app.post('/api/dsar/delete', requireAuth, (req, res) => ok(res, async () => {
    const existing = await db.query(
      `SELECT * FROM deletion_requests WHERE user_id=$1 AND status='pending'`, [req.user.uid]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'A deletion request is already pending', request: existing.rows[0] });
    }
    const row = await db.query(
      'INSERT INTO deletion_requests (user_id, reason) VALUES ($1,$2) RETURNING *',
      [req.user.uid, req.body?.reason || null]);

    await writeAudit('Account Deletion Requested',
      `user ${req.user.uid}; purge scheduled ${row.rows[0].purge_after}`, '⚠');
    await db.query(`INSERT INTO notifications (user_id, icon, title, subtitle) VALUES ($1,'⚠','Account Deletion Scheduled',$2)`,
      [req.user.uid, 'Your account is scheduled for deletion in 30 days. You can cancel any time before then.']);

    res.json({ success: true, request: row.rows[0] });
  }));

  app.get('/api/dsar/delete', requireAuth, (req, res) => ok(res, async () => {
    const row = await db.query(
      `SELECT * FROM deletion_requests WHERE user_id=$1 AND status='pending'`, [req.user.uid]);
    res.json(row.rows[0] || null);
  }));

  app.delete('/api/dsar/delete', requireAuth, (req, res) => ok(res, async () => {
    const row = await db.query(
      `UPDATE deletion_requests SET status='cancelled' WHERE user_id=$1 AND status='pending' RETURNING *`,
      [req.user.uid]);
    if (!row.rows.length) return res.status(404).json({ error: 'No pending deletion request' });
    await writeAudit('Account Deletion Cancelled', `user ${req.user.uid}`, '↩');
    res.json({ success: true });
  }));

  /* ════════════════════════════════════════════════════════════
     AUTOMATED PURGE OF EXPIRED DELETION REQUESTS

     deletion_requests.purge_after has been written since the DSAR delete
     endpoint was added and read by absolutely nothing. There was no cron, no
     scheduler, no sweep — so the platform told users, in a notification it
     wrote itself, that their account would be deleted in 30 days, and then
     never deleted it. That is the promise this section keeps.

     ─── HARD-DELETE vs ANONYMISE, AND WHY ───

     "Delete everything" is the wrong instruction, because several of these
     tables hold records that the controller has an independent legal duty to
     retain, or that belong to other people:

     • audit_logs is NEVER TOUCHED. It is a hash chain: every entry's HMAC
       covers the previous entry's hash, so removing or editing one row makes
       verifyAuditChain() report a break at that point and at every entry after
       it, forever. Deleting one person's entries would destroy the tamper
       evidence for everyone else's. The chain does not carry a user_id anyway
       — the actor appears as a numeric id inside free-text metadata, and once
       the users row is tombstoned that id points at nothing identifying. A
       dangling integer is not personal data.

     • donations are ANONYMISED, NOT DELETED. A donation is a financial ledger
       entry against a campaign whose raised_amount was credited from it, and a
       receipt was issued against it. Financial records carry their own
       retention period that a data-subject request does not override, and
       deleting the row would silently falsify every campaign total that
       already counted it. donor_user_id and donor_name go; the amount, the
       receipt code and the date stay.

     • stories and jobs are ANONYMISED, NOT DELETED. Both have ON DELETE
       CASCADE from users, so deleting the person would take published articles
       and live job postings with them — and every OTHER alumnus's application
       to those jobs. Attribution is stripped; the content stays.

     • consent_logs are ANONYMISED. The consent record is the controller's
       evidence that its past processing was lawful, so the event is retained;
       the user_id, IP address and user-agent that make it personal are not.

     • vault_access_logs are RETAINED with their vault link severed. These
       record that an administrator decrypted an identity document and the
       reason they gave. That is a security record under the Cybersecurity Act
       2023 and losing it would erase the accountability trail for an
       administrator's action. The identity_vault row itself is destroyed, so
       nothing connects the record to a person any more.
       ⚠ FLAG: `reason` is admin-written free text and could contain the
       subject's name. Redacting it is a one-line change if the compliance
       owner wants it.

     • Everything genuinely personal and belonging to nobody else — the profile,
       the identity vault, notifications, connections, mentorships, poll votes,
       job applications and referrals, chapter memberships, resume files,
       offline sync mutations — is HARD DELETED. Several of these columns are
       NOT NULL (mentorships.mentor_id, job_applications.applicant_id), so
       anonymising in place is not even possible; deletion is the only option
       the schema permits.

     • The users row is TOMBSTONED, not deleted. Fourteen foreign keys cascade
       from it. Overwriting every identifying column — with a password_hash
       that cannot authenticate, because it does not start with 'scrypt$' —
       leaves nothing identifying while keeping every one of those references
       valid. Irreversible anonymisation is erasure; a cascade that destroys
       other people's records is not.
     ════════════════════════════════════════════════════════════ */

  /** Purges one due request. Assumes the caller has verified it is due. */
  async function purgeUser(request) {
    const uid = request.user_id;

    // Facts gathered BEFORE anything is removed, so the audit entry describes
    // what was actually there. Once the rows are gone this is unrecoverable.
    const counts = await db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM alumni_profiles      WHERE user_id=$1)                    AS profiles,
        (SELECT COUNT(*)::int FROM identity_vault       WHERE user_id=$1)                    AS vault_entries,
        (SELECT COUNT(*)::int FROM notifications        WHERE user_id=$1)                    AS notifications,
        (SELECT COUNT(*)::int FROM connections          WHERE requester_id=$1 OR addressee_id=$1) AS connections,
        (SELECT COUNT(*)::int FROM mentorships          WHERE mentor_id=$1 OR mentee_id=$1)  AS mentorships,
        (SELECT COUNT(*)::int FROM poll_votes           WHERE user_id=$1)                    AS poll_votes,
        (SELECT COUNT(*)::int FROM job_applications     WHERE applicant_id=$1)               AS job_applications,
        (SELECT COUNT(*)::int FROM job_referrals        WHERE requester_id=$1)               AS job_referrals,
        (SELECT COUNT(*)::int FROM chapter_memberships  WHERE user_id=$1)                    AS chapter_memberships,
        (SELECT COUNT(*)::int FROM resume_files         WHERE user_id=$1)                    AS resume_files,
        (SELECT COUNT(*)::int FROM sync_mutations       WHERE user_id=$1)                    AS sync_mutations,
        (SELECT COUNT(*)::int FROM event_registrations  WHERE user_id=$1)                    AS event_registrations,
        (SELECT COUNT(*)::int FROM donations            WHERE donor_user_id=$1)              AS donations_anonymised,
        (SELECT COALESCE(SUM(amount),0)::text FROM donations WHERE donor_user_id=$1 AND status='SUCCESS') AS donations_total,
        (SELECT COUNT(*)::int FROM stories              WHERE author_id=$1)                  AS stories_anonymised,
        (SELECT COUNT(*)::int FROM jobs                 WHERE posted_by_id=$1)               AS jobs_anonymised,
        (SELECT COUNT(*)::int FROM consent_logs         WHERE user_id=$1)                    AS consents_anonymised
    `, [uid]);
    const summary = counts.rows[0];

    /* The audit entry goes in BEFORE the data does out. If the transaction
     * below fails, a second entry records that — an audit trail that overstates
     * one failed attempt is recoverable; one that never mentions a deletion
     * that did happen is not. */
    await writeAudit('Account Purge Executed',
      `deletion request ${request.id} for user ${uid} (requested ${new Date(request.created_at).toISOString()}, ` +
      `due ${new Date(request.purge_after).toISOString()}) — ` +
      Object.entries(summary).map(([k, v]) => `${k}=${v}`).join(' '), '🧹');

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      /* ── ANONYMISE AND RETAIN ── */
      await client.query(
        `UPDATE donations SET donor_user_id=NULL, donor_name='Erased Donor', is_anonymous=TRUE
          WHERE donor_user_id=$1`, [uid]);
      await client.query(
        `UPDATE stories SET author_id=NULL, author_name='Former Alumni' WHERE author_id=$1`, [uid]);
      await client.query(
        `UPDATE jobs SET posted_by_id=NULL, posted_by_name='Former Alumni' WHERE posted_by_id=$1`, [uid]);
      await client.query(`UPDATE chapters SET created_by_id=NULL WHERE created_by_id=$1`, [uid]);
      await client.query(`UPDATE event_proposals SET owner_id=NULL WHERE owner_id=$1`, [uid]);
      await client.query(`UPDATE broadcasts SET sender_id=NULL WHERE sender_id=$1`, [uid]);
      await client.query(`UPDATE event_registrations SET checked_in_by=NULL WHERE checked_in_by=$1`, [uid]);
      await client.query(`UPDATE job_referrals SET referrer_id=NULL WHERE referrer_id=$1`, [uid]);
      await client.query(
        `UPDATE consent_logs SET user_id=NULL, ip_address=NULL, user_agent=NULL WHERE user_id=$1`, [uid]);

      /* Sever the vault link before destroying the vault rows, so the access
       * records survive the ON DELETE CASCADE from identity_vault. */
      await client.query(
        `UPDATE vault_access_logs SET vault_id=NULL
          WHERE vault_id IN (SELECT id FROM identity_vault WHERE user_id=$1)`, [uid]);
      await client.query(`UPDATE vault_access_logs SET accessed_by=NULL WHERE accessed_by=$1`, [uid]);

      /* ── HARD DELETE ── */
      // Seats are returned before the registrations go, or registered_count
      // permanently overstates attendance for every event they had a ticket to.
      await client.query(`
        UPDATE events e SET registered_count = GREATEST(0, e.registered_count - x.n)
          FROM (SELECT event_id, COUNT(*)::int n FROM event_registrations
                 WHERE user_id=$1 AND status='confirmed' GROUP BY event_id) x
         WHERE e.id = x.event_id`, [uid]);

      await client.query('DELETE FROM identity_vault      WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM resume_files        WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM job_applications    WHERE applicant_id=$1', [uid]);
      await client.query('DELETE FROM job_referrals       WHERE requester_id=$1', [uid]);
      await client.query('DELETE FROM event_registrations WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM chapter_memberships WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM poll_votes          WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM mentorships         WHERE mentor_id=$1 OR mentee_id=$1', [uid]);
      await client.query('DELETE FROM connections         WHERE requester_id=$1 OR addressee_id=$1', [uid]);
      await client.query('DELETE FROM notifications       WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM sync_mutations      WHERE user_id=$1', [uid]);
      await client.query('DELETE FROM alumni_profiles     WHERE user_id=$1', [uid]);

      /* ── TOMBSTONE ──
       * password_hash is set to a value that cannot authenticate: verifyPassword()
       * rejects anything not starting with 'scrypt$' before it hashes a candidate.
       * The email is rewritten to an unroutable @deleted.invalid address so the
       * old address cannot be used to log in and is not disclosed anywhere.
       * The role drops to 'alumni' so a tombstoned administrator carries no
       * residual privilege in any query that counts by role. */
      await client.query(`
        UPDATE users SET
          email                = 'erased-' || id || '@deleted.invalid',
          full_name            = 'Erased User',
          initials             = 'XX',
          role                 = 'alumni',
          role_label           = 'Erased Account',
          department           = 'N/A',
          password_hash        = 'ERASED',
          icon                 = '⬜',
          is_verified          = FALSE,
          must_change_password = FALSE,
          erased_at            = CURRENT_TIMESTAMP
        WHERE id = $1`, [uid]);

      /* Every pending request for this user closes, not just the one that
       * triggered the run, so a duplicate request cannot re-purge a tombstone. */
      await client.query(`
        UPDATE deletion_requests
           SET status='completed', purged_at=CURRENT_TIMESTAMP, purge_summary=$2::jsonb
         WHERE user_id=$1 AND status='pending'`, [uid, JSON.stringify(summary)]);

      await client.query('COMMIT');
      return { requestId: request.id, userId: uid, ...summary };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* connection already gone */ }
      await writeAudit('Account Purge FAILED',
        `deletion request ${request.id} for user ${uid} rolled back: ${e.message}`, '❌');
      throw e;
    } finally {
      client.release();
    }
  }

  /* The sweep. Idempotent and safe to call repeatedly: a request is selected
   * only while it is still 'pending' and past its purge_after, and completing
   * it is part of the same transaction that removes the data, so a second run
   * against the same request finds nothing. A failure on one request does not
   * abandon the rest — each is its own transaction. */
  async function purgeExpiredDeletions({ limit = 50 } = {}) {
    const due = await db.query(`
      SELECT id, user_id, created_at, purge_after
        FROM deletion_requests
       WHERE status='pending' AND purge_after <= CURRENT_TIMESTAMP
       ORDER BY purge_after ASC
       LIMIT $1`, [limit]);

    const purged = [], failed = [];
    for (const request of due.rows) {
      try {
        purged.push(await purgeUser(request));
      } catch (e) {
        console.error(`✖  purge of deletion request ${request.id} failed:`, e.message);
        failed.push({ requestId: request.id, userId: request.user_id, error: e.message });
      }
    }
    return { due: due.rows.length, purged: purged.length, failed: failed.length, details: purged, errors: failed };
  }

  /* ════════════════════════════════════════════════════════════
     SCHEDULER ENTRY POINTS

     A cron caller is not a user, so it must not authenticate as one. A bearer
     session token belonging to a super_admin would have to be minted, stored
     in the scheduler's configuration and rotated every SESSION_TTL_MS (12
     hours) — and if it leaked it would be a full administrator login, not
     merely the right to run a sweep. The credential here is a shared secret in
     CRON_SECRET that grants nothing except these endpoints.

     It is compared in constant time. A byte-by-byte === on a secret leaks its
     prefix through response timing to anyone who can measure it.

     A logged-in super_admin is also accepted, so an operator can run a sweep
     by hand from the admin panel without knowing the deployment secret.
     ════════════════════════════════════════════════════════════ */

  const CRON_SECRET = process.env.CRON_SECRET || '';

  /* A length check alone is not a configuration check.
   *
   * .env.example shipped CRON_SECRET="replace-with-64-hex-chars" — 25
   * characters, which cleared the old `length >= 16` test. So the ordinary
   * `cp .env.example .env` produced a WORKING credential for these endpoints,
   * and that credential is published in this repository. /api/cron/run-all is
   * registered for GET as well as POST, so on any deployment that copied the
   * example, a single URL fetch with a known bearer token would execute every
   * due account purge — hard deletes across thirteen tables, irreversible.
   *
   * The placeholder is now rejected explicitly and the floor raised to 32.
   * .env.example ships the key empty, so a copied file is inert rather than
   * armed: an unset secret fails closed with 503, which is the safe state. */
  const PLACEHOLDER = /^(replace-with|changeme|change-me|your-secret|xxx+|todo)/i;
  const cronReady = CRON_SECRET.length >= 32 && !PLACEHOLDER.test(CRON_SECRET);

  if (CRON_SECRET && !cronReady) {
    console.error('✖  CRON_SECRET is set but rejected: it is either shorter than 32 characters ' +
                  'or still the placeholder from .env.example. The scheduled sweeps are DISABLED. ' +
                  'If a deployment has been running with the placeholder, treat it as leaked and ' +
                  'rotate it — the value is in git history and editing the file does not un-leak it.');
  }

  if (!cronReady) {
    console.warn('⚠  CRON_SECRET missing or shorter than 16 characters — the scheduled sweeps at ' +
                 '/api/cron/* are unreachable by a scheduler (a super_admin can still run them by hand). ' +
                 'The 30-day PDPA deletion promise does not execute on its own until this is set. ' +
                 'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }

  function secretMatches(presented) {
    const a = Buffer.from(String(presented), 'utf8');
    const b = Buffer.from(CRON_SECRET, 'utf8');
    // timingSafeEqual throws on a length mismatch, so the lengths are compared
    // first. That leaks the secret's length, which is not a useful secret.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  function requireCron(req, res, next) {
    if (req.user && req.user.role === 'super_admin') return next();
    if (!cronReady) {
      return res.status(503).json({ error: 'Scheduled sweeps are not configured: CRON_SECRET is unset on this server.' });
    }
    // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; X-Cron-Secret is
    // accepted for schedulers that cannot set an Authorization header.
    const header = req.headers.authorization || '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-cron-secret'] || '');
    if (!presented || !secretMatches(presented)) {
      return res.status(401).json({ error: 'Invalid or missing cron credential' });
    }
    next();
  }

  /* Registered for GET as well as POST because Vercel Cron issues GET
   * requests. Every one of these is idempotent, so a GET that changes state is
   * safe here in a way it would not be for an ordinary route — but it is
   * exactly why they are behind a secret and not merely unguessable. */
  const cronRoute = (path, handler) => { app.get(path, requireCron, handler); app.post(path, requireCron, handler); };

  cronRoute('/api/cron/purge-deletions', (req, res) => ok(res, async () => {
    res.json({ sweep: 'purge-deletions', ...(await purgeExpiredDeletions()) });
  }));

  cronRoute('/api/cron/event-status', (req, res) => ok(res, async () => {
    res.json({ sweep: 'event-status', ...(await sweepEventStatuses()) });
  }));

  cronRoute('/api/cron/task-reminders', (req, res) => ok(res, async () => {
    res.json({ sweep: 'task-reminders', ...(await sweepTaskReminders()) });
  }));

  /* One schedule entry for deployments with a limited cron allowance. Each
   * sweep is reported independently: one failing must not hide the others,
   * and the scheduler should still see a 200 with the failure named rather
   * than a 500 that tells it nothing about which sweep broke. */
  cronRoute('/api/cron/run-all', (req, res) => ok(res, async () => {
    const results = {};
    for (const [name, fn] of [
      ['purgeDeletions', purgeExpiredDeletions],
      ['eventStatus', sweepEventStatuses],
      ['taskReminders', sweepTaskReminders]
    ]) {
      try { results[name] = await fn(); }
      catch (e) { console.error(`✖  sweep ${name} failed:`, e.stack || e); results[name] = { error: e.message }; }
    }
    res.json({ ranAt: new Date().toISOString(), ...results });
  }));

  /* What the purge would do, without doing it. Lets the compliance owner see
   * the queue before the scheduler acts on it. */
  app.get('/api/dsar/purge-queue', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT d.id, d.user_id, d.reason, d.purge_after, d.created_at,
             (d.purge_after <= CURRENT_TIMESTAMP) AS due_now,
             u.full_name, u.email, u.erased_at
        FROM deletion_requests d LEFT JOIN users u ON u.id = d.user_id
       WHERE d.status = 'pending'
       ORDER BY d.purge_after ASC`);
    res.json({ cronConfigured: cronReady, pending: rows.rows });
  }));

  /* ─── COMPLIANCE STATUS ───
     Drives the admin panel pills from reality instead of hardcoded green. */

  app.get('/api/compliance/status', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const [vault, consents, deletions, audits, access, overdue, purged] = await Promise.all([
      db.query('SELECT COUNT(*)::int n FROM identity_vault'),
      db.query('SELECT COUNT(*)::int n FROM consent_logs'),
      db.query(`SELECT COUNT(*)::int n FROM deletion_requests WHERE status='pending'`),
      db.query('SELECT COUNT(*)::int n FROM audit_logs'),
      db.query('SELECT COUNT(*)::int n FROM vault_access_logs'),
      db.query(`SELECT COUNT(*)::int n FROM deletion_requests
                 WHERE status='pending' AND purge_after <= CURRENT_TIMESTAMP`),
      db.query(`SELECT COUNT(*)::int n FROM deletion_requests WHERE purged_at IS NOT NULL`)
    ]);

    res.json([
      {
        icon: '🔐', title: 'AES-256-GCM Field Encryption',
        desc: encryptionReady
          ? `Active. ${vault.rows[0].n} identity field(s) encrypted at the application layer.`
          : 'INACTIVE — ENCRYPTION_KEY is not configured. Identity storage is refused.',
        status: encryptionReady ? 'compliant' : 'at_risk'
      },
      {
        icon: '📜', title: 'Consent Logging (PDPA 2026)',
        desc: `${consents.rows[0].n} consent event(s) recorded with IP, timestamp and policy version.`,
        status: consents.rows[0].n > 0 ? 'compliant' : 'pending'
      },
      {
        icon: '🛡', title: 'Immutable Audit Trail (CA 2023)',
        desc: `${audits.rows[0].n} hash-chained entries; ${access.rows[0].n} vault access record(s).`,
        status: audits.rows[0].n > 0 ? 'compliant' : 'pending'
      },
      {
        icon: '📦', title: 'Data Subject Rights (DSAR)',
        desc: `JSON/CSV export active across all 22 personal-data tables. ` +
              `${deletions.rows[0].n} deletion request(s) in the 30-day grace window.`,
        status: 'compliant'
      },
      /* This pill reports whether the 30-day deletion the platform PROMISES is
       * actually executing. It reads 'at_risk' the moment a request is past its
       * purge_after and still pending — which, before the sweep existed, was
       * the permanent state of every request ever made. */
      {
        icon: '🧹', title: '30-Day Deletion Purge (PDPA 2026)',
        desc: overdue.rows[0].n > 0
          ? `AT RISK — ${overdue.rows[0].n} request(s) are past their purge date and still pending. ` +
            (cronReady ? 'Check the scheduler is reaching /api/cron/purge-deletions.'
                       : 'CRON_SECRET is not set, so no scheduler can trigger the sweep.')
          : cronReady
            ? `Scheduled sweep configured. ${purged.rows[0].n} account(s) purged to date; nothing overdue.`
            : `Nothing overdue, but CRON_SECRET is unset — the sweep only runs when an administrator triggers it by hand.`,
        status: overdue.rows[0].n > 0 ? 'at_risk' : (cronReady ? 'compliant' : 'pending')
      }
    ]);
  }));
};
