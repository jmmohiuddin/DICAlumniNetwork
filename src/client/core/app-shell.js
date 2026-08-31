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
    <div class="profile-completeness-banner glass-card">
      <div class="pc-left">
        <div class="pc-title">DIC Profile Completeness</div>
        <div class="pc-track"><div class="pc-fill" style="width:85%"></div></div>
        <div class="pc-sub">85% complete — Gold Tier Alumni Status</div>
      </div>
      <div class="pc-score-ring">
        <div class="pc-ring-val" style="color:var(--teal)">85%</div>
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
      <span class="card-badge teal">14 Pending Reviews</span>
    </div>

    <div class="sync-overview-grid mb-16">
      <div class="sync-stat-card"><div class="sync-stat-val">14</div><div class="sync-stat-label">Pending Profiles</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--amber)">3</div><div class="sync-stat-label">Reported Posts</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--teal)">99.4%</div><div class="sync-stat-label">Safety Index</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--primary-light)">&lt;5 min</div><div class="sync-stat-label">Avg Review Time</div></div>
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
          <div style="font-size:12px;color:var(--text-secondary)">
            <div style="padding:10px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:6px;margin-bottom:8px">
              <div style="font-weight:700;color:var(--amber)">Reported Discussion Post #482</div>
              <div style="margin:4px 0;color:var(--text-muted)">"Promotional spam link posted in CSE forum"</div>
              <div style="display:flex;gap:6px;margin-top:6px">
                <button class="btn btn-sm btn-danger" onclick="showToast('🗑 Post removed from feed')">Take Down</button>
                <button class="btn btn-sm btn-outline" onclick="showToast('✓ Report dismissed')">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  renderVerificationQueue();
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

    <div class="sync-overview-grid">
      <div class="sync-stat-card"><div class="sync-stat-val">6,210</div><div class="sync-stat-label">CSE Alumni</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--teal)">94.2%</div><div class="sync-stat-label">Employment Rate</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--amber)">18</div><div class="sync-stat-label">Active Events</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--primary-light)">42</div><div class="sync-stat-label">Pending Students</div></div>
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

    <div class="kpi-grid">
      <div class="kpi-card indigo">
        <div class="kpi-icon">👥</div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-alumni">38,420</div>
          <div class="kpi-label">Total DIC Verified Alumni</div>
          <div class="kpi-trend up">↑ 9.2% this quarter</div>
        </div>
      </div>
      <div class="kpi-card teal">
        <div class="kpi-icon">৳</div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-funds">৳45.2L</div>
          <div class="kpi-label">Funds Collected</div>
          <div class="kpi-trend up">↑ 14.8% YoY</div>
        </div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-icon">🤝</div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-mentors">3,800</div>
          <div class="kpi-label">Mentorship Connections</div>
          <div class="kpi-trend up">↑ 83% completion</div>
        </div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-icon">🎫</div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-events">89%</div>
          <div class="kpi-label">Graduate Placement</div>
          <div class="kpi-trend up">High placement</div>
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
      <span class="card-badge teal">System Health: 100% Operational</span>
    </div>

    <!-- SERVER HEALTH MONITORS -->
    <div class="server-health-grid">
      <div class="server-card"><div class="server-val">18%</div><div class="server-label">CPU Load (AWS EKS)</div></div>
      <div class="server-card"><div class="server-val" style="color:var(--teal)">4.2 / 16 GB</div><div class="server-label">RAM Usage</div></div>
      <div class="server-card"><div class="server-val" style="color:var(--amber)">12 ms</div><div class="server-label">API Latency</div></div>
      <div class="server-card"><div class="server-val" style="color:var(--primary-light)">42 / 100</div><div class="server-label">DB Connection Pool</div></div>
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
          <div class="card-header"><h3 class="card-title">⚙ Platform Feature Flags</h3></div>
          <div style="display:flex;flex-direction:column;gap:10px;font-size:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg-glass);border-radius:6px">
              <span>OAuth2 Developer Gateway</span>
              <span class="card-badge teal">Active</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg-glass);border-radius:6px">
              <span>bKash/Nagad MFS Payment Rails</span>
              <span class="card-badge teal">Active</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg-glass);border-radius:6px">
              <span>Vector Similarity Search</span>
              <span class="card-badge teal">Active</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:var(--bg-glass);border-radius:6px">
              <span>AES-256 Field Vault</span>
              <span class="card-badge teal">Encrypted</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  renderAuditLog();
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
  if (page === 'donations') renderCampaignsEnhanced();
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

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ─── KPI ANIMATIONS ─────────────────────────────────────────
function animateKPIs() {
  // Alumni counter
  animateCounter('kpi-alumni', 0, 12847, 1200, v => v.toLocaleString());
  // Funds counter
  animateCounter('kpi-funds', 0, 24.7, 1400, v => '৳' + v.toFixed(1) + 'L');
  // Mentors counter
  animateCounter('kpi-mentors', 0, 1203, 1000, v => Math.floor(v).toLocaleString());
  // Events counter
  animateCounter('kpi-events', 0, 47, 800, v => Math.floor(v));
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

