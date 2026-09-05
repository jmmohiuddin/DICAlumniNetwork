/*
 * app-shell.js — extracted verbatim from the original app.js, lines 365-781.
 *
 * App initialization, role-based dashboard renderers (alumni/moderator/dept
 * admin/college admin/super admin), page navigation (showPage/toggleSidebar),
 * and KPI counter animations.
 */

// ─── APP INITIALIZATION & ROLE-BASED DASHBOARDS ──────────────
function initApp() {
  initAppTheme();
  updateUserUI();
  renderSidebarNav(state.currentUser.role);
  refreshNavBadges();
  renderDashboard();

  // Initialize background data
  renderAlumniGrid();
  renderMentorships();
  renderCampaignsEnhanced();
  if (typeof startCampaignTicker === 'function') startCampaignTicker();
  renderEvents();
  renderJobsEnhanced();
  renderChapters();
  renderNewsFeed();
  renderMapClusters();
  renderCareerTimeline();
  if (typeof renderRBACTableV2 === 'function') renderRBACTableV2(); else renderRBACTable();
  renderAuditLog();
  renderComplianceGrid();
  if (typeof renderTenantListEnhanced === 'function') renderTenantListEnhanced(); else renderTenantList();
  renderNotifications();
  renderSpotlightAlumni();
  renderInternshipDrives();
  renderAnalyticsMetrics();
  generateGeoHeatmap();
}

function renderDashboard() {
  const page = document.getElementById('page-dashboard');
  if (!page) return;

  const role = state.currentUser.role;

  if (role === 'alumni') {
    renderAlumniDashboard(page);
  } else if (role === 'moderator') {
    renderModeratorDashboard(page);
  } else if (role === 'dept_admin') {
    renderDeptAdminDashboard(page);
  } else if (role === 'univ_admin') {
    renderUnivAdminDashboard(page);
  } else {
    renderSuperAdminDashboard(page);
  }
}

// 🎓 1. ALUMNI DASHBOARD
function renderAlumniDashboard(page) {
  const u = state.currentUser;
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Welcome back, ${u.name}! 👋</h1>
        <p class="page-subtitle">Daffodil International College · ${u.dept}</p>
      </div>
      <button class="btn btn-primary" onclick="showPage('profile')">◎ View Digital ID</button>
    </div>

    <!-- PROFILE COMPLETENESS -->
    <!-- The bar was hardcoded to 85% and labelled "Gold Tier Alumni Status"
         for every user regardless of what their profile actually contained,
         and there is no tier system on this platform. It is now computed from
         the signed-in user's own profile by renderProfileCompleteness(). -->
    <div class="profile-completeness-banner glass-card">
      <div class="pc-left">
        <div class="pc-title">DIC Profile Completeness</div>
        <div class="pc-track"><div class="pc-fill" id="pc-fill" style="width:0%"></div></div>
        <div class="pc-sub" id="pc-sub">Checking your profile…</div>
      </div>
      <div class="pc-score-ring">
        <div class="pc-ring-val" id="pc-ring-val" style="color:var(--teal)">—</div>
      </div>
    </div>

    <div class="dashboard-split">
      <div class="dashboard-left">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">🤝 Recommended DIC Alumni Connections</h3></div>
          <div id="dash-alumni-grid" class="alumni-grid"></div>
        </div>
        <div class="glass-card mt-16">
          <div class="card-header"><h3 class="card-title">📅 Upcoming DIC Events</h3></div>
          <div id="dash-events-grid" class="events-grid"></div>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">🏆 Top Donors Leaderboard</h3><span class="card-badge amber">FY 2026</span></div>
          <div id="donor-leaderboard"></div>
        </div>
        <div class="glass-card mt-16">
          <div class="card-header"><h3 class="card-title">🗳 DIC Live Poll</h3></div>
          <div id="dash-active-poll"></div>
        </div>
      </div>
    </div>
  `;
  renderAlumniGrid();
  renderEvents();
  renderDonorLeaderboard();
  renderActivePoll();
  renderProfileCompleteness();
}

// 🛡 2. MODERATOR DASHBOARD
function renderModeratorDashboard(page) {
  const u = state.currentUser;
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">🛡 Community Moderation Center</h1>
        <p class="page-subtitle">DIC Community Safety &amp; Approvals Control Panel</p>
      </div>
      <span class="card-badge teal" id="mod-pending-badge" hidden></span>
    </div>

    <!-- These four tiles read "14 Pending Profiles", "3 Reported Posts",
         "99.4% Safety Index" and "<5 min Avg Review Time". Nothing in the
         schema records a safety index or a review duration, and the first two
         counts were invented. Only the queues that genuinely exist are shown,
         filled by renderModerationStats(). -->
    <div class="sync-overview-grid mb-16" id="mod-stat-grid">
      <div class="sync-stat-card"><div class="sync-stat-val" id="mod-stat-profiles">—</div><div class="sync-stat-label">Accounts Awaiting Review</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--amber)" id="mod-stat-stories">—</div><div class="sync-stat-label">Stories Awaiting Approval</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--teal)" id="mod-stat-chapters">—</div><div class="sync-stat-label">Chapters Awaiting Approval</div></div>
    </div>

    <div class="dashboard-split">
      <div class="dashboard-left">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">🔍 Pending Alumni Verification Queue</h3></div>
          <div id="verification-queue"></div>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">⚠️ Flagged Content Queue</h3></div>
          <!-- This card used to display a single invented report — "Reported
               Discussion Post #482 · Promotional spam link posted in CSE
               forum" — whose Take Down and Dismiss buttons only fired a toast.
               There is no content-reporting feature on this platform: no
               reports table, no report action anywhere in the UI. Saying so is
               more useful to a moderator than a fake case to action. -->
          <div class="queue-empty">
            Content reporting is not implemented. Story and chapter submissions
            are reviewed from the moderation queue.
          </div>
        </div>
      </div>
    </div>
  `;
  renderVerificationQueue();
  renderModerationStats();
}

// 🏢 3. DEPARTMENT ADMIN DASHBOARD
function renderDeptAdminDashboard(page) {
  const u = state.currentUser;
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">🏢 Department Admin Center</h1>
        <p class="page-subtitle">Daffodil International College · ${u.dept}</p>
      </div>
      <select class="form-select sm" style="width:auto" onchange="showToast('Filtering for department: ' + this.value)">
        <option>Computer Science &amp; Eng (CSE)</option>
        <option>Software Engineering (SWE)</option>
        <option>Business Administration (BBA)</option>
        <option>Electrical &amp; Electronic (EEE)</option>
      </select>
    </div>

    <!-- Was "6,210 CSE Alumni", "94.2% Employment Rate", "18 Active Events",
         "42 Pending Students" — all literals. Employment rate is dropped
         entirely: the schema records a current employer, never a denominator of
         who is seeking work, so no honest rate can be computed from it. -->
    <div class="sync-overview-grid" id="dept-stat-grid">
      <div class="sync-stat-card"><div class="sync-stat-val" id="dept-stat-alumni">—</div><div class="sync-stat-label">Verified Alumni</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--amber)" id="dept-stat-events">—</div><div class="sync-stat-label">Upcoming Events</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--primary-light)" id="dept-stat-pending">—</div><div class="sync-stat-label">Accounts Awaiting Review</div></div>
    </div>

    <div class="dashboard-split">
      <div class="dashboard-left">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">📈 CSE Alumni Placement Funnel</h3></div>
          <canvas id="dashboard-chart" height="180"></canvas>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">📋 CSE Verification Queue</h3></div>
          <div id="verification-queue"></div>
        </div>
      </div>
    </div>
  `;
  renderVerificationQueue();
  renderDeptAdminStats();
  setTimeout(initDashboardChart, 100);
}

// 🏛 4. COLLEGE ADMIN DASHBOARD
function renderUnivAdminDashboard(page) {
  const u = state.currentUser;
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">🏛 DIC Executive Command Center</h1>
        <p class="page-subtitle">Daffodil International College · FY 2026 Q3 Overview</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="showBroadcastModal()">📢 College Broadcast</button>
      </div>
    </div>

    <!-- Values are filled by animateKPIs() from GET /api/stats/platform. The
         placeholder is a dash, not a number, so a failed fetch can never be
         mistaken for real data. No trend/growth line is shown on any tile: no
         table records a historical snapshot, so a percentage here would be
         invented — the same reason the analytics module omits them. -->
    <div class="kpi-grid">
      <div class="kpi-card indigo">
        <div class="kpi-icon">👥</div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-alumni">—</div>
          <div class="kpi-label">Total DIC Verified Alumni</div>
        </div>
      </div>
      <div class="kpi-card teal">
        <div class="kpi-icon">৳</div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-funds">—</div>
          <div class="kpi-label">Funds Collected (settled)</div>
        </div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-icon">🤝</div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-mentors">—</div>
          <div class="kpi-label">Mentorship Connections</div>
        </div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-icon">🎫</div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-events">—</div>
          <div class="kpi-label">Upcoming Events</div>
        </div>
      </div>
    </div>

    <div class="dashboard-split mt-16">
      <div class="dashboard-left">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">📈 DIC 12-Month Alumni Engagement Trends</h3></div>
          <canvas id="dashboard-chart" height="180"></canvas>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">🏆 Top Benefactors</h3></div>
          <div id="donor-leaderboard"></div>
        </div>
      </div>
    </div>
  `;
  renderDonorLeaderboard();
  setTimeout(initDashboardChart, 100);
}

// 👑 5. SUPER ADMIN DASHBOARD
function renderSuperAdminDashboard(page) {
  const u = state.currentUser;
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">👑 DIC Super Admin Control Panel</h1>
        <p class="page-subtitle">Full Platform Infrastructure · Security · Server Health · Integrations</p>
      </div>
      <span class="card-badge teal" id="system-health-badge">Checking…</span>
    </div>

    <!-- SERVER HEALTH MONITORS
         Every tile here used to be a literal: "CPU Load (AWS EKS) 18%",
         "4.2 / 16 GB", "12 ms", "42 / 100". This deployment does not run on
         EKS and measured none of them. They are now filled by
         renderSystemHealth() from GET /api/stats/system, which reports only
         what the process can actually observe. There is no CPU tile, because
         Node cannot portably read container CPU load and a plausible-looking
         percentage is exactly what was wrong here before. -->
    <div class="server-health-grid" id="server-health-grid">
      <div class="server-card"><div class="server-val">—</div><div class="server-label">Uptime</div></div>
      <div class="server-card"><div class="server-val">—</div><div class="server-label">Memory (RSS)</div></div>
      <div class="server-card"><div class="server-val">—</div><div class="server-label">DB Round Trip</div></div>
      <div class="server-card"><div class="server-val">—</div><div class="server-label">DB Pool In Use</div></div>
    </div>

    <div class="dashboard-split">
      <div class="dashboard-left">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">📜 Immutable System Security Audit Trail</h3><button class="btn btn-outline btn-sm" onclick="showPage('admin')">View Full Audit Log →</button></div>
          <div id="audit-log"></div>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">⚙ Platform Capabilities</h3></div>
          <!-- This panel used to report "OAuth2 Developer Gateway: Active",
               "bKash/Nagad MFS Payment Rails: Active" and "Vector Similarity
               Search: Active". None of the three exists in this codebase. The
               list is now served by GET /api/stats/capabilities, which derives
               each state from configuration or from the absence of the code
               path, and says so in plain language. -->
          <div id="capability-list" class="capability-list"></div>
        </div>
      </div>
    </div>
  `;
  renderAuditLog();
  renderSystemHealth();
  renderCapabilities();
}

/* Moderator dashboard counts. Only queues that actually exist. */
async function renderModerationStats() {
  const s = await API.getPlatformStats();
  if (apiFailed(s)) return;

  const put = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  put('mod-stat-profiles', s.pendingVerifications);
  put('mod-stat-stories', s.pendingStories);
  put('mod-stat-chapters', s.pendingChapters);

  const badge = document.getElementById('mod-pending-badge');
  if (badge) {
    const total = s.pendingVerifications + s.pendingStories + s.pendingChapters;
    badge.textContent = total === 1 ? '1 item pending review' : `${total} items pending review`;
    badge.hidden = false;
  }
}

/* Department admin dashboard counts.
 *
 * These are platform-wide, not department-scoped: /api/stats/platform does not
 * take a department filter, and reporting a whole-platform number under a
 * department heading would be its own quiet lie. The labels say "Verified
 * Alumni", not "CSE Alumni", so the figure matches its caption. Scoping these
 * per department is real work — it needs the department filter pushed into the
 * stats query — and is left as such rather than faked. */
async function renderDeptAdminStats() {
  const s = await API.getPlatformStats();
  if (apiFailed(s)) return;

  const put = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  put('dept-stat-alumni', s.verifiedAlumni.toLocaleString());
  put('dept-stat-events', s.upcomingEvents);
  put('dept-stat-pending', s.pendingVerifications);
}

/* Profile completeness, computed from the signed-in user's own profile.
 *
 * The ten fields below are the ones a directory search and a mentorship match
 * actually read, so "complete" means "useful to other people", not "every
 * column populated". */
async function renderProfileCompleteness() {
  const fill = document.getElementById('pc-fill');
  const sub = document.getElementById('pc-sub');
  const ring = document.getElementById('pc-ring-val');
  if (!fill && !sub && !ring) return;

  const p = await API.getMyProfile();
  if (apiFailed(p)) {
    if (sub) sub.textContent = 'Could not load your profile.';
    return;
  }

  const profile = p.profile || p;
  const fields = ['batch', 'department', 'current_company', 'job_title', 'city',
                  'bio', 'skills', 'mobile_number', 'degree', 'photo_url'];
  const filled = fields.filter(f => {
    const v = profile[f];
    return Array.isArray(v) ? v.length > 0 : (v !== null && v !== undefined && String(v).trim() !== '');
  });
  const pct = Math.round((filled.length / fields.length) * 100);
  const missing = fields.length - filled.length;

  if (fill) fill.style.width = pct + '%';
  if (ring) ring.textContent = pct + '%';
  if (sub) {
    // Naming what is missing is the only part of this that helps someone act.
    sub.textContent = missing === 0
      ? 'Your profile is complete.'
      : `${pct}% complete — ${missing} field${missing === 1 ? '' : 's'} left to add`;
  }
}

/** Fills the Super Admin health tiles from measured runtime values. */
async function renderSystemHealth() {
  const grid = document.getElementById('server-health-grid');
  const badge = document.getElementById('system-health-badge');
  if (!grid) return;

  const s = await API.getSystemStats();
  if (apiFailed(s)) {
    if (badge) { badge.textContent = 'Status unavailable'; badge.className = 'card-badge amber'; }
    return;
  }

  const hrs = Math.floor(s.uptimeSeconds / 3600);
  const mins = Math.floor((s.uptimeSeconds % 3600) / 60);
  const uptime = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  const rssMb = Math.round(s.memory.rssBytes / 1048576);
  const pool = s.database.pool;

  const tile = (value, label, colorVar) =>
    `<div class="server-card"><div class="server-val"${colorVar ? ` style="color:var(${colorVar})"` : ''}>${escapeHtml(value)}</div><div class="server-label">${escapeHtml(label)}</div></div>`;

  grid.innerHTML = [
    tile(uptime, 'Process Uptime'),
    tile(`${rssMb} MB`, 'Memory (RSS)', '--teal'),
    tile(s.database.latencyMs === null ? 'unreachable' : `${s.database.latencyMs} ms`, 'DB Round Trip', '--amber'),
    tile(pool ? `${pool.total - pool.idle} / ${pool.max ?? '?'}` : 'n/a', 'DB Pool In Use', '--primary-light'),
  ].join('');

  if (badge) {
    const healthy = s.database.reachable;
    badge.textContent = healthy ? `Database connected · Node ${s.nodeVersion}` : 'Database unreachable';
    badge.className = healthy ? 'card-badge teal' : 'card-badge red';
  }
}

/** Renders the honest capability list, enabled and disabled alike. */
async function renderCapabilities() {
  const host = document.getElementById('capability-list');
  if (!host) return;

  const caps = await API.getCapabilities();
  if (apiFailed(caps) || !Array.isArray(caps)) {
    host.innerHTML = '<div class="capability-row"><span>Capability status unavailable</span></div>';
    return;
  }

  host.innerHTML = caps.map(c => `
    <div class="capability-row">
      <div class="capability-text">
        <span class="capability-label">${escapeHtml(c.label)}</span>
        <span class="capability-detail">${escapeHtml(c.detail)}</span>
      </div>
      <span class="card-badge ${c.enabled ? 'teal' : 'muted'}">${c.enabled ? 'Active' : 'Not enabled'}</span>
    </div>
  `).join('');
}

// ─── NAVIGATION ─────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.getElementById('nav-' + page);
  if (navItem) navItem.classList.add('active');

  document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
  const bnavItem = document.getElementById('bnav-' + page);
  if (bnavItem) bnavItem.classList.add('active');

  // Navigating from the drawer has to dismiss it. Otherwise the new page
  // renders behind a drawer that is still covering it, which reads as a
  // dead tap.
  if (typeof closeSidebar === 'function') closeSidebar();

  state.currentPage = page;

  // Close sidebar on mobile
  if (window.innerWidth < 900) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }

  // Page specific renders on navigate
  if (page === 'dashboard') renderDashboard();
  if (page === 'directory') renderAlumniGrid();
  if (page === 'mentorship') renderMentorships();
  if (page === 'donations') { renderCampaignsEnhanced(); renderGivingStats(); }
  if (page === 'events') renderEvents('upcoming');
  if (page === 'jobs') renderJobsEnhanced();
  if (page === 'career' && typeof renderCareerTracker === 'function') renderCareerTracker();
  if (page === 'apidev' && typeof renderAPIPage === 'function') renderAPIPage();
  if (page === 'chapters') renderChapters();
  if (page === 'news') {
    renderNewsFeed();
    if (typeof renderActivePoll === 'function') renderActivePoll();
    if (typeof renderTrendingTags === 'function') renderTrendingTags();
    if (typeof renderPastPolls === 'function') renderPastPolls();
    renderSpotlightAlumni();
  }
  if (page === 'map') renderMapClusters();
  if (page === 'profile') {
    if (typeof render10SectionProfile === 'function') render10SectionProfile();
    renderCareerTimeline();
    if (typeof renderEngagementScore === 'function') renderEngagementScore();
    if (typeof renderAlumniBadges === 'function') renderAlumniBadges();
    initQRCode();
  }
  if (page === 'admin') {
    if (typeof renderBulkImportPanel === 'function') renderBulkImportPanel();
    loadImportHistory(); // pulls the real audit trail, then re-renders the panel
    if (typeof renderRBACTableV2 === 'function') renderRBACTableV2(); else renderRBACTable();
    renderAuditLog();
    renderComplianceGrid();
    if (typeof renderTenantListEnhanced === 'function') renderTenantListEnhanced(); else renderTenantList();
    if (typeof renderOfflineSyncPanel === 'function') renderOfflineSyncPanel();
    if (typeof renderBroadcastHistory === 'function') renderBroadcastHistory();
    if (typeof renderNIDVaultPanel === 'function') renderNIDVaultPanel();
    if (typeof renderSegmentationPanel === 'function') renderSegmentationPanel();
  }
  if (page === 'analytics') {
    if (!state.analyticsChart) setTimeout(initAnalyticsChart, 100);
    renderAnalyticsMetrics();
    generateGeoHeatmap();
  }

  // Scroll to top
  const pagesContainer = document.getElementById('pages');
  if (pagesContainer) pagesContainer.scrollTop = 0;
}

/* The mobile drawer has three pieces of state that have to move together: the
 * panel itself, the scrim behind it, and a scroll lock on the body. Toggling
 * only the panel (which is all this used to do) left the page behind it
 * scrollable, so the drawer slid over content that kept moving under the
 * user's thumb. */
function setSidebarOpen(open) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;

  // Both class names are kept: `open` is what the rest of the codebase already
  // toggles, `is-open` is what the stylesheet's drawer rules were written
  // against. Setting both means neither caller has to know about the other.
  sidebar.classList.toggle('open', open);
  sidebar.classList.toggle('is-open', open);
  if (overlay) {
    overlay.classList.toggle('is-open', open);
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  document.body.classList.toggle('nav-open', open);
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  setSidebarOpen(!(sidebar && sidebar.classList.contains('open')));
}

function closeSidebar() {
  setSidebarOpen(false);
}

// Escape closes the drawer. Keyboard users otherwise had no way out of it —
// the scrim is a click target, not a focusable one.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('nav-open')) closeSidebar();
});

// ─── KPI ANIMATIONS ─────────────────────────────────────────
/* These four counters used to animate to hardcoded literals — 12,847 alumni,
 * ৳24.7L raised, 1,203 mentorships, 47 events — none of which was read from
 * anywhere. They now animate to live aggregates from GET /api/stats/platform.
 *
 * On failure the tiles show "—" rather than a placeholder number. A wrong
 * number on an executive dashboard is worse than a visibly absent one: the
 * whole point of removing the literals was that nobody could tell they were
 * invented just by looking at them. */
async function animateKPIs() {
  const unavailable = () => ['kpi-alumni', 'kpi-funds', 'kpi-mentors', 'kpi-events']
    .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });

  // apiRequest() resolves with an { error } envelope rather than throwing.
  const s = await API.getPlatformStats();
  if (apiFailed(s) || typeof s.verifiedAlumni !== 'number') { unavailable(); return; }

  animateCounter('kpi-alumni', 0, s.verifiedAlumni, 1200, v => Math.round(v).toLocaleString());
  // Taka is shown in lakh (L) once it passes 100,000, which is how the figure
  // is read locally; below that the exact amount is more useful than "0.4L".
  animateCounter('kpi-funds', 0, s.fundsRaised, 1400, v =>
    s.fundsRaised >= 100000 ? '৳' + (v / 100000).toFixed(1) + 'L' : '৳' + Math.round(v).toLocaleString());
  animateCounter('kpi-mentors', 0, s.mentorshipConnections, 1000, v => Math.round(v).toLocaleString());
  animateCounter('kpi-events', 0, s.upcomingEvents, 800, v => Math.round(v));
}

function animateCounter(id, from, to, duration, formatter) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  function update(ts) {
    const elapsed = ts - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatter(from + (to - from) * ease);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

