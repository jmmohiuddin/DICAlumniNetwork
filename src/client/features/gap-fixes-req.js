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

// ─── REQ-05: REAL-TIME CAMPAIGN TICKER ──────────────────────
const MOCK_CAMPAIGNS_LIVE = {};
MOCK_CAMPAIGNS.forEach(c => {
  MOCK_CAMPAIGNS_LIVE[c.id] = { raised: c.raised, donors: c.donors };
});

function startCampaignTicker() {
  setInterval(() => {
    MOCK_CAMPAIGNS.forEach(c => {
      const increments = [500, 1000, 2000, 5000];
      const inc = increments[Math.floor(Math.random() * increments.length)];
      if (Math.random() < 0.25 && c.raised < c.goal) {
        c.raised = Math.min(c.raised + inc, c.goal);
        c.donors += 1;
        // Update live raised element
        const el = document.getElementById(`campaign-raised-${c.id}`);
        if (el) {
          el.textContent = '৳' + (c.raised / 100000).toFixed(1) + 'L raised';
          el.style.color = 'var(--teal)';
          setTimeout(() => el.style.color = '', 500);
        }
        const pctEl = document.getElementById(`campaign-pct-${c.id}`);
        const pct = Math.round((c.raised / c.goal) * 100);
        if (pctEl) pctEl.style.width = pct + '%';
      }
    });
  }, 3500);
}

// Enhanced renderCampaigns with live IDs and ticker
// ─── DONATIONS (REQ-05) ───
// Two-phase: a PENDING ledger row is written, the gateway step is authorised,
// then the transaction is confirmed and the campaign total moves.
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
    const raised = Number(c.raised_amount) || 0;
    const goal = Number(c.goal_amount) || 1;
    const pct = Math.min(100, Math.round((raised / goal) * 100));
    const gateways = Array.isArray(c.gateways) ? c.gateways : [];
    const safeName = escapeHtml(c.name).replace(/'/g, '&#39;');
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
          <span class="progress-raised">৳${(raised / 100000).toFixed(1)}L raised</span>
          <span class="progress-goal">of ৳${(goal / 100000).toFixed(1)}L goal · ${pct}%</span>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;font-size:12px;color:var(--text-muted)">
          <span>👥 ${Number(c.donors_count || 0).toLocaleString()} donors</span>
          <span>📅 ${c.days_left} days left</span>
        </div>
      </div>
      <div class="campaign-footer">
        <div class="gateway-pills">
          ${gateways.map(g => `<span class="gateway-pill ${escapeHtml(g)}">${escapeHtml(g.charAt(0).toUpperCase() + g.slice(1))}</span>`).join('')}
        </div>
        <div style="display:flex;gap:6px">
          ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="deleteCampaignPrompt(${c.id}, '${safeName}')">🗑</button>` : ''}
          <button class="donate-btn" onclick="showDonateModal(${c.id}, '${safeName}')">Donate →</button>
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
    const safeTitle = escapeHtml(j.title).replace(/'/g, '&#39;');
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
          <span class="job-meta-item">📥 ${j.applicants} applicant${j.applicants === 1 ? '' : 's'}</span>
        </div>
        <div class="job-tags">${tags.map(t => `<span class="job-tag">${escapeHtml(t)}</span>`).join('')}</div>
      </div>
      <div class="job-right">
        <div class="job-salary">${escapeHtml(j.salary || 'Negotiable')}</div>
        <span class="job-type-badge ${escapeHtml(j.type)}">${escapeHtml((j.type || '').charAt(0).toUpperCase() + (j.type || '').slice(1))}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${mine || isAdmin
            ? `<button class="apply-btn" onclick="showJobApplicants(${j.id}, '${safeTitle}')">👥 Applicants (${j.applicants})</button>
               <button class="referral-btn" onclick="deleteJobPrompt(${j.id}, '${safeTitle}')">🗑 Delete</button>`
            : `<button class="apply-btn" ${j.has_applied ? 'disabled' : ''} onclick="applyJob(${j.id}, '${safeTitle}')">${j.has_applied ? '✓ Applied' : 'Apply →'}</button>
               <button class="referral-btn" onclick="showReferralModal(${j.id}, '${safeTitle}', '${escapeHtml(j.posted_by_name || '').replace(/'/g, '&#39;')}')">🤝 Referral</button>`}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── REQ-08: CAREER PROGRESSION TRACKER ─────────────────────
const MOCK_CAREER_REGISTRY = [
  { id: 1, name: 'Fatima Khanam', initials: 'FK', color: '#6C63FF', batch: 2019, current: 'Senior SWE @ bKash Ltd', prev: 'Full-Stack Dev @ TechBD (2019–2022)', updateType: 'ai', lastUpdated: '2026-07-30' },
  { id: 2, name: 'Arif Hossain', initials: 'AH', color: '#00D4AA', batch: 2018, current: 'Data Scientist @ Pathao', prev: 'Data Analyst @ LightCastle (2018–2020)', updateType: 'self', lastUpdated: '2026-07-28' },
  { id: 3, name: 'Tasnim Akter', initials: 'TA', color: '#34D399', batch: 2015, current: 'SWE @ Google, London', prev: 'Backend Eng @ ThoughtWorks UK (2016–2020)', updateType: 'ai', lastUpdated: '2026-07-29' },
  { id: 4, name: 'Liana Choudhury', initials: 'LC', color: '#C084FC', batch: 2018, current: 'AI Ethics Lead @ DeepMind', prev: 'Research Scientist @ Oxford AI Lab (2018–2023)', updateType: 'ai', lastUpdated: '2026-07-30' },
  { id: 5, name: 'Omar Faruk', initials: 'OF', color: '#00D4AA', batch: 2013, current: 'CEO @ FinTech BD', prev: 'VP Engineering @ Dutch-Bangla Bank (2013–2019)', updateType: 'self', lastUpdated: '2026-07-25' },
  { id: 6, name: 'Nusrat Jahan', initials: 'NJ', color: '#C084FC', batch: 2020, current: 'Investment Analyst @ BRAC Bank', prev: 'Finance Intern @ Citibank BD (2020)', updateType: 'pending', lastUpdated: '2026-07-20' },
  { id: 7, name: 'Tanvir Ahmed', initials: 'TA2', color: '#FF8C42', batch: 2017, current: 'Product Manager @ Shohoz', prev: 'Business Analyst @ Berger Paints (2017–2019)', updateType: 'ai', lastUpdated: '2026-07-30' },
  { id: 8, name: 'Mehnaz Sultana', initials: 'MS', color: '#6C63FF', batch: 2016, current: 'Cloud Architect @ Amazon AWS', prev: 'DevOps Engineer @ Wipro (2016–2020)', updateType: 'self', lastUpdated: '2026-07-15' },
];

const MOCK_SELF_REPORT_PROMPTS = [
  { name: 'Khalid Mahmud', initials: 'KM', question: 'Is "Backend Engineer @ Chaldal" still your current role?' },
  { name: 'Priya Das', initials: 'PD', question: 'Have you changed your role at SSL Wireless recently?' },
  { name: 'Babu Rahman', initials: 'BR', question: 'We detected a LinkedIn update — new role at Robi Axiata?' },
  { name: 'Sabbir Islam', initials: 'SI', question: 'Your profile hasn\'t been updated in 6 months. Still at BTCL?' },
];

function renderCareerTracker() {
  renderCareerRegistry();
  renderSelfReportPrompts();
  renderEnrichmentStats();
}

function renderCareerRegistry(filter = '') {
  const el = document.getElementById('career-registry-list');
  if (!el) return;
  let data = MOCK_CAREER_REGISTRY;
  if (filter) data = data.filter(c => c.updateType === filter || c.current.toLowerCase().includes(filter));
  el.innerHTML = data.map(c => `
    <div class="career-registry-item">
      <div class="career-registry-avatar" style="background:linear-gradient(135deg,${c.color}40,${c.color}20);color:${c.color}">${c.initials}</div>
      <div class="career-registry-info">
        <div class="career-registry-name">${c.name} <span style="font-size:11px;color:var(--text-muted)">· Batch ${c.batch}</span></div>
        <div class="career-registry-current">${c.current}</div>
        <div class="career-registry-history">Previously: ${c.prev}</div>
      </div>
      <div class="career-registry-action" style="text-align:right;flex-shrink:0">
        <div class="career-update-badge ${c.updateType}">${c.updateType === 'ai' ? '🤖 AI Updated' : c.updateType === 'self' ? '✎ Self-Reported' : '⏳ Pending'}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${c.lastUpdated}</div>
        <button class="btn btn-sm btn-outline" style="margin-top:6px;font-size:10px" onclick="showToast('✎ Edit form for ${c.name} loading…')">Edit</button>
      </div>
    </div>
  `).join('');
}

function filterCareerRegistry(val) { renderCareerRegistry(val); }
function filterCareerStatus(val) { renderCareerRegistry(val); }

function renderSelfReportPrompts() {
  const el = document.getElementById('self-report-prompts');
  if (!el) return;
  el.innerHTML = MOCK_SELF_REPORT_PROMPTS.map(p => `
    <div class="self-report-prompt-item" onclick="showSelfReportModal('${p.name}')">
      <div class="career-registry-avatar" style="width:36px;height:36px;background:rgba(255,140,66,0.2);color:var(--amber);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${p.initials}</div>
      <div>
        <div class="prompt-question">${p.question}</div>
        <div class="prompt-name">${p.name}</div>
      </div>
      <span style="font-size:18px;color:var(--amber)">?</span>
    </div>
  `).join('');
}

function renderEnrichmentStats() {
  const el = document.getElementById('enrichment-stats');
  if (!el) return;
  const stats = [
    { label: 'Total Alumni Tracked', val: '12,847', color: 'var(--teal)' },
    { label: 'AI Auto-Updated (30d)', val: '847', color: 'var(--teal)' },
    { label: 'Self-Reported (30d)', val: '312', color: 'var(--primary-light)' },
    { label: 'Pending Verification', val: '194', color: 'var(--amber)' },
    { label: 'Opted Out (Privacy)', val: '287', color: 'var(--text-muted)' },
    { label: 'Last Enrichment Run', val: '03:00 UTC', color: 'var(--text-secondary)' },
  ];
  el.innerHTML = stats.map(s => `
    <div class="enrichment-stat-item">
      <span class="enrichment-stat-label">${s.label}</span>
      <span class="enrichment-stat-val" style="color:${s.color}">${s.val}</span>
    </div>
  `).join('');
}

function showSelfReportPrompt() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">✎ Update My Career</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="socratic-prompt">
      <div class="socratic-prompt-icon">🤖</div>
      <div class="socratic-prompt-text"><strong>ConnectAI:</strong> Let me help you update your career history. What changed?</div>
    </div>
    <div class="input-group"><label class="input-label">Current Employer</label><input type="text" class="form-input" value="TechBD Solutions" /></div>
    <div class="input-group"><label class="input-label">Job Title</label><input type="text" class="form-input" value="Senior Full-Stack Engineer" /></div>
    <div class="field-grid-2">
      <div class="input-group"><label class="input-label">Start Month</label><input type="month" class="form-input" value="2023-03" /></div>
      <div class="input-group"><label class="input-label">End (leave blank = current)</label><input type="month" class="form-input" /></div>
    </div>
    <div class="input-group"><label class="input-label">Privacy Setting</label>
      <select class="form-select">
        <option>Visible to All DIC Alumni</option>
        <option>Verified Alumni Only</option>
        <option>My Chapter Only</option>
        <option>Private (Hidden)</option>
      </select>
    </div>
    <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.15);border-radius:var(--radius-sm);padding:10px;font-size:12px;color:var(--text-secondary);margin-bottom:16px">
      🔒 Opt-out: You can hide any field from AI enrichment. Your scraping opt-out preference is stored encrypted.
    </div>
    <button class="btn btn-primary btn-full" onclick="closeModal(); showToast('✅ Career updated! Profile visible to DIC alumni.')">Save Career Update</button>
  `);
}

function showSelfReportModal(name) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">✎ Confirm Career Info</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Confirming career info for <strong>${name}</strong>. Please review and update if needed.</p>
    <div class="input-group"><label class="input-label">Current Employer</label><input type="text" class="form-input" placeholder="Company name" /></div>
    <div class="input-group"><label class="input-label">Current Role</label><input type="text" class="form-input" placeholder="Job title" /></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="closeModal(); showToast('✅ Career info confirmed for ${name}')">✓ Confirm & Save</button>
      <button class="btn btn-outline" onclick="closeModal(); showToast('⏭ Skipped — will prompt again in 30 days')">Skip for Now</button>
    </div>
  `);
}

function showCareerPrivacyModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔒 Career Privacy Controls</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Control how your career data is collected and displayed. All preferences are PDPA 2026 compliant.</p>
    ${[
      { label: 'Allow AI scraping of public LinkedIn', enabled: true },
      { label: 'Allow employer verification via SSO', enabled: true },
      { label: 'Show current employer in directory', enabled: true },
      { label: 'Show employment history', enabled: false },
      { label: 'Receive self-reporting prompts', enabled: true },
      { label: 'Include in employer analytics', enabled: false },
    ].map(p => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border-glass)">
        <span style="font-size:13px">${p.label}</span>
        <div class="toggle-switch ${p.enabled ? 'active' : ''}" onclick="this.classList.toggle('active')"><div class="toggle-thumb"></div></div>
      </div>
    `).join('')}
    <button class="btn btn-primary btn-full" style="margin-top:16px" onclick="closeModal(); showToast('✅ Privacy preferences saved')">Save Privacy Settings</button>
  `);
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
        <div class="card-badge teal">${b.delivered_count}/${b.recipients_count} delivered</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${(b.channels || []).join(' · ')}</div>
      </div>
    </div>`).join('');
}

// ─── REQ-18: DEVELOPER API & WEBHOOKS PAGE ───────────────────
const MOCK_API_APPS = [
  { icon: '🏫', name: 'DIC SIS Integration', clientId: 'cl_dic_sis_a4f2b9c3', scopes: ['alumni:read', 'events:read', 'verify:write'], lastUsed: '2026-07-30', status: 'active' },
  { icon: '📊', name: 'ERP Connector — Finance', clientId: 'cl_erp_fin_b7d8e2a1', scopes: ['donations:read', 'ledger:read'], lastUsed: '2026-07-29', status: 'active' },
  { icon: '🤖', name: 'AI Partner API', clientId: 'cl_ai_ptn_c9f4d7b5', scopes: ['directory:read', 'mentorship:read'], lastUsed: '2026-07-25', status: 'active' },
];

const MOCK_WEBHOOKS = [
  { url: 'https://sis.dic.edu.bd/webhooks/alumni', events: ['alumni.verified', 'alumni.updated'], status: 'active', deliveries: 1847 },
  { url: 'https://erp.dic.edu.bd/api/donations', events: ['donation.completed', 'donation.failed'], status: 'active', deliveries: 342 },
  { url: 'https://analytics.dic.edu.bd/events', events: ['event.registered', 'event.checkin'], status: 'active', deliveries: 2103 },
];

const MOCK_API_LOG = [
  { method: 'get', path: '/api/v1/alumni?batch=2020', status: '200', client: 'DIC SIS', time: '47ms', ts: '14:32' },
  { method: 'post', path: '/api/v1/webhooks/events', status: '200', client: 'ERP', time: '89ms', ts: '14:31' },
  { method: 'get', path: '/api/v1/donations/campaigns', status: '200', client: 'ERP', time: '52ms', ts: '14:30' },
  { method: 'get', path: '/api/v1/alumni/847/profile', status: '403', client: 'AI Partner', time: '12ms', ts: '14:29' },
  { method: 'post', path: '/api/v1/verify', status: '201', client: 'DIC SIS', time: '134ms', ts: '14:28' },
  { method: 'del', path: '/api/v1/webhooks/wh_012', status: '204', client: 'ERP', time: '23ms', ts: '14:25' },
];

const MOCK_API_ENDPOINTS = [
  { method: 'GET', path: '/api/v1/alumni', desc: 'List verified alumni (paginated)' },
  { method: 'GET', path: '/api/v1/alumni/:id', desc: 'Get single alumni profile' },
  { method: 'POST', path: '/api/v1/verify', desc: 'Verify alumni status' },
  { method: 'GET', path: '/api/v1/donations', desc: 'List campaigns & transactions' },
  { method: 'POST', path: '/api/v1/donations/initiate', desc: 'Initiate MFS payment' },
  { method: 'GET', path: '/api/v1/events', desc: 'List events & registrations' },
  { method: 'POST', path: '/api/v1/events/checkin', desc: 'QR check-in via API' },
  { method: 'GET', path: '/api/v1/mentorship', desc: 'List mentorship pairs' },
  { method: 'GET', path: '/api/v1/chapters', desc: 'List chapters & members' },
  { method: 'POST', path: '/api/v1/webhooks', desc: 'Register webhook endpoint' },
];

const MOCK_SIS_INTEGRATIONS = [
  { icon: '🏫', name: 'DIC Student Information System', type: 'SIS · REST API', status: 'connected' },
  { icon: '📊', name: 'Oracle ERP — Finance Module', type: 'ERP · SOAP/REST Bridge', status: 'connected' },
  { icon: '🎓', name: 'National University BD Registry', type: 'Gov Registry · Batch Sync', status: 'pending' },
  { icon: '📋', name: 'BUET Alumni DB', type: 'Cross-Institution · Federated', status: 'connected' },
];

function renderAPIPage() {
  renderAPIApps();
  renderWebhooks();
  renderAPILog();
  renderAPIEndpoints();
  renderSISIntegrations();
}

function renderAPIApps() {
  const el = document.getElementById('api-apps-list');
  if (!el) return;
  el.innerHTML = MOCK_API_APPS.map(a => `
    <div class="api-app-card">
      <div class="api-app-icon">${a.icon}</div>
      <div class="api-app-info">
        <div class="api-app-name">${a.name}</div>
        <div class="api-app-client">${a.clientId}</div>
        <div class="api-app-scopes">${a.scopes.map(s => `<span class="scope-tag">${s}</span>`).join('')}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Last used: ${a.lastUsed}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
        <span class="card-badge teal">Active</span>
        <button class="api-key-btn" onclick="showToast('🔑 API key revealed (expires in 30s)')">Show Key</button>
        <button class="api-key-btn" onclick="showToast('🔄 API key rotated successfully')">Rotate</button>
        <button class="api-key-btn" style="color:var(--red)" onclick="showToast('🗑 App revoked')">Revoke</button>
      </div>
    </div>
  `).join('');
}

function renderWebhooks() {
  const el = document.getElementById('webhook-list');
  if (!el) return;
  el.innerHTML = MOCK_WEBHOOKS.map(w => `
    <div class="webhook-item">
      <div style="flex:1">
        <div class="webhook-url">${w.url}</div>
        <div class="webhook-events">${w.events.map(e => `<span class="webhook-event-tag">${e}</span>`).join('')}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${w.deliveries.toLocaleString()} deliveries</div>
      </div>
      <span class="webhook-status ${w.status}">${w.status === 'active' ? '● Active' : '○ Inactive'}</span>
      <button class="api-key-btn" onclick="showToast('🗑 Webhook deleted')">Delete</button>
    </div>
  `).join('');
}

function renderAPILog() {
  const el = document.getElementById('api-request-log');
  if (!el) return;
  const statusOk = s => ['200','201','204'].includes(s);
  el.innerHTML = MOCK_API_LOG.map(l => `
    <div class="api-log-item">
      <span class="api-method ${l.method}">${l.method.toUpperCase()}</span>
      <span class="api-log-path">${l.path}</span>
      <span class="api-log-status ${statusOk(l.status) ? 'ok' : 'err'}">${l.status}</span>
      <span style="color:var(--text-muted);font-size:11px">${l.client}</span>
      <span style="color:var(--teal);font-size:11px">${l.time}</span>
      <span class="api-log-time">${l.ts}</span>
    </div>
  `).join('');
}

function renderAPIEndpoints() {
  const el = document.getElementById('api-endpoint-list');
  if (!el) return;
  const colors = { GET: 'var(--green)', POST: 'var(--primary-light)', DEL: 'var(--red)' };
  el.innerHTML = MOCK_API_ENDPOINTS.map(e => `
    <div class="api-endpoint-item" onclick="showToast('📄 Opening docs for ${e.path}')">
      <div class="api-endpoint-method" style="color:${colors[e.method] || 'var(--text-muted)'}">${e.method}</div>
      <div class="api-endpoint-path">${e.path}</div>
      <div class="api-endpoint-desc">${e.desc}</div>
    </div>
  `).join('');
}

function renderSISIntegrations() {
  const el = document.getElementById('sis-integrations');
  if (!el) return;
  el.innerHTML = MOCK_SIS_INTEGRATIONS.map(s => `
    <div class="sis-integration-item">
      <div class="sis-integration-icon">${s.icon}</div>
      <div class="sis-integration-info">
        <div class="sis-integration-name">${s.name}</div>
        <div class="sis-integration-type">${s.type}</div>
      </div>
      <div class="sis-status-dot ${s.status}" title="${s.status}"></div>
    </div>
  `).join('');
}

function showApiDocs() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">📄 OpenAPI Documentation</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:16px;font-family:monospace;font-size:12px;color:var(--text-secondary);margin-bottom:16px">
openapi: 3.0.3
info:
  title: AlumniConnect API
  version: 1.0.0
  contact: api@alumnai.io
servers:
  - url: https://dic.alumnai.io/api/v1
security:
  - OAuth2: [alumni:read]
paths:
  /alumni:
    get:
      summary: List verified alumni
      parameters: [batch, domain, location]
  /donations:
    get:
      summary: List campaigns
  /verify:
    post:
      summary: Verify alumni status
    </div>
    <button class="btn btn-outline btn-full" onclick="showToast('📄 Full OpenAPI spec downloading as YAML…')">⬇ Download Full Spec</button>
  `);
}

function showCreateApiApp() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">+ New OAuth2 Application</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="input-group"><label class="input-label">Application Name</label><input type="text" class="form-input" placeholder="e.g., SIS Integration v2" /></div>
    <div class="input-group"><label class="input-label">Callback URLs</label><input type="text" class="form-input" placeholder="https://sis.dic.edu.bd/callback" /></div>
    <div class="modal-section">
      <div class="modal-section-title">OAuth2 Scopes</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['alumni:read','alumni:write','events:read','donations:read','verify:write','mentorship:read'].map(s => `<button class="chip">${s}</button>`).join('')}
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="closeModal(); showToast('✅ API application created! Client ID and Secret generated.')">Create Application</button>
  `);
}

function showAddWebhookModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">+ Add Webhook Endpoint</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="input-group"><label class="input-label">Endpoint URL</label><input type="url" class="form-input" placeholder="https://your-server.com/webhook" /></div>
    <div class="input-group"><label class="input-label">Secret (HMAC-SHA256)</label><input type="text" class="form-input" value="whsec_${Math.random().toString(36).substr(2,24)}" /></div>
    <div class="modal-section">
      <div class="modal-section-title">Events to Subscribe</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['alumni.verified','alumni.updated','donation.completed','event.registered','event.checkin','mentorship.accepted'].map(e => `<button class="chip">${e}</button>`).join('')}
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="closeModal(); showToast('✅ Webhook registered! Sending test payload…')">Register Endpoint</button>
  `);
}

// ─── REQ-01: TENANT BRANDING EDITOR ─────────────────────────
function renderTenantListEnhanced() {
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
        <div style="font-size:18px;font-weight:800;color:var(--teal)">${t.alumni.toLocaleString()}</div>
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

