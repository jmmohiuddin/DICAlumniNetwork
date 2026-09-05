/* ============================================================
   DIC ALUMNI PLATFORM — AUDIT LOG & PLATFORM INTROSPECTION

   Owns: GET /api/audit-logs, GET /api/stats/platform,
         GET /api/stats/system, GET /api/stats/capabilities.

   Write path for the audit chain lives in src/server/shared/audit.js; this is
   the read path that was missing.

   The three /api/stats/* endpoints exist because the dashboards used to render
   invented numbers. The Executive Command Center animated its four headline
   KPIs to hardcoded literals (12,847 alumni · ৳24.7L raised · 1,203 mentorships
   · 47 events) that were never read from anywhere, and the Super Admin panel
   reported "CPU Load (AWS EKS) 18%", "RAM 4.2 / 16 GB", "API Latency 12 ms" and
   "DB Connection Pool 42 / 100" — for a deployment that does not run on EKS and
   measured none of those four values. The same panel listed "OAuth2 Developer
   Gateway", "bKash/Nagad MFS Payment Rails" and "Vector Similarity Search" as
   Active; none of the three exists in this codebase.

   Everything below is computed at request time from the live database or the
   running process. Where a number cannot be derived it is omitted rather than
   invented — the same rule the analytics module already follows for growth and
   trend figures, which are absent because no table records a historical
   snapshot to compare against.
   ============================================================ */

const db = require('../../db/pool');
const { ok } = require('../../shared/http');
const { auditReady } = require('../../shared/audit');
const { encryptionReady } = require('../../shared/crypto');

module.exports = function mountAudit(app, { requireAuth, requireRole, ADMIN_ROLES, MODERATOR_ROLES }) {

  app.get('/api/audit-logs', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const rows = await db.query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50');
    res.json(rows.rows);
  }));

  /* Headline figures for the Executive Command Center.
   *
   * Each field is a live aggregate. `fundsRaised` counts only SUCCESS rows —
   * a PENDING pledge is not money the institution has, and showing it as
   * collected is the same class of error as the hardcoded totals this replaced.
   * No growth or trend percentage is returned: the schema keeps no historical
   * snapshot, so any such number would be fabricated. */
  app.get('/api/stats/platform', requireAuth, (req, res) => ok(res, async () => {
    const [alumni, funds, mentorships, events, jobs, pending, moderation, donationStats, myRequests] = await Promise.all([
      db.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'alumni' AND is_verified = TRUE"),
      db.query("SELECT COALESCE(SUM(amount), 0)::float AS n FROM donations WHERE status = 'SUCCESS'"),
      db.query("SELECT COUNT(*)::int AS n FROM mentorships WHERE status IN ('accepted', 'completed')"),
      // events.event_date is a VARCHAR holding display text ("Aug 30, 2026"),
      // not a DATE, so it cannot be compared against CURRENT_DATE — the count
      // has to come from the stored status label instead. That label is set
      // when the event is created and rolled forward by a sweep, so it can lag
      // reality until the sweep runs. Worth fixing at the schema level; noted
      // rather than papered over with string parsing that would break on the
      // first row someone types differently.
      db.query("SELECT COUNT(*)::int AS n FROM events WHERE status = 'upcoming'"),
      db.query('SELECT COUNT(*)::int AS n FROM jobs'),
      // Moderation backlog. The moderator dashboard used to show "14 Pending
      // Reviews", "3 Reported Posts", a "99.4% Safety Index" and a "<5 min Avg
      // Review Time" — four literals over a platform that counts none of them.
      // These two are the queues that genuinely exist.
      db.query("SELECT COUNT(*)::int AS n FROM users WHERE verification_status = 'pending'"),
      db.query(`SELECT
                  (SELECT COUNT(*) FROM stories  WHERE status = 'pending')::int AS stories,
                  (SELECT COUNT(*) FROM chapters WHERE status = 'pending')::int AS chapters`),
      // Giving figures. The donations page showed "৳24.7L Total Raised FY26",
      // "1,847 Total Donors", "৳1,338 Avg Donation" and a "98.2% Transaction
      // Success" rate — four literals. The success-rate tile is gone entirely
      // rather than recomputed: with settlement now a manual staff action, the
      // ratio of SUCCESS to total measures how promptly staff reconcile
      // paperwork, not whether payments succeed, so the number would be
      // meaningless under its own label.
      db.query(`SELECT
                  COUNT(DISTINCT donor_user_id) FILTER (WHERE status = 'SUCCESS')::int AS donors,
                  COALESCE(AVG(amount) FILTER (WHERE status = 'SUCCESS'), 0)::float   AS avg_gift,
                  COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0)::float   AS pledged,
                  COUNT(*) FILTER (WHERE status = 'PENDING')::int                     AS pledge_count
                FROM donations`),
      // Scoped to the caller: incoming mentorship requests awaiting their
      // answer. The sidebar badge next to "Mentorship Hub" was the literal 3
      // for every user on every visit, including users with no requests at all.
      db.query(`SELECT COUNT(*)::int AS n FROM mentorships
                 WHERE mentor_id = $1 AND status = 'pending'`, [req.user.uid]),
    ]);

    const mod = moderation.rows[0];
    const giving = donationStats.rows[0];

    res.json({
      verifiedAlumni: alumni.rows[0].n,
      fundsRaised: funds.rows[0].n,
      currency: 'BDT',
      mentorshipConnections: mentorships.rows[0].n,
      upcomingEvents: events.rows[0].n,
      openJobPostings: jobs.rows[0].n,
      pendingVerifications: pending.rows[0].n,
      pendingStories: mod.stories,
      pendingChapters: mod.chapters,
      totalDonors: giving.donors,
      averageGift: giving.avg_gift,
      pledgedAwaitingConfirmation: giving.pledged,
      pledgeCount: giving.pledge_count,
      myPendingMentorshipRequests: myRequests.rows[0].n,
      // No "safety index", no "average review time", no employment rate: the
      // schema records nothing that could produce them honestly.
    });
  }));

  /* Geographic distribution for the Alumni Map page.
   *
   * The five tiles under the map read "47 Countries", "12,847 Mapped Alumni",
   * "8,241 In Bangladesh", "4,606 International" and "23 Active Chapters" —
   * five literals whose only relationship to each other was that 8,241 + 4,606
   * happens to equal 12,847. The real figures are much smaller, and a map
   * showing three countries under a caption claiming 47 is worse than one that
   * admits its own coverage.
   *
   * `mapped` counts profiles that actually carry a country, not all profiles:
   * the gap between the two is the honest answer to "how good is this map",
   * so it is returned rather than hidden. */
  app.get('/api/stats/geo', requireAuth, (req, res) => ok(res, async () => {
    const rows = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE country IS NOT NULL AND country <> '')::int              AS mapped,
        COUNT(DISTINCT country) FILTER (WHERE country IS NOT NULL AND country <> '')::int AS countries,
        COUNT(*) FILTER (WHERE LOWER(country) IN ('bangladesh', 'bd'))::int              AS in_bangladesh,
        COUNT(*)::int                                                                    AS total_profiles
      FROM alumni_profiles
    `);
    const chapters = await db.query("SELECT COUNT(*)::int AS n FROM chapters WHERE status = 'approved'");
    const r = rows.rows[0];

    res.json({
      countries: r.countries,
      mapped: r.mapped,
      inBangladesh: r.in_bangladesh,
      international: r.mapped - r.in_bangladesh,
      activeChapters: chapters.rows[0].n,
      // How many profiles have no country at all — the map's blind spot.
      unmapped: r.total_profiles - r.mapped,
    });
  }));

  /* Real runtime health for the Super Admin panel.
   *
   * Every value here is measured, not asserted: uptime and memory come from the
   * process itself, the pool counters from the live pg Pool, and dbLatencyMs
   * from an actual round trip timed on this request. There is no CPU figure —
   * Node cannot read container CPU load portably, and a made-up percentage is
   * exactly what this endpoint exists to remove. */
  app.get('/api/stats/system', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    const startedAt = process.hrtime.bigint();
    let dbLatencyMs = null;
    let dbReachable = true;
    try {
      await db.query('SELECT 1');
      dbLatencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    } catch {
      dbReachable = false;
    }

    const mem = process.memoryUsage();
    const pool = db.pool;

    res.json({
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      // rss is the resident set — the number that actually matters for a
      // container memory limit. heapUsed alone understates real usage.
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
      },
      database: {
        reachable: dbReachable,
        latencyMs: dbLatencyMs === null ? null : Math.round(dbLatencyMs * 100) / 100,
        isCloud: db.isCloud,
        // Live pool counters. `max` is the configured ceiling from db/pool.js.
        pool: pool
          ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: pool.options?.max ?? null }
          : null,
      },
    });
  }));

  /* Honest capability flags.
   *
   * This replaces a static list that reported three non-existent subsystems as
   * Active. Each entry below is derived from something real — a configuration
   * check, or the plain fact that no such code path exists in this deployment.
   * `enabled: false` with a reason is the point of the endpoint; do not add an
   * entry here that reports a capability this codebase does not actually have. */
  app.get('/api/stats/capabilities', requireRole(...ADMIN_ROLES), (req, res) => ok(res, async () => {
    res.json([
      {
        key: 'identity_vault',
        label: 'AES-256-GCM Identity Vault',
        enabled: encryptionReady,
        detail: encryptionReady
          ? 'ENCRYPTION_KEY configured; vault reads and writes are active.'
          : 'ENCRYPTION_KEY missing — the vault refuses to store data rather than falling back to plaintext.',
      },
      {
        key: 'audit_chain',
        label: 'Tamper-Evident Audit Chain',
        enabled: auditReady,
        detail: auditReady
          ? 'AUDIT_HMAC_KEY configured; entries are HMAC-chained and verifiable.'
          : 'AUDIT_HMAC_KEY missing — audit entries are refused rather than written unkeyed.',
      },
      {
        key: 'mfs_payments',
        label: 'bKash / Nagad MFS Payment Rails',
        enabled: false,
        detail: 'Not integrated. Donations and paid tickets are recorded as pledges and settled by staff; no payment gateway is called.',
      },
      {
        key: 'semantic_search',
        label: 'Vector Similarity Search',
        enabled: false,
        detail: 'Not implemented. Directory search runs on PostgreSQL full-text and trigram indexes, not embeddings.',
      },
      {
        key: 'oauth2_gateway',
        label: 'OAuth2 Developer Gateway',
        enabled: false,
        detail: 'Not implemented. The platform issues no API credentials and sends no webhooks.',
      },
    ]);
  }));
};
