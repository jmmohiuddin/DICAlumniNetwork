/*
 * gap-fixes-req.js — extracted verbatim from the original app.js, lines 2899-3639.
 *
 * The original "GAP-FIX ADDITIONS" block, kept as one contiguous section: REQ-03
 * Bangla transliteration detection (wraps filterDirectory), REQ-05 real-time
 * campaign ticker + enhanced donations rendering, REQ-07 referral request modal
 * + enhanced job rendering, REQ-08 career progression tracker, REQ-09 updated
 * 12-role RBAC table, REQ-10 offline sync queue manager, REQ-12 broadcast
 * history, REQ-18 developer API & webhooks page, and REQ-01 tenant branding
 * editor (also wraps switchAnalytics).
 */

// ─── REQ-03: BANGLA TRANSLITERATION DETECTION ────────────────
const BANGLA_RANGE = /[\u0980-\u09FF]/;
const _origFilterDir = filterDirectory;
filterDirectory = function(value) {
  const badge = document.getElementById('transliteration-badge');
  if (badge) {
    if (BANGLA_RANGE.test(value)) {
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  _origFilterDir(value);
};

/* ─── REQ-05: THE "REAL-TIME CAMPAIGN TICKER", REMOVED ───
 *
 * A setInterval used to run every few seconds, pick a campaign at random, add
 * ৳500–৳5,000 to it, increment its donor count, write the new figure straight
 * into the DOM and flash it teal. Nothing was donated; the numbers were
 * invented on a timer to make a demo look busy, and they overwrote the real
 * ledger figures the server had just returned.
 *
 * Campaign progress now comes from the donations ledger and changes when
 * somebody actually gives. If live updates are wanted later, the honest
 * version is a poll or a socket carrying real settlements.
 */
function startCampaignTicker() { /* removed — see above */ }

/** ৳ in lakh past 100,000, exact below it. "৳0.4L" is not how anyone reads it. */
function formatTaka(n) {
  const v = Number(n) || 0;
  return v >= 100000 ? '৳' + (v / 100000).toFixed(1) + 'L' : '৳' + Math.round(v).toLocaleString();
}

/* Campaign rows are held by id so the card's buttons can pass a number instead
 * of interpolating an admin-authored campaign name into an inline handler —
 * the XSS sink that showDonateModal's own comment documents. */
const campaignCardIndex = new Map();

function showDonateModalById(id) {
  const c = campaignCardIndex.get(String(id));
  if (c) showDonateModal(c.id, c.name);
}

function deleteCampaignPromptById(id) {
  const c = campaignCardIndex.get(String(id));
  if (c) deleteCampaignPrompt(c.id, c.name);
}

// ─── DONATIONS (REQ-05) ───
// A pledge is recorded here; it becomes a SUCCESS row only when staff confirm
// the money arrived (POST /api/donations/:id/settle). Progress bars read the
// ledger, not the denormalised counters on the campaign row.

async function renderCampaignsEnhanced() {
  const container = document.getElementById('campaigns-grid');
  if (!container) return;

  container.innerHTML = renderSkeletonCards(3, 'campaign');
  const campaigns = await API.getCampaigns();

  if (apiFailed(campaigns)) {
    container.innerHTML = renderErrorState(campaigns?.error || 'Could not load campaigns.', 'renderCampaignsEnhanced()');
    return;
  }
  if (campaigns.length === 0) {
    container.innerHTML = renderEmptyState('💚', 'No active campaigns', 'Fundraising campaigns will appear here once launched.');
    return;
  }

  const canManage = state.currentUser && ['super_admin', 'univ_admin'].includes(state.currentUser.role);

  container.innerHTML = campaigns.map(c => {
    /* raised_live / donors_live are computed by the server from the donations
     * ledger (SUM and COUNT DISTINCT over status='SUCCESS'). The card used to
     * read c.raised_amount and c.donors_count, denormalised counters seeded
     * with figures that were never backed by a transaction — ৳18.4 lakh against
     * a ledger holding ৳35,500 — so the page showed a campaign 75% funded while
     * the same screen's own headline said ৳35,500 had actually been received.
     * Same reasoning the chapters list already follows for member counts: trust
     * the rows, not the counter beside them. */
    const raised = Number(c.raised_live) || 0;
    const goal = Number(c.goal_amount) || 1;
    const pct = Math.min(100, Math.round((raised / goal) * 100));
    const gateways = Array.isArray(c.gateways) ? c.gateways : [];
    campaignCardIndex.set(String(c.id), c);
    return `
    <div class="campaign-card">
      <div class="campaign-card-header">
        <span class="campaign-tag ${escapeHtml(c.tag)}">${escapeHtml((c.tag || '').toUpperCase())}</span>
        <div class="campaign-name">${escapeHtml(c.name)}</div>
        <div class="campaign-desc">${escapeHtml(c.description || '')}</div>
      </div>
      <div class="campaign-progress">
        <div class="campaign-live-indicator"><div class="live-dot"></div> Live</div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-meta">
          <span class="progress-raised">${formatTaka(raised)} raised</span>
          <span class="progress-goal">of ${formatTaka(goal)} goal · ${pct}%</span>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;font-size:12px;color:var(--text-muted)">
          <span>👥 ${Number(c.donors_live) === 1 ? '1 donor' : Number(c.donors_live || 0).toLocaleString() + ' donors'}</span>
          <span>📅 ${escapeHtml(c.days_left)} days left</span>
        </div>
      </div>
      <div class="campaign-footer">
        <div class="gateway-pills">
          ${gateways.map(g => `<span class="gateway-pill ${escapeHtml(g)}">${escapeHtml(g.charAt(0).toUpperCase() + g.slice(1))}</span>`).join('')}
        </div>
        <div style="display:flex;gap:6px">
          ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="deleteCampaignPromptById(${Number(c.id)})">🗑</button>` : ''}
          <button class="donate-btn" onclick="showDonateModalById(${Number(c.id)})">Donate →</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── REQ-07: REFERRAL REQUEST WORKFLOW ──────────────────────
function showReferralModal(jobId, jobTitle, postedBy) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🤝 Request a Referral</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="margin-bottom:14px;padding:12px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
      <div style="font-size:12px;color:var(--text-muted)">Referral for</div>
      <div style="font-size:15px;font-weight:700;margin-top:2px">${escapeHtml(jobTitle)}</div>
      ${postedBy ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">Posted by ${escapeHtml(postedBy)}</div>` : ''}
    </div>
    <div class="input-group">
      <label class="input-label">Your message</label>
      <textarea id="referral-message" class="form-input" rows="5" placeholder="Introduce yourself and explain why you are a strong fit for this role…"></textarea>
    </div>
    <button class="btn btn-primary btn-full" onclick="submitReferralRequest(${jobId})">🤝 Send Referral Request</button>
  `);
}



// Same treatment for the job cards: every action button carries the numeric job
// id and the title / poster name are resolved from the record at click time.
const jobCardIndex = new Map();

function applyJobById(id) {
  const j = jobCardIndex.get(String(id));
  if (j) applyJob(j.id, j.title);
}

function showJobApplicantsById(id) {
  const j = jobCardIndex.get(String(id));
  if (j) showJobApplicants(j.id, j.title);
}

function deleteJobPromptById(id) {
  const j = jobCardIndex.get(String(id));
  if (j) deleteJobPrompt(j.id, j.title);
}

function showReferralModalById(id) {
  const j = jobCardIndex.get(String(id));
  if (j) showReferralModal(j.id, j.title, j.posted_by_name || '');
}

// Updated renderJobs with Referral button
// ─── JOBS (REQ-07) — served from PostgreSQL ───
async function renderJobsEnhanced(filter = '') {
  const container = document.getElementById('jobs-list');
  if (!container) return;

  container.innerHTML = renderSkeletonCards(3, 'job');
  const q = { ...(filter ? { search: filter } : {}), ...(state.jobFilters || {}) };
  const jobs = await API.getJobs(q);

  if (apiFailed(jobs)) {
    container.innerHTML = renderErrorState(jobs?.error || 'Could not load the job board.', 'renderJobsEnhanced()');
    return;
  }
  if (jobs.length === 0) {
    container.innerHTML = renderEmptyState('💼', 'No openings match your filters',
      'Verified alumni can post roles using the button above.');
    return;
  }

  const meId = state.currentUser?.id;
  const isAdmin = state.currentUser && ['super_admin', 'univ_admin'].includes(state.currentUser.role);

  container.innerHTML = jobs.map(j => {
    const tags = Array.isArray(j.tags) ? j.tags : [];
    const mine = j.posted_by_id === meId;
    jobCardIndex.set(String(j.id), j);
    return `
    <div class="job-card">
      <div class="job-company-logo">${escapeHtml(j.emoji || '💼')}</div>
      <div class="job-info">
        <div class="job-title">${escapeHtml(j.title)}</div>
        <div class="job-company">${escapeHtml(j.company)}</div>
        <div class="job-meta">
          <span class="job-meta-item">📍 ${escapeHtml(j.location || '—')}</span>
          <span class="job-meta-item">👤 ${escapeHtml(j.posted_by_name || 'DIC Alumni')}</span>
          <span class="job-meta-item">🕒 ${escapeHtml(formatRelativeTime(j.created_at))}</span>
          <span class="job-meta-item">📥 ${escapeHtml(j.applicants)} applicant${j.applicants === 1 ? '' : 's'}</span>
        </div>
        <div class="job-tags">${tags.map(t => `<span class="job-tag">${escapeHtml(t)}</span>`).join('')}</div>
      </div>
      <div class="job-right">
        <div class="job-salary">${escapeHtml(j.salary || 'Negotiable')}</div>
        <span class="job-type-badge ${escapeHtml(j.type)}">${escapeHtml((j.type || '').charAt(0).toUpperCase() + (j.type || '').slice(1))}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${mine || isAdmin
            ? `<button class="apply-btn" onclick="showJobApplicantsById(${Number(j.id)})">👥 Applicants (${escapeHtml(j.applicants)})</button>
               <button class="referral-btn" onclick="deleteJobPromptById(${Number(j.id)})">🗑 Delete</button>`
            : `<button class="apply-btn" ${j.has_applied ? 'disabled' : ''} onclick="applyJobById(${Number(j.id)})">${j.has_applied ? '✓ Applied' : 'Apply →'}</button>
               <button class="referral-btn" onclick="showReferralModalById(${Number(j.id)})">🤝 Referral</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── REQ-08: CAREER PROGRESSION ─────────────────────────────
/* Self-reported employment history, backed by /api/careers/*.
 *
 * What was here before was fiction end to end: MOCK_CAREER_REGISTRY listed
 * five named alumni with invented job histories, half of them tagged
 * updateType:'ai' as though a scraper had found them; MOCK_SELF_REPORT_PROMPTS
 * invented a queue of people to chase; renderEnrichmentStats() reported how
 * many profiles the enrichment run had updated. There was no enrichment run,
 * no scraper, and no employment_history table for any of it to read.
 *
 * The PRD's own resolution for REQ-08 was "Opt-in self-reporting with AI
 * enrichment", marked Approved. This is the self-reporting half, and it is the
 * part that can exist honestly: the alumnus enters their own history, and
 * saving a role marked "current" also updates the profile fields the directory
 * indexes, so the search stays accurate as a side effect of someone keeping
 * their own record straight.
 */
function renderCareerPage() {
  renderCareerTimeline();
}

async function renderCareerTimeline() {
  const host = document.getElementById('career-timeline-list');
  if (!host) return;

  const data = await API.getMyCareer();
  if (apiFailed(data)) {
    host.innerHTML = '<div class="queue-empty">Could not load your career history.</div>';
    return;
  }

  const history = data.history || [];
  const count = document.getElementById('career-count');
  if (count) {
    count.textContent = history.length === 1 ? '1 role' : `${history.length} roles`;
    count.hidden = history.length === 0;
  }

  if (!history.length) {
    host.innerHTML = `
      <div class="queue-empty">
        You haven't added any roles yet. Adding your current one is what makes
        you findable in the alumni directory.
      </div>`;
    return;
  }

  host.innerHTML = history.map(e => `
    <div class="career-entry${e.isCurrent ? ' is-current' : ''}">
      <div class="career-entry-main">
        <div class="career-entry-title">
          ${escapeHtml(e.jobTitle)}${e.isCurrent ? ' <span class="card-badge teal">Current</span>' : ''}
        </div>
        <div class="career-entry-company">${escapeHtml(e.company)}</div>
        <div class="career-entry-meta">${escapeHtml(formatCareerPeriod(e))}</div>
        ${e.description ? `<div class="career-entry-desc">${escapeHtml(e.description)}</div>` : ''}
      </div>
      <div class="career-entry-actions">
        <button class="btn btn-sm btn-outline" onclick="showCareerEntryModal(${Number(e.id)})">Edit</button>
        <button class="btn btn-sm btn-ghost" onclick="deleteCareerEntry(${Number(e.id)})">Delete</button>
      </div>
    </div>`).join('');
}

/* "Mar 2022 — Present · Dhaka". Dates come back as YYYY-MM-DD; only the month
 * and year are shown, because that is the granularity anyone actually knows
 * about a job they left years ago. */
function formatCareerPeriod(entry) {
  const monthYear = (d) => {
    if (!d) return '';
    const parsed = new Date(d);
    return isNaN(parsed) ? String(d)
      : parsed.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  };
  const span = [monthYear(entry.startDate), entry.isCurrent ? 'Present' : monthYear(entry.endDate)]
    .filter(Boolean).join(' — ');
  return [span, entry.location, entry.industry].filter(Boolean).join(' · ');
}

let careerEntryCache = [];

async function showCareerEntryModal(entryId = null) {
  // Editing needs the current values; fetch rather than trust a stale cache.
  if (entryId) {
    const data = await API.getMyCareer();
    careerEntryCache = apiFailed(data) ? [] : (data.history || []);
  }
  const e = entryId ? careerEntryCache.find(x => x.id === entryId) : null;
  const v = (x) => escapeHtml(x == null ? '' : String(x));

  showModal(`
    <div class="modal-header">
      <div class="modal-title">${entryId ? 'Edit role' : 'Add a role'}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="input-group">
      <label class="input-label" for="career-title">Job title</label>
      <input type="text" id="career-title" class="form-input" maxlength="255" value="${e ? v(e.jobTitle) : ''}" placeholder="e.g. Senior Software Engineer" />
    </div>
    <div class="input-group">
      <label class="input-label" for="career-company">Company</label>
      <input type="text" id="career-company" class="form-input" maxlength="255" value="${e ? v(e.company) : ''}" placeholder="e.g. bKash Ltd" />
    </div>
    <div class="field-grid-2">
      <div class="input-group">
        <label class="input-label" for="career-industry">Industry</label>
        <input type="text" id="career-industry" class="form-input" maxlength="100" value="${e ? v(e.industry) : ''}" placeholder="e.g. Technology" />
      </div>
      <div class="input-group">
        <label class="input-label" for="career-location">Location</label>
        <input type="text" id="career-location" class="form-input" maxlength="255" value="${e ? v(e.location) : ''}" placeholder="e.g. Dhaka" />
      </div>
    </div>
    <div class="field-grid-2">
      <div class="input-group">
        <label class="input-label" for="career-start">Started</label>
        <input type="month" id="career-start" class="form-input" value="${e ? v((e.startDate || '').slice(0, 7)) : ''}" />
      </div>
      <div class="input-group">
        <label class="input-label" for="career-end">Ended</label>
        <input type="month" id="career-end" class="form-input" value="${e ? v((e.endDate || '').slice(0, 7)) : ''}" />
      </div>
    </div>
    <label class="checkbox-row">
      <input type="checkbox" id="career-current" ${e && e.isCurrent ? 'checked' : ''} onchange="document.getElementById('career-end').disabled = this.checked" />
      This is my current role
    </label>
    <div class="input-group">
      <label class="input-label" for="career-description">What you do here (optional)</label>
      <input type="text" id="career-description" class="form-input" maxlength="500" value="${e ? v(e.description) : ''}" />
    </div>
    <p class="card-hint">
      Marking a role as current also updates the employer and job title shown on
      your directory profile.
    </p>
    <button class="btn btn-primary btn-full" onclick="saveCareerEntry(${entryId ? Number(entryId) : 'null'})">
      ${entryId ? 'Save changes' : 'Add role'}
    </button>
  `);

  const endInput = document.getElementById('career-end');
  if (endInput && e && e.isCurrent) endInput.disabled = true;
}

async function saveCareerEntry(entryId) {
  const val = id => (document.getElementById(id)?.value || '').trim();
  const isCurrent = document.getElementById('career-current')?.checked || false;

  const payload = {
    jobTitle: val('career-title'),
    company: val('career-company'),
    industry: val('career-industry') || null,
    location: val('career-location') || null,
    startDate: val('career-start') || null,
    endDate: isCurrent ? null : (val('career-end') || null),
    isCurrent,
    description: val('career-description') || null,
  };

  if (!payload.jobTitle || !payload.company) {
    showToast('⚠ A job title and a company are both required');
    return;
  }

  const res = entryId
    ? await API.updateCareerEntry(entryId, payload)
    : await API.createCareerEntry(payload);

  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not save that role.'}`); return; }

  closeModal();
  showToast(entryId ? '✅ Role updated' : '✅ Role added');
  renderCareerTimeline();
}

async function deleteCareerEntry(entryId) {
  if (!confirm('Delete this role from your career history?')) return;
  const res = await API.deleteCareerEntry(entryId);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not delete that role.'}`); return; }
  showToast('Role deleted');
  renderCareerTimeline();
}

// ─── REQ-09: UPDATED RBAC — 12 ROLES ────────────────────────
const MOCK_RBAC_V2 = {
  modules: [
    'Tenant Config & Branding', 'User Verification', 'Directory Search',
    'Mentorship', 'Donations & MFS', 'Financial Ledger', 'Event Management',
    'Job Board', 'Security Audit Log', 'Content Moderation', 'API & Webhooks', 'Career Tracker'
  ],
  roles: ['Super Admin', 'School Owner', 'Alumni Dir.', 'Chapter Off.', 'Content Mod.', 'Event Mgr.', 'Alumni ✓', 'Alumni ✗', 'Student', 'Finance Aud.', 'API Dev.', 'System'],
  matrix: [
    ['Full', 'Edit', 'Full', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'View'],
    ['Full', 'Full', 'Full', 'Edit', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'View'],
    ['Full', 'Full', 'Full', 'Full', 'View', 'View', 'Limited', 'View', 'View', 'View', 'None', 'Full'],
    ['Full', 'View', 'Full', 'Full', 'None', 'Edit', 'Request', 'None', 'View', 'None', 'None', 'View'],
    ['None', 'None', 'View', 'None', 'None', 'None', 'None', 'None', 'None', 'Full', 'None', 'None'],
    ['None', 'None', 'View', 'None', 'None', 'Full', 'None', 'None', 'None', 'None', 'None', 'None'],
    ['Full', 'Full', 'Full', 'Full', 'None', 'Donate', 'Donate', 'None', 'Full', 'None', 'None', 'Full'],
    ['Full', 'Full', 'View', 'None', 'None', 'None', 'None', 'None', 'View', 'None', 'None', 'Limited'],
    ['Full', 'Full', 'Full', 'Full', 'None', 'View', 'View', 'View', 'View', 'None', 'None', 'View'],
    ['Full', 'Full', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'Full'],
    ['None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'None', 'Full', 'None'],
    ['Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full', 'Full'],
  ],
};

function renderRBACTableV2() {
  const table = document.getElementById('rbac-table');
  if (!table) return;
  const permClass = {
    'Full': 'perm-full', 'Edit': 'perm-edit', 'View': 'perm-view',
    'None': 'perm-none', 'Limited': 'perm-limited', 'Audit': 'perm-audit',
    'Donate': 'perm-donate', 'Request': 'perm-view', 'Post': 'perm-edit', 'Apply': 'perm-view'
  };
  let html = `<thead><tr>
    <th class="module-col">Module</th>
    ${MOCK_RBAC_V2.roles.map(r => `<th class="role-col" style="font-size:9px">${r}</th>`).join('')}
  </tr></thead><tbody>`;
  MOCK_RBAC_V2.matrix.forEach((row, i) => {
    // data-label lets the same markup render as a table on desktop and as one
    // card per module on mobile (see the ≤900px block in styles.css).
    html += `<tr>
      <td class="module-name">${escapeHtml(MOCK_RBAC_V2.modules[i])}</td>
      ${row.map((p, j) => `<td class="perm-cell" data-label="${escapeHtml(MOCK_RBAC_V2.roles[j])}"><span class="${permClass[p] || 'perm-none'}">${escapeHtml(p)}</span></td>`).join('')}
    </tr>`;
  });
  html += '</tbody>';
  table.innerHTML = html;
}

// ─── REQ-10: OFFLINE SYNC QUEUE MANAGER ─────────────────────
const MOCK_SYNC_QUEUE = [
  { type: 'mutation', op: 'UPDATE alumni#847 jobTitle', size: '2.4 KB', ts: '14:32:08' },
  { type: 'checkin', op: 'INSERT event_checkin#REU-2026-0447', size: '0.8 KB', ts: '14:31:55' },
  { type: 'mutation', op: 'INSERT donation#TXN-C3E8A9', size: '1.2 KB', ts: '14:31:44' },
  { type: 'conflict', op: 'CONFLICT checkin#REU-2026-0112 — duplicate detected', size: '1.6 KB', ts: '14:30:22' },
  { type: 'mutation', op: 'UPDATE alumni#1204 profilePhoto', size: '47.2 KB', ts: '14:28:11' },
  { type: 'checkin', op: 'INSERT event_checkin#REU-2026-0448', size: '0.8 KB', ts: '14:27:09' },
];

function renderOfflineSyncPanel() {
  const el = document.getElementById('offline-sync-panel');
  if (!el) return;

  const totalPayload = 3.8; // MB
  const maxPayload = 5.0;
  const pct = Math.round((totalPayload / maxPayload) * 100);

  el.innerHTML = `
    <div class="glass-card">
      <div class="card-header"><h3 class="card-title">Sync Overview</h3><span class="card-badge teal">Dexie.js IndexedDB</span></div>
      <div class="sync-overview-grid">
        <div class="sync-stat-card"><div class="sync-stat-val">${MOCK_SYNC_QUEUE.length}</div><div class="sync-stat-label">Queue Depth</div></div>
        <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--amber)">${MOCK_SYNC_QUEUE.filter(q => q.type === 'conflict').length}</div><div class="sync-stat-label">Conflicts</div></div>
        <div class="sync-stat-card"><div class="sync-stat-val">247</div><div class="sync-stat-label">Synced Today</div></div>
        <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--green)">99.8%</div><div class="sync-stat-label">Success Rate</div></div>
      </div>
      <div class="sync-payload-bar-wrap" style="margin-top:16px">
        <div class="sync-payload-label">
          <span>Payload Size: ${totalPayload}MB</span>
          <span style="color:${pct > 80 ? 'var(--amber)' : 'var(--teal)'}">${pct}% of 5MB cap</span>
        </div>
        <div class="sync-payload-track"><div class="sync-payload-fill" style="width:${pct}%"></div></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">LRU eviction triggers at 100MB cache threshold · Retry on reconnect after 3 exponential backoffs</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" onclick="showToast('🔄 Manual sync triggered — 6 items syncing…')">🔄 Sync Now</button>
        <button class="btn btn-outline btn-sm" onclick="showToast('🗑 Conflict log cleared')">Clear Conflicts</button>
      </div>
    </div>
    <div class="glass-card">
      <div class="card-header"><h3 class="card-title">Pending Queue</h3><span class="badge-count">${MOCK_SYNC_QUEUE.length}</span></div>
      ${MOCK_SYNC_QUEUE.map(q => `
        <div class="sync-queue-item">
          <span class="sync-queue-type ${q.type}">${q.type.toUpperCase()}</span>
          <span style="flex:1;color:var(--text-secondary);font-family:monospace;font-size:11px">${q.op}</span>
          <span style="color:var(--text-muted);font-size:11px">${q.size}</span>
          <span style="color:var(--text-muted);font-size:11px">${q.ts}</span>
        </div>
      `).join('')}
    </div>
    <div class="glass-card">
      <div class="card-header"><h3 class="card-title">Conflict Resolution Log</h3></div>
      ${MOCK_SYNC_QUEUE.filter(q => q.type === 'conflict').length === 0
        ? '<div style="text-align:center;padding:24px;color:var(--text-muted)">✓ No conflicts</div>'
        : MOCK_SYNC_QUEUE.filter(q => q.type === 'conflict').map(q => `
          <div class="sync-queue-item">
            <span class="sync-queue-type conflict">CONFLICT</span>
            <span style="flex:1;color:var(--red);font-family:monospace;font-size:11px">${q.op}</span>
            <button class="btn btn-sm btn-outline" style="font-size:10px" onclick="showToast('✅ Conflict resolved: last-write-wins applied')">Resolve</button>
          </div>
        `).join('')
      }
    </div>
  `;
}

// ─── REQ-12: BROADCAST HISTORY WITH READ RECEIPTS ────────────

// ─── BROADCAST HISTORY ───
async function renderBroadcastHistory() {
  const el = document.getElementById('broadcast-history');
  if (!el) return;

  const rows = await API.getBroadcasts();
  if (apiFailed(rows)) {
    el.innerHTML = renderErrorState(rows?.error || 'Could not load broadcast history.', 'renderBroadcastHistory()');
    return;
  }
  if (rows.length === 0) {
    el.innerHTML = renderEmptyState('📢', 'No broadcasts sent yet', 'Announcements you send will be listed here with delivery counts.');
    return;
  }

  el.innerHTML = rows.map(b => `
    <div class="broadcast-entry">
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px">${escapeHtml(b.title)}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(b.body)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
          ${escapeHtml(formatRelativeTime(b.created_at))} · by ${escapeHtml(b.sender_name || 'System')}
          ${b.target_role ? ` · to ${escapeHtml(b.target_role)}` : ' · to everyone'}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="card-badge teal">${escapeHtml(b.delivered_count)}/${escapeHtml(b.recipients_count)} delivered</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escapeHtml((b.channels || []).join(' · '))}</div>
      </div>
    </div>`).join('');
}

// ─── REQ-18: DEVELOPER API & WEBHOOKS PAGE ───────────────────
/* Everything that used to live here was fabricated, and dangerously so.
 *
 * MOCK_API_APPS invented three OAuth2 applications with client IDs
 * (cl_dic_sis_a4f2b9c3 and friends). MOCK_WEBHOOKS reported three endpoints
 * with 1,847 / 342 / 2,103 successful deliveries. MOCK_API_LOG rendered a
 * "Live Request Log" of API calls, complete with latencies and a 403, that had
 * never been made. MOCK_SIS_INTEGRATIONS showed the college's own Student
 * Information System, an Oracle ERP finance module and a federated BUET alumni
 * database as "connected".
 *
 * The platform issues no API credentials and sends no webhooks — there is no
 * versioned public API in this codebase at all. A super admin reading that page
 * would reasonably have concluded the finance system was integrated. The page
 * is now an explicit not-implemented state (see #page-apidev in index.html) and
 * these render functions are kept only so the page router keeps resolving.
 *
 * If REQ-18 is ever built, replace these with real calls — do not restore the
 * mock arrays. */
function renderAPIPage() { /* static not-implemented markup; nothing to render */ }

// ─── REQ-01: TENANT BRANDING EDITOR ─────────────────────────
function renderTenantListEnhanced() {
  // Real headcount, not the literal that used to sit in the data.
  API.getPlatformStats().then(st => {
    if (apiFailed(st)) return;
    document.querySelectorAll('[data-institution-alumni]').forEach(n => {
      n.textContent = Number(st.verifiedAlumni).toLocaleString();
    });
  });

  const el = document.getElementById('tenant-list');
  if (!el) return;
  el.innerHTML = MOCK_TENANTS.map(t => `
    <div class="tenant-card glass-card">
      <div style="flex:1">
        <div style="font-size:16px;font-weight:700">${t.name}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${t.subdomain}</div>
        <div class="tenant-branding-editor">
          <div class="branding-editor-title">🎨 Branding</div>
          <div class="branding-color-grid">
            <div class="color-field">
              <div class="color-swatch" style="background:#6C63FF" title="Primary color" onclick="showToast('🎨 Color picker for Primary')"></div>
              <span class="color-label">Primary</span>
            </div>
            <div class="color-field">
              <div class="color-swatch" style="background:#00D4AA" title="Accent color" onclick="showToast('🎨 Color picker for Accent')"></div>
              <span class="color-label">Accent</span>
            </div>
          </div>
          <button class="btn btn-sm btn-outline btn-full" onclick="showToast('🏫 Custom CSS editor for ${t.name} opened')">Custom CSS / Logo</button>
        </div>
      </div>
      <div style="text-align:center;padding:0 16px">
        <div style="font-size:18px;font-weight:800;color:var(--teal)" data-institution-alumni>—</div>
        <div style="font-size:11px;color:var(--text-muted)">Alumni</div>
      </div>
      <div style="text-align:center;padding:0 16px">
        <div style="font-size:13px;font-weight:700;color:var(--primary-light)">${t.plan}</div>
        <div style="font-size:11px;color:var(--text-muted)">Plan</div>
      </div>
      <span class="tenant-status ${t.status}">${t.status.toUpperCase()}</span>
    </div>
  `).join('') + `
    <div class="tenant-card glass-card" style="border-color:rgba(248,113,113,0.3);opacity:0.75">
      <div style="flex:1">
        <div style="font-size:16px;font-weight:700">Rajshahi University Alumni <span style="font-size:12px;color:var(--red)">— SUSPENDED</span></div>
        <div style="font-size:12px;color:var(--text-secondary)">ru.alumnai.io</div>
        <div style="font-size:12px;color:var(--red);margin-top:6px">⚠ Subscription expired Jul 1, 2026 · 72 day grace period remaining</div>
        <div style="font-size:11px;color:var(--text-muted)">White-labeled suspension notice active at ru.alumnai.io</div>
      </div>
      <span class="tenant-status" style="background:rgba(248,113,113,0.12);color:var(--red)">SUSPENDED</span>
    </div>
  `;
}

// ─── OVERRIDE INITAPP & SHOWPAGE (CLEANED UP) ─────────────────
// All renderers directly invoked in master initApp and showPage functions


// ============================================================
// REMAINING FEATURE IMPLEMENTATIONS
// ============================================================

