/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE — ALUMNI PLATFORM
   Single-Institution System with 5-Level Role-Based Access Control
   ============================================================ */

'use strict';

// ─── DEMO ACCOUNTS (5 RBAC HIERARCHY LEVELS) ────────────────
const MOCK_USERS = {
  super_admin: { email: 'admin@dic.edu.bd', name: 'Super Admin', initials: 'SA', role: 'super_admin', roleLabel: 'Super Admin', dept: 'System & Security', icon: '👑' },
  univ_admin: { email: 'collegeadmin@dic.edu.bd', name: 'College Admin', initials: 'CA', role: 'univ_admin', roleLabel: 'College Admin', dept: 'DIC Administration', icon: '🏛' },
  dept_admin: { email: 'departmentadmin@dic.edu.bd', name: 'Dr. Shahabuddin', initials: 'DA', role: 'dept_admin', roleLabel: 'Dept Admin (CSE)', dept: 'CSE Department', icon: '🏢' },
  moderator: { email: 'moderator@dic.edu.bd', name: 'Content Moderator', initials: 'CM', role: 'moderator', roleLabel: 'Moderator', dept: 'DIC Community', icon: '🛡' },
  alumni: { email: 'alumni@dic.edu.bd', name: 'Mohiuddin Rahman', initials: 'MR', role: 'alumni', roleLabel: 'Alumni', dept: 'BSc CSE (2020)', icon: '🎓' }
};


const MOCK_CAMPAIGNS = [
  { id: 1, name: 'DIC Merit Scholarship Fund 2026', desc: 'Provide full tuition scholarships to 50 meritorious DIC students from underprivileged backgrounds.', tag: 'scholarship', raised: 1840000, goal: 2500000, donors: 342, days: 18, gateways: ['bkash', 'nagad', 'card'] },
  { id: 2, name: 'DIC Smart Robotics Lab Fund', desc: 'Equip the campus robotics laboratory with modern research-grade instruments and microcontrollers.', tag: 'infrastructure', raised: 680000, goal: 1200000, donors: 189, days: 31, gateways: ['bkash', 'nagad', 'rocket'] },
  { id: 3, name: 'DIC Entrepreneurship Seed Fund', desc: 'Launch a startup incubator at DIC providing seed funding and mentorship for student tech startups.', tag: 'education', raised: 920000, goal: 1500000, donors: 210, days: 45, gateways: ['bkash', 'card'] }
];




// Chapters loaded from PostgreSQL by renderChapters(). Was a hardcoded array.
let chaptersCache = [];
// The signed-in user's chapter memberships, also from PostgreSQL.
let USER_CHAPTER_MEMBERSHIPS = new Set();

const MOCK_VERIFICATION_QUEUE = [
  { name: 'Rafiq Hossain', initials: 'RH', details: 'CSE Batch 2021 · Unmatched ID' },
  { name: 'Sumaiya Zaman', initials: 'SZ', details: 'BBA Batch 2022 · Pending NID' }
];

const MOCK_TENANTS = [
  { name: 'Daffodil International College', subdomain: 'alumni.dic.edu.bd', alumni: 38420, status: 'active', plan: 'Enterprise Platform' }
];
const MOCK_CAREER_TIMELINE = [
  { company: 'Daffodil International College', role: 'DIC Alumni Board Director', period: '2024 – Present' },
  { company: 'Brain Station 23', role: 'Senior Software Engineer', period: '2022 – Present' }
];

// ─── APP STATE ──────────────────────────────────────────────
let state = {
  currentPage: 'dashboard',
  currentUser: null, // populated only by a successful /api/auth/login or /api/auth/me
  charts: {},
  searchTimeout: null,
  selectedGateway: null,
  selectedAmount: null,
  analyticsChart: null,
  connectedAlumni: {},
  // Server-side directory query state (search/filter/sort/paging).
  directory: { search: '', batch: '', domain: '', mentor: false, sort: 'name', limit: 12, offset: 0 },
};


// A few widgets appear both on their own page and on the alumni dashboard.
// Returns every live container so both stay in sync — previously the duplicate
// ids meant getElementById only ever found the dashboard copy.
function renderTargets(id) {
  return [document.getElementById(id), document.getElementById("dash-" + id)].filter(Boolean);
}

// ─── SHARED VIEW HELPERS ────────────────────────────────────
// Every value rendered from PostgreSQL passes through escapeHtml — user-authored
// story titles, chapter names and notification text all reach innerHTML.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRelativeTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

function renderSkeletonCards(count, variant = 'card') {
  return Array.from({ length: count }, () => `
    <div class="skeleton-card skeleton-${variant}" aria-hidden="true">
      <div class="skeleton-line skeleton-line-lg"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line skeleton-line-sm"></div>
    </div>
  `).join('');
}

function renderEmptyState(icon, title, subtitle = '') {
  return `
    <div class="state-panel state-empty">
      <div class="state-icon">${icon}</div>
      <div class="state-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="state-subtitle">${escapeHtml(subtitle)}</div>` : ''}
    </div>
  `;
}

// Surfaces backend failures instead of silently falling back to mock data.
function renderErrorState(message, retryFn) {
  return `
    <div class="state-panel state-error">
      <div class="state-icon">⚠️</div>
      <div class="state-title">${escapeHtml(message)}</div>
      <div class="state-subtitle">The server or database did not respond.</div>
      ${retryFn ? `<button class="btn btn-secondary state-retry" onclick="${retryFn}">↻ Retry</button>` : ''}
    </div>
  `;
}

// ─── AUTHENTICATION & DEMO LOGIN HANDLERS ───────────────────
// Every path below authenticates against PostgreSQL via /api/auth/login and
// stores a signed session token. The client no longer invents a user object.

const DEMO_PASSWORD = '12345678';

function showLoginError(message) {
  const el = document.getElementById('login-error');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('hidden', !message);
}

function setLoginBusy(busy) {
  const btn = document.getElementById('login-submit-btn');
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? 'Signing in…' : 'Sign In to DIC →';
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  showLoginError('');
  setLoginBusy(true);
  const result = await API.login(email, password);
  setLoginBusy(false);

  if (!result || result.error) {
    showLoginError(result?.error || 'Sign in failed. Please try again.');
    return;
  }
  enterAuthenticatedApp(result.user);

  // Bulk-imported accounts share an initial password until it is replaced.
  if (result.mustChangePassword) setTimeout(() => showChangePasswordModal(true), 700);
}

// Demo shortcuts still go through the real endpoint with real credentials.
async function loginAsRole(roleKey) {
  const account = MOCK_USERS[roleKey];
  if (!account) return;

  showLoginError('');
  const result = await API.login(account.email, DEMO_PASSWORD);

  if (!result || result.error) {
    showLoginError(result?.error || `Demo login for ${roleKey} failed.`);
    return;
  }
  enterAuthenticatedApp(result.user);
}

// Switching role re-authenticates as that account so the session token, and
// therefore every server-side permission check, actually changes.
async function switchCurrentRole(roleKey) {
  const account = MOCK_USERS[roleKey];
  if (!account) return;

  const result = await API.login(account.email, DEMO_PASSWORD);
  if (!result || result.error) {
    showToast('⚠ Could not switch role — please sign in again.');
    return;
  }

  state.currentUser = result.user;
  updateUserUI();
  renderSidebarNav(result.user.role);
  showToast(`🔄 Signed in as: ${result.user.roleLabel}`);
  showPage('dashboard');
}

function enterAuthenticatedApp(user) {
  state.currentUser = user;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  updateUserUI();
  renderSidebarNav(user.role);
  initApp();
  showToast(`🎉 Welcome to DIC Portal, ${user.name} (${user.roleLabel})`);
}

function showLoginScreen() {
  const mainApp = document.getElementById('main-app');
  const loginScreen = document.getElementById('login-screen');
  if (mainApp) mainApp.classList.add('hidden');
  if (loginScreen) loginScreen.classList.remove('hidden');
}

// Called by api.js when the server rejects a stored token.
function onSessionExpired() {
  API.logout();
  state.currentUser = null;
  showLoginScreen();
  showLoginError('Your session expired. Please sign in again.');
}

function updateUserUI() {
  const u = state.currentUser;
  const topbarAvatar = document.getElementById('topbar-user-avatar');
  const sidebarAvatar = document.getElementById('sidebar-user-avatar');
  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarRole = document.getElementById('sidebar-user-role');
  const topbarSelect = document.getElementById('topbar-role-select');
  const drawerSelect = document.getElementById('drawer-role-select');

  if (topbarAvatar) topbarAvatar.textContent = u.initials;
  if (sidebarAvatar) sidebarAvatar.textContent = u.initials;
  if (sidebarName) sidebarName.textContent = u.name;
  if (sidebarRole) sidebarRole.textContent = u.roleLabel;
  if (topbarSelect) topbarSelect.value = u.role;
  if (drawerSelect) drawerSelect.value = u.role;
}

// ─── DYNAMIC SIDEBAR NAV PER ROLE ───────────────────────────
function renderSidebarNav(role) {
  const container = document.getElementById('sidebar-nav-container');
  if (!container) return;

  const navItems = [
    { id: 'dashboard', icon: '⊞', label: 'Dashboard', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'directory', icon: '◉', label: 'Alumni Directory', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'mentorship', icon: '⟳', label: 'Mentorship Hub', badge: '3', roles: ['alumni', 'moderator', 'univ_admin', 'super_admin'] },
    { id: 'donations', icon: '❤', label: 'Donations & Funds', roles: ['alumni', 'univ_admin', 'super_admin'] },
    { id: 'events', icon: '◈', label: 'Events & Tickets', roles: ['alumni', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'jobs', icon: '✦', label: 'Job Board', badge: '5', badgeNew: true, roles: ['alumni', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'analytics', icon: '▦', label: 'Executive Analytics', roles: ['dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'career', icon: '📈', label: 'Career Progression', roles: ['alumni', 'super_admin'] },
    { id: 'chapters', icon: '⬡', label: 'DIC Chapters', roles: ['alumni', 'univ_admin', 'super_admin'] },
    { id: 'news', icon: '✐', label: 'DIC News Feed', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'map', icon: '⊕', label: 'Alumni Map', roles: ['alumni', 'univ_admin', 'super_admin'] },
    { id: 'profile', icon: '◎', label: 'My DIC Profile', isDivider: true, roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'admin', icon: '⚙', label: 'DIC Admin Panel', roles: ['univ_admin', 'super_admin'] },
    { id: 'apidev', icon: '⟁', label: 'Developer API', badge: 'ENT', badgeTeal: true, roles: ['super_admin'] }
  ];

  const allowed = navItems.filter(item => item.roles.includes(role));

  container.innerHTML = allowed.map(item => `
    ${item.isDivider ? '<div class="nav-divider"></div>' : ''}
    <a class="nav-item ${item.id === state.currentPage ? 'active' : ''}" onclick="showPage('${item.id}')" id="nav-${item.id}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
      ${item.badge ? `<span class="nav-badge ${item.badgeNew ? 'new' : ''}" ${item.badgeTeal ? 'style="background:var(--teal);color:var(--bg-deep)"' : ''}>${item.badge}</span>` : ''}
    </a>
  `).join('');
}

// ─── LOGIN FLOW ─────────────────────────────────────────────
function goToStep2() {
  document.getElementById('step-1').classList.add('hidden');
  document.getElementById('step-2').classList.remove('hidden');
}

function goToStep1() {
  document.getElementById('step-2').classList.add('hidden');
  document.getElementById('step-1').classList.remove('hidden');
}

function goToStep3() {
  document.getElementById('step-2').classList.add('hidden');
  document.getElementById('step-3').classList.remove('hidden');

  setTimeout(() => {
    document.querySelector('.sis-match-animation').style.display = 'none';
    document.getElementById('sis-result').style.display = 'flex';
    document.getElementById('continue-btn').classList.remove('hidden');
  }, 2000);
}

function logout() {
  // Drop the session token first — otherwise "signing out" left a valid
  // credential in localStorage that the next page load silently reused.
  API.logout();
  state.currentUser = null;
  showLoginError('');

  const mainApp = document.getElementById('main-app');
  const loginScreen = document.getElementById('login-screen');
  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const step3 = document.getElementById('step-3');
  const sisResult = document.getElementById('sis-result');
  const continueBtn = document.getElementById('continue-btn');
  const sisAnim = document.querySelector('.sis-match-animation');

  if (mainApp) mainApp.classList.add('hidden');
  if (loginScreen) loginScreen.classList.remove('hidden');
  if (step1) step1.classList.remove('hidden');
  if (step2) step2.classList.add('hidden');
  if (step3) step3.classList.add('hidden');
  if (sisResult) sisResult.style.display = 'none';
  if (continueBtn) continueBtn.classList.add('hidden');
  if (sisAnim) sisAnim.style.display = 'none';
}

function toggleAppTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('dic_theme', newTheme);
  
  applyThemeToggleLabels(newTheme);
  showToast(newTheme === 'dark' ? '🌙 Dark Mode Activated' : '☀️ Light Mode Activated');
}

// Keeps the topbar (desktop) and drawer (mobile) theme buttons in sync.
function applyThemeToggleLabels(theme) {
  const title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  const icon = theme === 'dark' ? '🌙' : '☀️';

  const topbarBtn = document.getElementById('theme-toggle-btn');
  if (topbarBtn) {
    topbarBtn.innerHTML = icon;
    topbarBtn.setAttribute('title', title);
  }
  const drawerBtn = document.getElementById('drawer-theme-btn');
  if (drawerBtn) {
    drawerBtn.innerHTML = `${icon} Theme`;
    drawerBtn.setAttribute('title', title);
  }
}

function initAppTheme() {
  const savedTheme = localStorage.getItem('dic_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  applyThemeToggleLabels(savedTheme);
}

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

// ─── CHARTS ─────────────────────────────────────────────────
const CHART_DATA = {
  engagement: {
    labels: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
    data: [1240, 1380, 1520, 1690, 1820, 2100, 2340, 2580, 2820, 3100, 3540, 4120],
    label: 'Active Alumni',
    color: '#6C63FF',
  },
  donations: {
    labels: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
    data: [84000, 102000, 98000, 145000, 312000, 187000, 203000, 241000, 289000, 334000, 412000, 487000],
    label: 'Donations (৳)',
    color: '#00D4AA',
  },
  geographic: {
    labels: ['BD', 'UK', 'USA', 'Canada', 'UAE', 'Australia', 'Singapore', 'Germany', 'India', 'Others'],
    data: [8241, 1240, 987, 542, 487, 381, 298, 187, 142, 342],
    label: 'Alumni Count',
    color: '#C084FC',
    type: 'bar',
  }
};

function initDashboardChart() {
  const ctx = document.getElementById('main-chart');
  if (!ctx || typeof Chart === 'undefined') return;

  if (state.charts.main) state.charts.main.destroy();

  const d = CHART_DATA.engagement;
  if (typeof Chart === 'undefined') return;   // CDN unavailable — skip charting
  state.charts.main = new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.labels,
      datasets: [{
        label: d.label,
        data: d.data,
        borderColor: d.color,
        backgroundColor: d.color + '18',
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: d.color,
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

function switchChart(type, btn) {
  document.querySelectorAll('.chart-tabs .chart-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  const d = CHART_DATA[type];
  if (!d || !state.charts.main) return;

  const isBar = d.type === 'bar';
  state.charts.main.data.labels = d.labels;
  state.charts.main.data.datasets[0].data = d.data;
  state.charts.main.data.datasets[0].label = d.label;
  state.charts.main.data.datasets[0].borderColor = d.color;
  state.charts.main.data.datasets[0].backgroundColor = d.color + (isBar ? '30' : '18');
  state.charts.main.data.datasets[0].pointBackgroundColor = d.color;
  state.charts.main.config.type = isBar ? 'bar' : 'line';
  state.charts.main.update();
}

function initAnalyticsChart() {
  const ctx = document.getElementById('analytics-chart');
  if (!ctx) return;
  if (state.analyticsChart) state.analyticsChart.destroy();

  if (typeof Chart === 'undefined') return;   // CDN unavailable — skip charting

  state.analyticsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      datasets: [
        {
          label: 'Active Alumni',
          data: [2100, 2340, 2580, 2820, 3100, 3540, 4120, null, null, null, null, null],
          borderColor: '#6C63FF',
          backgroundColor: '#6C63FF18',
          borderWidth: 2.5,
          fill: false,
          tension: 0.4,
          pointBackgroundColor: '#6C63FF',
          pointRadius: 4,
        },
        {
          label: 'Donations (৳000)',
          data: [187, 203, 241, 289, 334, 412, 487, null, null, null, null, null],
          borderColor: '#00D4AA',
          backgroundColor: '#00D4AA18',
          borderWidth: 2.5,
          fill: false,
          tension: 0.4,
          pointBackgroundColor: '#00D4AA',
          pointRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          // Compact swatches so the legend sits on one line at 375px instead of
          // consuming two rows of chart height.
          labels: {
            color: '#8B9CC4',
            font: { family: 'Inter', size: 12 },
            padding: window.innerWidth < 900 ? 12 : 20,
            boxWidth: window.innerWidth < 900 ? 12 : 40,
            boxHeight: window.innerWidth < 900 ? 12 : 12,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 27, 46, 0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#F1F5FF',
          bodyColor: '#8B9CC4',
          padding: 12,
          cornerRadius: 10,
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A7A', font: { size: 11, family: 'Inter' } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#4A5A7A', font: { size: 11, family: 'Inter' } } }
      }
    }
  });
}

function switchAnalytics(type, btn) {
  document.querySelectorAll('.analytics-tabs .chart-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
}

// ─── RENDER FUNCTIONS ────────────────────────────────────────
function renderVerificationQueue() {
  const container = document.getElementById('verification-queue');
  if (!container) return;
  container.innerHTML = MOCK_VERIFICATION_QUEUE.map(item => `
    <div class="queue-item">
      <div class="queue-avatar">${item.initials}</div>
      <div class="queue-info">
        <div class="queue-name">${item.name}</div>
        <div class="queue-sub">${item.details}</div>
      </div>
      <div class="queue-actions">
        <button class="approve-btn" onclick="approveAlumni('${item.name}')">✓ Approve</button>
        <button class="review-btn">Review</button>
      </div>
    </div>
  `).join('');
}

function approveAlumni(name) {
  showToast(`✅ ${name} approved successfully`);
}

// Directory is served from PostgreSQL. Search, filters, sorting and paging are
// all query parameters — the browser no longer filters a hardcoded array.
async function renderAlumniGrid({ append = false } = {}) {
  const containers = renderTargets('alumni-grid');
  if (!containers.length) return;
  const container = containers[0];

  const d = state.directory;
  const countEl = document.getElementById('dir-count');
  const loadMoreWrap = document.querySelector('.load-more-container');

  if (!append) containers.forEach(c => c.innerHTML = renderSkeletonCards(4, 'alumni'));
  if (countEl && !append) countEl.textContent = 'Loading profiles…';

  const result = await API.getAlumni({
    search: d.search, batch: d.batch, domain: d.domain,
    mentor: d.mentor, sort: d.sort, limit: d.limit, offset: d.offset
  });

  if (result === null) {
    container.innerHTML = renderErrorState('Could not load the alumni directory.', 'renderAlumniGrid()');
    if (countEl) countEl.textContent = '';
    if (loadMoreWrap) loadMoreWrap.style.display = 'none';
    return;
  }

  const { alumni, total } = result;

  if (total === 0) {
    container.innerHTML = renderEmptyState('🔍', 'No profiles match your search',
      'Try a different name, company, skill, batch year or location.');
    if (countEl) countEl.textContent = 'Showing 0 profiles';
    if (loadMoreWrap) loadMoreWrap.style.display = 'none';
    return;
  }

  const cards = alumni.map(renderAlumniCard).join('');
  containers.forEach(c => append ? c.insertAdjacentHTML('beforeend', cards) : (c.innerHTML = cards));

  const shownCount = container.querySelectorAll('.alumni-card').length;
  if (countEl) countEl.textContent = `Showing ${shownCount} of ${total} profile${total === 1 ? '' : 's'}`;
  if (loadMoreWrap) loadMoreWrap.style.display = shownCount < total ? '' : 'none';
}

function loadMoreAlumni() {
  state.directory.offset += state.directory.limit;
  renderAlumniGrid({ append: true });
}

function filterDirectory(value) {
  clearTimeout(state.searchTimeout);
  const indicator = document.getElementById('search-indicator');
  if (indicator) indicator.style.display = 'flex';
  state.searchTimeout = setTimeout(() => {
    if (indicator) indicator.style.display = 'none';
    state.directory.search = value;
    state.directory.offset = 0;
    renderAlumniGrid();
  }, 400);
}

// Chip filters map onto real query parameters instead of slicing a local array.
function toggleChip(el, filter) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');

  const d = state.directory;
  d.offset = 0;
  d.mentor = false;
  d.batch = '';
  d.domain = '';
  d.search = '';

  if (filter === 'mentor') d.mentor = true;
  else if (/^\d{4}$/.test(filter)) d.batch = filter;
  else if (['tech', 'finance', 'design', 'business'].includes(filter)) d.domain = filter;
  else if (filter !== 'all') d.search = filter; // location chips: dhaka / uk / usa

  const searchBox = document.getElementById('dir-search');
  if (searchBox) searchBox.value = d.search;

  renderAlumniGrid();
}

function connectAlumni(name, btn) {
  if (!state.connectedAlumni) state.connectedAlumni = {};
  if (state.connectedAlumni[name]) {
    showToast('ℹ️ Connection request already sent to ' + name);
    return;
  }
  state.connectedAlumni[name] = true;
  
  if (btn) {
    btn.innerHTML = '✓ Connected';
    btn.classList.add('connected');
    btn.setAttribute('disabled', 'true');
    btn.style.background = 'rgba(0,212,170,0.15)';
    btn.style.color = 'var(--teal)';
    btn.style.borderColor = 'rgba(0,212,170,0.4)';
  } else {
    document.querySelectorAll('.connect-btn').forEach(b => {
      if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(name)) {
        b.innerHTML = '✓ Connected';
        b.classList.add('connected');
        b.setAttribute('disabled', 'true');
        b.style.background = 'rgba(0,212,170,0.15)';
        b.style.color = 'var(--teal)';
        b.style.borderColor = 'rgba(0,212,170,0.4)';
      }
    });
  }
  
  showToast('🤝 Connection request sent to ' + name + '!');
}

// Single card renderer shared by the directory grid and the dashboard
// recommendations — these were two near-identical copies that had already
// drifted apart (one omitted the verified ring, the other the click target).
function renderAlumniCard(a) {
  const isConn = state.connectedAlumni && state.connectedAlumni[a.name];
  const color = a.color || '#00A859';
  const nameAttr = escapeHtml(a.name).replace(/'/g, '&#39;');
  const subtitle = [a.role, a.company].filter(Boolean).join(' · ') || 'Profile incomplete';

  return `
    <div class="alumni-card" onclick="viewAlumniProfile(${a.id})">
      <div class="alumni-card-top">
        <div class="alumni-avatar ${a.verified ? 'verified-ring' : ''}" style="background: linear-gradient(135deg, ${color}40, ${color}20);">
          <span style="color:${color}">${escapeHtml(a.initials)}</span>
          ${a.verified ? '<div class="verified-badge-icon">✓</div>' : ''}
        </div>
        <div class="alumni-card-info">
          <div class="alumni-card-name">${escapeHtml(a.name)}</div>
          <div class="alumni-card-role">${escapeHtml(subtitle)}</div>
          <div class="alumni-card-location">📍 ${escapeHtml(a.location || 'Location not set')}${a.batch ? ` · Batch ${a.batch}` : ''}</div>
        </div>
      </div>
      <div class="alumni-tags">
        ${(a.skills || []).map(s => `<span class="alumni-tag">${escapeHtml(s)}</span>`).join('')}
        ${a.mentor ? '<span class="alumni-tag mentor-tag">🤝 Mentor</span>' : ''}
      </div>
      <div class="alumni-card-actions">
        <button class="connect-btn ${isConn ? 'connected' : ''}"
                onclick="event.stopPropagation(); connectAlumni('${nameAttr}', this)"
                ${isConn ? 'disabled' : ''}>${isConn ? '✓ Connected' : '+ Connect'}</button>
        ${a.mentor ? `<button class="mentor-req-btn" onclick="event.stopPropagation(); showMentorModal('${nameAttr}', ${a.id})">🤝 Request Mentorship</button>` : ''}
      </div>
    </div>`;
}

// Previously ignored its argument entirely and just re-rendered the same order.
function sortDirectory(by) {
  state.directory.sort = by === 'relevance' ? 'name' : by;
  state.directory.offset = 0;
  renderAlumniGrid();
}

async function viewAlumniProfile(id) {
  const profile = await API.getAlumniProfile(id);

  // No silent mock substitution: if the profile cannot be fetched, say so.
  if (!profile || !profile.name) {
    showModal(`
      <div class="modal-header">
        <div class="modal-title">Profile unavailable</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      ${renderErrorState('Could not load this alumni profile.', `closeModal(); viewAlumniProfile(${parseInt(id)})`)}
    `);
    return;
  }

  // Fields the database genuinely has no value for render as an explicit
  // placeholder rather than a plausible-looking invention.
  const unset = '<span class="field-unset">Not provided</span>';
  const val = (v) => (v === null || v === undefined || v === '') ? unset : escapeHtml(v);

  const matchScore = 96; // AI Mentorship Vector Match Score (REQ-04)

  showModal(`
    <div class="onboarding-header">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="alumni-avatar verified-ring" style="width:52px;height:52px;font-size:18px;background:var(--teal)">
          <span>${profile.initials || profile.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</span>
          <div class="verified-badge-icon">✓</div>
        </div>
        <div style="flex:1">
          <div class="onboarding-title" style="font-size:18px">${profile.name}</div>
          <div class="onboarding-sub">${[profile.jobTitle, profile.company].filter(Boolean).join(" · ") || "Profile incomplete"}</div>
          <div style="font-size:11px;color:var(--teal);margin-top:2px">🎓 ${val(profile.degree)}${profile.batch ? ` (Batch ${profile.batch})` : ""} · ${val(profile.department)}</div>
        </div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;max-height:62vh;overflow-y:auto;padding-right:6px">
      <!-- AI MENTORSHIP VECTOR MATCH BADGE (REQ-04) -->
      <div style="background:linear-gradient(135deg, rgba(0,168,89,0.15), rgba(0,86,145,0.15));border:1px solid rgba(0,168,89,0.3);border-radius:var(--radius-sm);padding:10px 14px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:22px">🤖</span>
          <div>
            <div style="font-weight:700;font-size:13px;color:var(--teal)">${matchScore}% AI Mentorship Career Vector Match</div>
            <div style="font-size:11px;color:var(--text-secondary)">Evaluated against Industry (25%), Skill Gap (20%), and Campus Involvement</div>
          </div>
        </div>
        <span class="card-badge teal">${matchScore}% Match</span>
      </div>

      <!-- VERIFICATION BADGES -->
      <div class="verification-badges-grid">
        ${profile.studentId ? `<span class="verify-pill">✓ Student ID ${escapeHtml(profile.studentId)}</span>` : ""}
        ${profile.email ? `<span class="verify-pill">✓ Email Verified (${escapeHtml(profile.email)})</span>` : ""}
        <span class="verify-pill">✓ DIC Alumni Board Verified</span>
      </div>

      <!-- ABOUT BIO -->
      <div class="profile-section-card">
        <div class="profile-section-title" style="font-size:13px;font-weight:700;color:var(--teal)">📌 About &amp; Biography</div>
        <div style="font-size:13px;color:var(--text-primary);margin-top:6px">${val(profile.bio)}</div>
      </div>

      <!-- CAREER & LOCATION -->
      <div class="profile-section-card">
        <div class="profile-section-title" style="font-size:13px;font-weight:700;color:var(--teal)">💼 Professional &amp; Location Details</div>
        <div class="field-grid-2" style="margin-top:8px">
          <div><div class="field-label">Current Role &amp; Employer</div><div class="field-val">${profile.jobTitle || profile.company ? escapeHtml([profile.jobTitle, profile.company].filter(Boolean).join(" at ")) : unset}</div></div>
          <div><div class="field-label">Geographical Location</div><div class="field-val">📍 ${val(profile.location)}</div></div>
          <div><div class="field-label">Primary Email</div><div class="field-val">${val(profile.email)}</div></div>
          <div><div class="field-label">Mobile Number</div><div class="field-val">${val(profile.mobile)}</div></div>
        </div>
      </div>

      <!-- SKILLS -->
      <div class="profile-section-card">
        <div class="profile-section-title" style="font-size:13px;font-weight:700;color:var(--teal)">⚡ Core Expertise &amp; Skills</div>
        <div class="alumni-tags" style="margin-top:8px">
          ${(profile.skills && profile.skills.length) ? profile.skills.map(s => `<span class="alumni-tag">${escapeHtml(s)}</span>`).join('') : unset}
        </div>
      </div>

      <!-- PRD UTILITIES (DIGITAL PASS & DSAR EXPORT) -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" style="flex:1" onclick="showToast('🎟 Generated DIC Wallet Pass (Apple/Google PKPass)')">🎟 Download Digital Pass</button>
        <button class="btn btn-outline btn-sm" style="flex:1" onclick="exportProfileDSAR('${profile.name}')">📥 Export Data (DSAR JSON)</button>
      </div>

      <!-- ACTION BUTTONS -->
      <div class="field-grid-2" style="margin-top:10px">
        <button class="btn btn-primary btn-full" onclick="closeModal(); connectAlumni('${profile.name}')">+ Connect</button>
        <button class="btn btn-outline btn-full" onclick="closeModal(); showMentorModal('${escapeHtml(profile.name).replace(/'/g, '&#39;')}', ${profile.id})">🤝 Request Mentorship</button>
      </div>
    </div>
  `);
}



// ─── MENTORSHIP (REQ-04) ───
async function renderMentorships() {
  const list = document.getElementById('mentorship-list');
  const pending = document.getElementById('pending-requests');
  const suggested = document.getElementById('suggested-mentors');

  if (list) list.innerHTML = renderSkeletonCards(2, 'mentor');

  const [data, suggestions] = await Promise.all([API.getMentorships(), API.getMentorSuggestions()]);

  if (list) {
    if (apiFailed(data)) {
      list.innerHTML = renderErrorState(data?.error || 'Could not load mentorships.', 'renderMentorships()');
    } else {
      const active = [...data.asMentor, ...data.asMentee].filter(m => m.status === 'accepted');
      list.innerHTML = active.length ? active.map(m => {
        const isMentor = m.mentor_id === state.currentUser.id;
        const other = isMentor ? m.mentee_name : m.mentor_name;
        const initials = isMentor ? m.mentee_initials : m.mentor_initials;
        return `
        <div class="mentorship-connection">
          <div class="alumni-avatar" style="width:44px;height:44px;background:linear-gradient(135deg,rgba(108,99,255,0.3),rgba(0,212,170,0.3));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">${escapeHtml(initials || '??')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px">${escapeHtml(other)}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(m.subject)}</div>
          </div>
          <span class="mentorship-type-badge ${isMentor ? 'mentor' : 'mentee'}">${isMentor ? '🎓 Mentoring' : '📚 Learning'}</span>
          <button class="btn btn-ghost btn-sm" onclick="respondToMentorship(${m.id}, 'complete')">Complete</button>
        </div>`;
      }).join('') : renderEmptyState('🤝', 'No active mentorships', 'Accepted mentorship connections will appear here.');
    }
  }

  if (pending) {
    if (apiFailed(data)) {
      pending.innerHTML = '';
    } else if (data.incoming.length === 0) {
      pending.innerHTML = renderEmptyState('📭', 'No pending requests');
    } else {
      pending.innerHTML = data.incoming.map(r => {
        const daysLeft = Math.max(0, Math.ceil((new Date(r.expires_at) - Date.now()) / 86400000));
        return `
        <div class="pending-request">
          <div class="alumni-avatar" style="width:40px;height:40px;background:linear-gradient(135deg,rgba(255,140,66,0.3),rgba(192,132,252,0.2));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${escapeHtml(r.mentee_initials || '??')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px">${escapeHtml(r.mentee_name)}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(r.subject)}</div>
          </div>
          <span class="expiry-badge">⏱ ${daysLeft}d left</span>
          <button class="btn btn-sm btn-primary" onclick="respondToMentorship(${r.id}, 'accept')">Accept</button>
          <button class="btn btn-sm btn-ghost" onclick="respondToMentorship(${r.id}, 'decline')">Decline</button>
        </div>`;
      }).join('');
    }
  }

  if (suggested) {
    if (apiFailed(suggestions)) {
      suggested.innerHTML = renderErrorState('Could not load mentor suggestions.', 'renderMentorships()');
    } else if (suggestions.length === 0) {
      suggested.innerHTML = renderEmptyState('✨', 'No mentor matches yet');
    } else {
      suggested.innerHTML = suggestions.map(m => `
        <div class="suggested-mentor-card">
          <div class="alumni-avatar" style="width:40px;height:40px;background:linear-gradient(135deg,${m.color || '#00A859'}40,${m.color || '#00A859'}20);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${m.color || '#00A859'}">${escapeHtml(m.initials)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">${escapeHtml(m.name)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${escapeHtml([m.role, m.company].filter(Boolean).join(' · ') || 'DIC Alumni')}</div>
          </div>
          <span class="match-score-badge">${m.match_score}%</span>
          <button class="btn btn-sm btn-primary" onclick="showMentorModal('${escapeHtml(m.name).replace(/'/g, '&#39;')}', ${m.id}, ${m.match_score})">Request</button>
        </div>`).join('');
    }
  }
}



// ─── EVENTS & TICKETING (REQ-06) ───
// Reads from PostgreSQL, shows the signed-in user's ticket state, and drives
// registration / cancellation / QR check-in through the real endpoints.
async function renderEvents(filter = 'upcoming') {
  const containers = renderTargets('events-grid');
  if (!containers.length) return;
  const container = { set innerHTML(v) { containers.forEach(c => c.innerHTML = v); } };

  if (filter === 'checkin') {
    container.innerHTML = `
      <div class="glass-card" style="grid-column:1/-1;padding:28px">
        <div style="text-align:center;font-size:44px;margin-bottom:12px">📷</div>
        <div style="text-align:center;font-size:19px;font-weight:800;margin-bottom:6px">QR Check-In Scanner</div>
        <div style="text-align:center;color:var(--text-secondary);margin-bottom:20px">Scan or type an attendee ticket code to check them in.</div>
        <form onsubmit="handleCheckIn(event)" style="max-width:420px;margin:0 auto">
          <div class="input-group">
            <label class="input-label">Ticket Code</label>
            <input type="text" id="checkin-code" class="form-input" placeholder="DIC-TKT-XXXXX-XXXXXX" autocomplete="off" required />
          </div>
          <button type="submit" class="btn btn-primary btn-full">✓ Check In Attendee</button>
        </form>
        <div id="checkin-result" style="max-width:420px;margin:16px auto 0"></div>
      </div>`;
    return;
  }

  container.innerHTML = renderSkeletonCards(3, 'event');
  const events = await API.getEvents();

  if (apiFailed(events)) {
    container.innerHTML = renderErrorState(events?.error || 'Could not load events.', `renderEvents('${filter}')`);
    return;
  }

  const list = events.filter(e => filter === 'past' ? e.status === 'past' : e.status !== 'past');

  if (list.length === 0) {
    container.innerHTML = renderEmptyState('📅',
      filter === 'past' ? 'No past events' : 'No upcoming events',
      filter === 'past' ? 'Completed events will be archived here.' : 'New events will appear here once published.');
    return;
  }

  const canManage = state.currentUser && ['super_admin', 'univ_admin', 'dept_admin', 'moderator'].includes(state.currentUser.role);

  container.innerHTML = list.map(e => {
    const registered = e.registered_live ?? e.registered_count ?? 0;
    const pct = e.capacity ? Math.min(100, Math.round((registered / e.capacity) * 100)) : 0;
    const full = registered >= e.capacity;
    return `
    <div class="event-card">
      <div class="event-card-banner" style="background: linear-gradient(135deg, rgba(108,99,255,0.15), rgba(0,212,170,0.1))">
        ${escapeHtml(e.emoji || '🎓')}
        <span class="event-status ${full ? 'sold-out' : e.status}">${full ? '🔴 Full' : '🟢 Open'}</span>
      </div>
      <div class="event-card-body">
        <div style="font-size:10px;font-weight:700;color:var(--primary-light);margin-bottom:4px;text-transform:uppercase">${escapeHtml(e.type || 'Event')}</div>
        <div class="event-title">${escapeHtml(e.title)}</div>
        <div class="event-meta">📅 ${escapeHtml(e.event_date || 'TBA')}${e.event_time ? ` · ${escapeHtml(e.event_time)}` : ''}</div>
        <div class="event-meta">📍 ${escapeHtml(e.venue)}</div>
        <div class="event-capacity-track"><div class="event-capacity-fill" style="width:${pct}%"></div></div>
        <div class="event-capacity-meta">
          <span>${registered.toLocaleString()} / ${Number(e.capacity).toLocaleString()} registered</span>
          <span>${escapeHtml(e.price || 'Free')}</span>
        </div>
        <div class="event-card-actions">
          ${e.is_registered
            ? `<button class="btn btn-outline btn-sm" onclick="viewMyTicket(${e.id})">🎫 View Ticket</button>
               <button class="btn btn-ghost btn-sm" onclick="cancelTicket(${e.id}, '${escapeHtml(e.title).replace(/'/g, '&#39;')}')">Cancel</button>`
            : `<button class="btn btn-primary btn-sm" onclick="registerForEvent(${e.id}, '${escapeHtml(e.title).replace(/'/g, '&#39;')}', ${full})">${full ? '⏳ Join Waitlist' : '🎫 Get Ticket'}</button>`}
          ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="showAttendeesModal(${e.id})">👥 Attendees</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterEvents(filter, btn) {
  document.querySelectorAll('#public-events-view .events-tabs .chart-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEvents(filter);
}

// ─── EVENT MANAGEMENT PLANNER WORKSPACE ENGINE ───
let CURRENT_PLANNER_DATA = null;
let CURRENT_PLANNER_EVENT_ID = 1;
let ACTIVE_PLANNER_TAB = 'overview';

function switchEventWorkspaceMode(mode, btn) {
  document.querySelectorAll('.events-tabs .chart-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const plannerView = document.getElementById('planner-workspace-view');
  const publicView = document.getElementById('public-events-view');

  if (mode === 'planner') {
    if (plannerView) plannerView.classList.remove('hidden');
    if (publicView) publicView.classList.add('hidden');
    loadEventPlannerWorkspace(1);
  } else {
    if (plannerView) plannerView.classList.add('hidden');
    if (publicView) publicView.classList.remove('hidden');
    renderEvents('upcoming');
  }
}

async function loadEventPlannerWorkspace(eventId = 1) {
  const container = document.getElementById("planner-tab-content");
  if (container) container.innerHTML = renderSkeletonCards(3, "planner");

  // One bundled call returns all thirteen planner sections from PostgreSQL.
  // This previously fell back to ~80 lines of hardcoded sample data whenever
  // the request failed, which made an outage look like a populated workspace.
  const data = await API.getPlannerWorkspace(eventId);

  if (apiFailed(data)) {
    if (container) container.innerHTML = renderErrorState(data?.error || "Could not load the planner workspace.", "loadEventPlannerWorkspace(" + eventId + ")");
    return;
  }

  CURRENT_PLANNER_DATA = data;
  CURRENT_PLANNER_EVENT_ID = eventId;
  renderPlannerTabContent(ACTIVE_PLANNER_TAB);
}

function switchPlannerTab(tabName, btn) {
  ACTIVE_PLANNER_TAB = tabName;
  document.querySelectorAll('#planner-workspace-view .analytics-tabs .chart-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderPlannerTabContent(tabName);
}

function renderPlannerTabContent(tab) {
  const container = document.getElementById('planner-tab-content');
  if (!container || !CURRENT_PLANNER_DATA) return;

  // Modules added in Phase 6 render through their own function.
  if (['vendors', 'timeline', 'logistics'].includes(tab)) {
    renderPlannerExtraTab(tab);
    return;
  }

  const p = CURRENT_PLANNER_DATA.proposal;
  const b = CURRENT_PLANNER_DATA.budgets;
  const s = CURRENT_PLANNER_DATA.sponsors;
  const t = CURRENT_PLANNER_DATA.tasks;
  const c = CURRENT_PLANNER_DATA.committees || [];
  const vendors = CURRENT_PLANNER_DATA.vendors || [];
  const timeline = CURRENT_PLANNER_DATA.timeline || [];
  const logistics = CURRENT_PLANNER_DATA.logistics || [];
  const marketing = CURRENT_PLANNER_DATA.marketing || [];
  const meetings = CURRENT_PLANNER_DATA.meetings || [];

  // Calculate Metrics
  const totalEstBudget = b.reduce((acc, curr) => acc + Number(curr.estimated_cost), 0);
  const totalActBudget = b.reduce((acc, curr) => acc + Number(curr.actual_cost), 0);
  const totalSponsorRev = s.reduce((acc, curr) => acc + Number(curr.contribution_amount), 0);
  const completedTasks = t.filter(x => x.status === 'completed').length;

  if (tab === 'overview') {
    container.innerHTML = `
      <div class="planner-metrics-ribbon">
        <div class="pmetric-card">
          <div class="pmetric-val">৳${(totalEstBudget/100000).toFixed(2)}L</div>
          <div class="pmetric-lab">Estimated Budget</div>
        </div>
        <div class="pmetric-card">
          <div class="pmetric-val" style="color:var(--teal)">৳${(totalSponsorRev/100000).toFixed(2)}L</div>
          <div class="pmetric-lab">Sponsor Revenue</div>
        </div>
        <div class="pmetric-card">
          <div class="pmetric-val" style="color:var(--amber)">${completedTasks}/${t.length}</div>
          <div class="pmetric-lab">Tasks Completed</div>
        </div>
        <div class="pmetric-card">
          <div class="pmetric-val">${p.expected_attendance}</div>
          <div class="pmetric-lab">Expected Pax</div>
        </div>
      </div>

      <div class="dashboard-split">
        <div class="glass-card">
          <div class="card-header">
            <h3 class="card-title">🚀 Proposal Charter &amp; Executive Summary</h3>
            <span class="card-badge teal">APPROVED</span>
          </div>
          <div style="font-size:14px;font-weight:700;margin-bottom:8px">${p.name}</div>
          <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:14px">${p.description}</p>
          <div class="field-grid-2">
            <div><div class="field-label">Target Audience</div><div class="field-val">${p.target_audience}</div></div>
            <div><div class="field-label">Venue &amp; Date</div><div class="field-val">📍 ${p.venue} · 📅 ${p.event_date}</div></div>
            <div><div class="field-label">Event Organizer</div><div class="field-val">${p.organizer_name}</div></div>
            <div><div class="field-label">Department</div><div class="field-val">${p.department}</div></div>
          </div>
        </div>

        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">👥 Event Committees</h3></div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${c.map(comm => `
              <div style="padding:10px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
                <div style="font-weight:700;font-size:13px;color:var(--teal)">${comm.name}</div>
                <div style="font-size:12px;color:var(--text-secondary)">Lead: ${comm.leader_name} · ${comm.members_count} Members</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Budget Limit: ৳${(comm.budget_allocated/1000).toFixed(0)}k</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
  } else if (tab === 'budget') {
    container.innerHTML = `
      <div class="glass-card mb-16">
        <div class="card-header">
          <h3 class="card-title">💰 Budget Planning &amp; Variance Calculator</h3>
          <button class="btn btn-sm btn-primary" onclick="showAddBudgetModal()">+ Add Expense</button>
        </div>
        <div class="planner-metrics-ribbon mb-16">
          <div class="pmetric-card">
            <div class="pmetric-val">৳${totalEstBudget.toLocaleString()}</div>
            <div class="pmetric-lab">Total Estimated</div>
          </div>
          <div class="pmetric-card">
            <div class="pmetric-val" style="color:var(--amber)">৳${totalActBudget.toLocaleString()}</div>
            <div class="pmetric-lab">Actual Spent</div>
          </div>
          <div class="pmetric-card">
            <div class="pmetric-val" style="color:var(--teal)">৳${(totalEstBudget - totalActBudget).toLocaleString()}</div>
            <div class="pmetric-lab">Remaining Budget</div>
          </div>
          <div class="pmetric-card">
            <div class="pmetric-val" style="color:var(--teal)">🟢 HEALTHY</div>
            <div class="pmetric-lab">Budget Variance</div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="border-bottom:1px solid var(--border-glass);text-align:left;color:var(--text-secondary)">
              <th style="padding:8px">Category</th>
              <th style="padding:8px">Vendor Name</th>
              <th style="padding:8px">Estimated</th>
              <th style="padding:8px">Actual Cost</th>
              <th style="padding:8px">Variance</th>
              <th style="padding:8px">Status</th>
            </tr>
          </thead>
          <tbody>
            ${b.map(item => `
              <tr style="border-bottom:1px solid var(--border-glass)">
                <td style="padding:8px;font-weight:600">${item.category}</td>
                <td style="padding:8px;color:var(--text-secondary)">${item.vendor_name}</td>
                <td style="padding:8px">৳${Number(item.estimated_cost).toLocaleString()}</td>
                <td style="padding:8px;font-weight:700">৳${Number(item.actual_cost).toLocaleString()}</td>
                <td style="padding:8px;color:${item.estimated_cost >= item.actual_cost ? 'var(--teal)' : 'var(--red)'}">
                  ৳${(item.estimated_cost - item.actual_cost).toLocaleString()}
                </td>
                <td style="padding:8px"><span class="card-badge teal">${item.payment_status.toUpperCase()}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } else if (tab === 'sponsors') {
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">🤝 Sponsor CRM &amp; Deal Pipeline</h3>
          <button class="btn btn-sm btn-primary" onclick="showAddSponsorModal()">+ Add Sponsor</button>
        </div>
        <div class="campaigns-grid" style="margin-top:12px">
          ${s.map(sp => `
            <div class="glass-card sponsor-tier-card ${sp.package_tier}-tier">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span class="priority-tag critical" style="text-transform:uppercase;background:var(--primary-glow)">${sp.package_tier} SPONSOR</span>
                <span class="card-badge teal">${sp.pipeline_status.toUpperCase()}</span>
              </div>
              <div style="font-size:16px;font-weight:800">${sp.company}</div>
              <div style="font-size:12px;color:var(--text-secondary)">👤 ${sp.contact_person}</div>
              <div style="font-size:18px;font-weight:800;color:var(--teal);margin:8px 0">৳${Number(sp.contribution_amount).toLocaleString()}</div>
              <div style="font-size:11px;color:var(--text-muted)">📋 ${sp.deliverables}</div>
            </div>
          `).join('')}
        </div>
      </div>`;
  } else if (tab === 'tasks') {
    const todoTasks = t.filter(x => x.status === 'todo');
    const inProgTasks = t.filter(x => x.status === 'in_progress');
    const blockedTasks = t.filter(x => x.status === 'blocked');
    const doneTasks = t.filter(x => x.status === 'completed');

    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">📋 Task Management Kanban Board</h3>
          <button class="btn btn-sm btn-primary" onclick="showAddTaskModal()">+ New Task</button>
        </div>

        <div class="kanban-board-grid">
          <div class="kanban-column">
            <div class="kanban-column-header"><span>📌 TO DO</span><span class="card-badge">${todoTasks.length}</span></div>
            ${renderKanbanCards(todoTasks)}
          </div>
          <div class="kanban-column">
            <div class="kanban-column-header"><span>⚡ IN PROGRESS</span><span class="card-badge teal">${inProgTasks.length}</span></div>
            ${renderKanbanCards(inProgTasks)}
          </div>
          <div class="kanban-column">
            <div class="kanban-column-header"><span>⛔ BLOCKED</span><span class="card-badge red">${blockedTasks.length}</span></div>
            ${renderKanbanCards(blockedTasks)}
          </div>
          <div class="kanban-column">
            <div class="kanban-column-header"><span>✅ COMPLETED</span><span class="card-badge indigo">${doneTasks.length}</span></div>
            ${renderKanbanCards(doneTasks)}
          </div>
        </div>
      </div>`;
  } else if (tab === 'procurement') {
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header"><h3 class="card-title">🛒 Procurement &amp; Vendor Shopping List</h3></div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px">
          <thead>
            <tr style="border-bottom:1px solid var(--border-glass);text-align:left;color:var(--text-secondary)">
              <th style="padding:8px">Item</th>
              <th style="padding:8px">Category</th>
              <th style="padding:8px">Qty</th>
              <th style="padding:8px">Estimated Price</th>
              <th style="padding:8px">Actual Price</th>
              <th style="padding:8px">Vendor</th>
              <th style="padding:8px">Delivery Status</th>
            </tr>
          </thead>
          <tbody>
            ${CURRENT_PLANNER_DATA.procurement.map(item => `
              <tr style="border-bottom:1px solid var(--border-glass)">
                <td style="padding:8px;font-weight:700">${item.item_name}</td>
                <td style="padding:8px">${item.category}</td>
                <td style="padding:8px">${item.quantity}</td>
                <td style="padding:8px">৳${Number(item.estimated_price).toLocaleString()}</td>
                <td style="padding:8px">৳${Number(item.actual_price).toLocaleString()}</td>
                <td style="padding:8px;color:var(--text-secondary)">${item.vendor_name}</td>
                <td style="padding:8px"><span class="card-badge teal">${item.delivery_status.toUpperCase()}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } else if (tab === 'volunteers') {
    container.innerHTML = `
      <div class="field-grid-2" style="gap:16px">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">🛡 Volunteer Roster &amp; Shifts</h3></div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
            ${CURRENT_PLANNER_DATA.volunteers.map(v => `
              <div style="padding:10px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
                <div style="font-weight:700;font-size:13px">${v.volunteer_name}</div>
                <div style="font-size:12px;color:var(--text-secondary)">${v.assigned_committee} · ⏱ ${v.shift_time}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
                  <span class="card-badge teal">${v.attendance_status.toUpperCase()}</span>
                  <span style="font-size:11px;color:var(--teal)">🎓 Certificate Ready</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">⚠️ Security Risk Register &amp; Contingency</h3></div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
            ${CURRENT_PLANNER_DATA.risks.map(r => `
              <div style="padding:10px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <span style="font-weight:700;font-size:13px">${r.risk_title}</span>
                  <span class="priority-tag critical">${r.severity.toUpperCase()}</span>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🛡 Contingency: ${r.contingency_plan}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
  } else if (tab === 'marketing') {
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">📢 Marketing Campaigns</h3>
          ${plannerToolbar('marketing', 'Campaign')}
        </div>
        ${plannerTable(
          ['Channel', 'Campaign', 'Audience', 'Budget', 'Reach', 'Conversions', 'Status', ''],
          marketing,
          m => [
            escapeHtml(m.channel),
            `<strong>${escapeHtml(m.campaign_name)}</strong>`,
            escapeHtml(m.audience || '—'),
            `৳${Number(m.budget).toLocaleString()}`,
            Number(m.reach).toLocaleString(),
            `${Number(m.conversions).toLocaleString()}${Number(m.reach) ? ` (${((m.conversions / m.reach) * 100).toFixed(1)}%)` : ''}`,
            `<span class="card-badge ${m.status === 'live' ? 'teal' : m.status === 'completed' ? '' : 'amber'}">${escapeHtml(m.status)}</span>`,
            `<button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('marketing', ${m.id})">🗑</button>`
          ],
          '📢', 'No marketing campaigns planned yet')}
        <button class="btn btn-sm btn-outline mt-14" onclick="showBroadcastModal()">📣 Send a broadcast now</button>
      </div>

      <div class="glass-card mt-16">
        <div class="card-header">
          <h3 class="card-title">📝 Committee Meetings &amp; Minutes</h3>
          ${plannerToolbar('meetings', 'Meeting')}
        </div>
        ${plannerTable(
          ['Meeting', 'Date', 'Location', 'Attendees', 'Status', ''],
          meetings,
          mt => [
            `<strong>${escapeHtml(mt.title)}</strong>${mt.agenda ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(mt.agenda)}</div>` : ''}`,
            `${escapeHtml(formatDate(mt.meeting_date))}${mt.meeting_time ? ` · ${escapeHtml(mt.meeting_time)}` : ''}`,
            escapeHtml(mt.location || '—'),
            escapeHtml(mt.attendees || '—'),
            `<span class="card-badge ${mt.status === 'held' ? 'teal' : 'amber'}">${escapeHtml(mt.status)}</span>`,
            `<button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('meetings', ${mt.id})">🗑</button>`
          ],
          '📝', 'No meetings scheduled yet')}
      </div>`;
  } else if (tab === 'analytics') {
    container.innerHTML = renderSkeletonCards(2, 'analytics');
    renderPlannerAnalytics();
    return;
  } else if (tab === 'ai') {
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header"><h3 class="card-title">🤖 EventAI Planner Assistant &amp; Budget Predictor</h3></div>
        <div class="field-grid-2 mb-16">
          <div class="input-group">
            <label class="input-label">Expected Attendee Count (Pax)</label>
            <input type="number" id="ai-pax-input" class="form-input" value="1500" />
          </div>
          <div class="input-group">
            <label class="input-label">Event Category</label>
            <select id="ai-category-select" class="form-select">
              <option value="Reunion & Gala">Reunion &amp; Gala</option>
              <option value="Tech Festival">Tech Festival &amp; Hackathon</option>
              <option value="Career Fair">Career &amp; Job Fair</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" onclick="runEventAIEstimate()">🤖 Generate AI Plan &amp; Budget</button>

        <div id="ai-results-container" class="mt-16"></div>
      </div>`;
  }
}

function renderKanbanCards(taskList) {
  if (taskList.length === 0) return `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:20px">No tasks in this column</div>`;

  return taskList.map(task => `
    <div class="kanban-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span class="priority-tag ${task.priority}">${task.priority}</span>
        <span style="font-size:10px;color:var(--text-muted)">📅 ${task.deadline}</span>
      </div>
      <div style="font-size:13px;font-weight:700;margin-bottom:4px">${task.title}</div>
      <div style="font-size:11px;color:var(--text-secondary)">👤 Assigned: ${task.assigned_to}</div>
      <div style="display:flex;gap:4px;margin-top:8px">
        ${task.status !== 'todo' ? `<button class="btn btn-xs btn-outline" onclick="moveTaskStatus(${task.id}, 'todo')">◀ To Do</button>` : ''}
        ${task.status !== 'in_progress' ? `<button class="btn btn-xs btn-outline" onclick="moveTaskStatus(${task.id}, 'in_progress')">⚡ In Prog</button>` : ''}
        ${task.status !== 'completed' ? `<button class="btn btn-xs btn-primary" onclick="moveTaskStatus(${task.id}, 'completed')">✓ Done</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function moveTaskStatus(taskId, newStatus) {
  showToast(`⚡ Updating task #${taskId} status to ${newStatus}…`);
  await API.updateTaskStatus(taskId, newStatus);
  if (CURRENT_PLANNER_DATA && CURRENT_PLANNER_DATA.tasks) {
    const t = CURRENT_PLANNER_DATA.tasks.find(x => x.id === taskId);
    if (t) t.status = newStatus;
  }
  renderPlannerTabContent('tasks');
}

async function runEventAIEstimate() {
  const pax = document.getElementById('ai-pax-input').value || 1500;
  const category = document.getElementById('ai-category-select').value;

  showToast('🤖 EventAI Engine computing budget & risk matrix…');
  const res = await API.getEventAIEstimate({ attendance: pax, eventType: category });

  const container = document.getElementById('ai-results-container');
  if (container && res) {
    container.innerHTML = `
      <div class="glass-card" style="border-color:var(--teal)">
        <div style="font-size:16px;font-weight:800;color:var(--teal);margin-bottom:8px">✨ EventAI Recommendation Summary</div>
        <div class="field-grid-2 mb-16">
          <div><div class="field-label">Recommended Total Budget</div><div class="field-val" style="font-size:18px;color:var(--teal);font-weight:800">৳${res.recommendedBudget.toLocaleString()}</div></div>
          <div><div class="field-label">Catering (Food 40%)</div><div class="field-val">৳${res.breakdown.food.toLocaleString()}</div></div>
          <div><div class="field-label">Venue &amp; Hall (25%)</div><div class="field-val">৳${res.breakdown.venue.toLocaleString()}</div></div>
          <div><div class="field-label">Stage &amp; Tech (15%)</div><div class="field-val">৳${res.breakdown.stageTech.toLocaleString()}</div></div>
        </div>

        <div style="font-weight:700;font-size:13px;margin-bottom:6px">📅 Suggested Milestone Timeline</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${res.suggestedTimeline.map(item => `
            <div style="font-size:12px;padding:6px 10px;background:var(--bg-glass);border-radius:4px"><strong>${item.week}:</strong> ${item.milestone}</div>
          `).join('')}
        </div>
      </div>`;
  }
}



function showCreateProposalModal() {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">➕ Create Event Proposal</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="handleCreateProposalSubmit(event)">
      <div class="input-group">
        <label class="input-label">Event Name</label>
        <input type="text" id="prop-name" class="form-input" placeholder="DIC Tech Festival 2026" required />
      </div>
      <div class="input-group">
        <label class="input-label">Executive Description</label>
        <textarea id="prop-desc" class="form-input" rows="3" placeholder="Overview of objectives and target audience…" required></textarea>
      </div>
      <div class="field-grid-2">
        <div class="input-group">
          <label class="input-label">Venue</label>
          <input type="text" id="prop-venue" class="form-input" value="DIC Main Auditorium" required />
        </div>
        <div class="input-group">
          <label class="input-label">Expected Pax</label>
          <input type="number" id="prop-pax" class="form-input" value="1000" required />
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-full mt-16">Submit Proposal for Approval</button>
    </form>
  `);
}

async function handleCreateProposalSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('prop-name').value;
  const description = document.getElementById('prop-desc').value;
  const venue = document.getElementById('prop-venue').value;
  const expectedAttendance = document.getElementById('prop-pax').value;

  showToast('➕ Submitting Event Proposal to DIC Executive Board…');
  await API.submitEventProposal({ name, description, venue, expectedAttendance });
  closeModal();
  showToast('✅ Event Proposal Approved & Added to Planner Workspace!');
  loadEventPlannerWorkspace(1);
}

function showAddBudgetModal() {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">💰 Add Expense Item</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="handleAddBudgetSubmit(event)">
      <div class="input-group">
        <label class="input-label">Category</label>
        <input type="text" id="b-cat" class="form-input" placeholder="Stage & Audio Setup" required />
      </div>
      <div class="field-grid-2">
        <div class="input-group">
          <label class="input-label">Estimated Cost (৳)</label>
          <input type="number" id="b-est" class="form-input" placeholder="150000" required />
        </div>
        <div class="input-group">
          <label class="input-label">Actual Cost (৳)</label>
          <input type="number" id="b-act" class="form-input" placeholder="140000" required />
        </div>
      </div>
      <div class="input-group">
        <label class="input-label">Vendor Name</label>
        <input type="text" id="b-vendor" class="form-input" placeholder="Dhaka Event Tech Ltd" required />
      </div>
      <button type="submit" class="btn btn-primary btn-full mt-16">Save Expense Item</button>
    </form>
  `);
}

async function handleAddBudgetSubmit(e) {
  e.preventDefault();
  const category = document.getElementById('b-cat').value;
  const estimatedCost = parseFloat(document.getElementById('b-est').value) || 0;
  const actualCost = parseFloat(document.getElementById('b-act').value) || 0;
  const vendorName = document.getElementById('b-vendor').value;

  showToast('💰 Adding expense item to event budget…');
  const newBudget = await API.addEventBudget({ eventId: 1, category, estimatedCost, actualCost, vendorName });
  if (CURRENT_PLANNER_DATA && CURRENT_PLANNER_DATA.budgets) {
    CURRENT_PLANNER_DATA.budgets.push(newBudget || { id: Date.now(), category, estimated_cost: estimatedCost, actual_cost: actualCost, vendor_name: vendorName, payment_status: 'paid' });
  }
  closeModal();
  showToast('✅ Expense item saved successfully!');
  renderPlannerTabContent('budget');
}

function showAddSponsorModal() {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">🤝 Add Sponsor CRM Record</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="handleAddSponsorSubmit(event)">
      <div class="input-group">
        <label class="input-label">Company Name</label>
        <input type="text" id="s-company" class="form-input" placeholder="Brain Station 23" required />
      </div>
      <div class="field-grid-2">
        <div class="input-group">
          <label class="input-label">Contact Person</label>
          <input type="text" id="s-contact" class="form-input" placeholder="Tanvir Ahmed" required />
        </div>
        <div class="input-group">
          <label class="input-label">Package Tier</label>
          <select id="s-tier" class="form-select">
            <option value="title">Title Sponsor</option>
            <option value="gold" selected>Gold Sponsor</option>
            <option value="silver">Silver Sponsor</option>
            <option value="bronze">Bronze Sponsor</option>
          </select>
        </div>
      </div>
      <div class="field-grid-2">
        <div class="input-group">
          <label class="input-label">Contribution Amount (৳)</label>
          <input type="number" id="s-amount" class="form-input" placeholder="300000" required />
        </div>
        <div class="input-group">
          <label class="input-label">Pipeline Status</label>
          <select id="s-status" class="form-select">
            <option value="proposed">Proposed</option>
            <option value="agreed">Agreed</option>
            <option value="received" selected>Payment Received</option>
          </select>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-full mt-16">Add Sponsor Record</button>
    </form>
  `);
}

async function handleAddSponsorSubmit(e) {
  e.preventDefault();
  const company = document.getElementById('s-company').value;
  const contactPerson = document.getElementById('s-contact').value;
  const packageTier = document.getElementById('s-tier').value;
  const contributionAmount = parseFloat(document.getElementById('s-amount').value) || 0;
  const pipelineStatus = document.getElementById('s-status').value;

  showToast('🤝 Saving sponsor CRM deal…');
  const newSponsor = await API.addEventSponsor({ eventId: 1, company, contactPerson, packageTier, contributionAmount, pipelineStatus });
  if (CURRENT_PLANNER_DATA && CURRENT_PLANNER_DATA.sponsors) {
    CURRENT_PLANNER_DATA.sponsors.push(newSponsor || { id: Date.now(), company, contact_person: contactPerson, package_tier: packageTier, contribution_amount: contributionAmount, pipeline_status: pipelineStatus, deliverables: 'Standard branding package' });
  }
  closeModal();
  showToast('✅ Sponsor deal saved successfully!');
  renderPlannerTabContent('sponsors');
}

function showAddTaskModal() {
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title">📋 Create Kanban Task</h2>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="handleAddTaskSubmit(event)">
      <div class="input-group">
        <label class="input-label">Task Title</label>
        <input type="text" id="t-title" class="form-input" placeholder="Book main auditorium & stage lights" required />
      </div>
      <div class="field-grid-2">
        <div class="input-group">
          <label class="input-label">Assigned Committee</label>
          <input type="text" id="t-comm" class="form-input" value="Logistics & Stage" required />
        </div>
        <div class="input-group">
          <label class="input-label">Assigned Person</label>
          <input type="text" id="t-assign" class="form-input" placeholder="Rafiqul Islam" required />
        </div>
      </div>
      <div class="field-grid-2">
        <div class="input-group">
          <label class="input-label">Priority</label>
          <select id="t-priority" class="form-select">
            <option value="critical">Critical</option>
            <option value="high" selected>High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label">Deadline</label>
          <input type="text" id="t-deadline" class="form-input" value="Aug 10, 2026" required />
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-full mt-16">Create Task</button>
    </form>
  `);
}

async function handleAddTaskSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('t-title').value;
  const committeeName = document.getElementById('t-comm').value;
  const assignedTo = document.getElementById('t-assign').value;
  const priority = document.getElementById('t-priority').value;
  const deadline = document.getElementById('t-deadline').value;

  showToast('📋 Creating new Kanban task…');
  const newTask = await API.addEventTask({ eventId: 1, committeeName, title, priority, status: 'todo', assignedTo, deadline });
  if (CURRENT_PLANNER_DATA && CURRENT_PLANNER_DATA.tasks) {
    CURRENT_PLANNER_DATA.tasks.push(newTask || { id: Date.now(), committee_name: committeeName, title, priority, status: 'todo', assigned_to: assignedTo, deadline });
  }
  closeModal();
  showToast('✅ Kanban task created!');
  renderPlannerTabContent('tasks');
}



function filterJobs(value) { renderJobsEnhanced(value); }
function filterJobType(v) {
  state.jobFilters = { ...(state.jobFilters || {}), type: v === 'all' ? '' : v };
  renderJobsEnhanced();
}

function selectChapter(id) {
  document.querySelectorAll('.chapter-node').forEach(n => n.classList.remove('active'));
  const c = chaptersCache.find(ch => ch.id === id);
  if (!c) return;

  const isJoined = USER_CHAPTER_MEMBERSHIPS.has(c.id);
  const detail = document.getElementById('chapter-detail');
  if (!detail) return;

  detail.innerHTML = `
    <div class="chapter-detail-content">
      <div class="chapter-detail-header">
        <div class="chapter-detail-icon">${c.icon}</div>
        <div>
          <div class="chapter-detail-title">${c.name}</div>
          <div class="chapter-detail-sub">${c.type.charAt(0).toUpperCase() + c.type.slice(1)} Chapter · Est. 2020 · PostgreSQL Synced</div>
        </div>
      </div>
      <div class="chapter-stats-grid">
        <div class="chapter-stat"><div class="chapter-stat-val" id="chap-member-count-${c.id}">${c.members.toLocaleString()}</div><div class="chapter-stat-lab">Members</div></div>
        <div class="chapter-stat"><div class="chapter-stat-val">${c.events}</div><div class="chapter-stat-lab">Events</div></div>
        <div class="chapter-stat"><div class="chapter-stat-val">94%</div><div class="chapter-stat-lab">Active Rate</div></div>
      </div>
      <div style="font-size:14px;font-weight:700;margin-bottom:12px">Chapter Leadership &amp; Officers</div>
      ${['President: Rafiq Hossain (CSE 2018)', 'VP: Meher Nisha (SWE 2019)', 'Secretary: Tanvir Chowdhury (BBA 2020)'].map(m => `
        <div class="chapter-member"><span style="font-size:20px">👤</span><span>${m}</span></div>
      `).join('')}
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn ${isJoined ? 'btn-outline' : 'btn-primary'} btn-sm" id="btn-join-${c.id}" onclick="toggleJoinChapter(${c.id})">
          ${isJoined ? '✓ Joined Chapter' : '+ Join Chapter'}
        </button>
        <button class="btn btn-outline btn-sm" onclick="showChapterMembersModal(${c.id})">👥 View Members</button>
      </div>
    </div>`;
}

async function toggleJoinChapter(id) {
  const c = chaptersCache.find(ch => ch.id === id);
  if (!c) return;

  // The server owns membership state and returns the resulting flag; the
  // client no longer guesses or maintains a parallel counter.
  const res = await API.joinChapter(id);

  if (!res || res.error) {
    showToast('⚠ Could not update your membership — please try again.');
    return;
  }

  showToast(res.joined ? `🎉 You have joined ${c.name}!` : `ℹ Left chapter ${c.name}.`);

  await renderChapters();
  selectChapter(id);
}

async function showChapterMembersModal(id) {
  const c = chaptersCache.find(ch => ch.id === id);
  let members = [];

  if (typeof API !== 'undefined') {
    const res = await API.getChapterMembers(id);
    if (res && Array.isArray(res)) members = res;
  }

  // An empty chapter shows an empty state — it used to display four unrelated
  // alumni as though they were members.
  if (members.length === 0) {
    openModal(`
      <div class="onboarding-header">
        <div class="onboarding-title">👥 Chapter Enrolled Members</div>
        <div class="onboarding-sub">${escapeHtml(c ? c.name : 'DIC Alumni Chapter')}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      ${renderEmptyState('👤', 'No members yet', 'Be the first to join this chapter.')}
    `);
    return;
  }

  openModal(`
    <div class="onboarding-header">
      <div class="onboarding-title">👥 Chapter Enrolled Members</div>
      <div class="onboarding-sub">${escapeHtml(c ? c.name : 'DIC Alumni Chapter')} · ${members.length} Enrolled Member${members.length === 1 ? '' : 's'}</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;max-height:55vh;overflow-y:auto">
      ${members.map(m => `
        <div class="glass-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="alumni-avatar" style="width:36px;height:36px;font-size:13px;background:var(--teal)">
              <span>${m.initials || (m.name ? m.name.slice(0,2).toUpperCase() : 'AL')}</span>
            </div>
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${escapeHtml(m.name)}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml([m.role, m.company].filter(Boolean).join(" · ") || "Profile incomplete")}</div>
              <div style="font-size:11px;color:var(--text-muted)">Batch ${m.batch || "—"} · ${escapeHtml(m.dept || "—")}</div>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="closeModal(); viewAlumniProfile(${m.id || 5})">View Profile</button>
        </div>
      `).join('')}
    </div>
  `);
}

async function renderNewsFeed() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;

  feed.innerHTML = renderSkeletonCards(2, 'news');

  const stories = await API.getStories();

  if (stories === null) {
    feed.innerHTML = renderErrorState('Could not load the news feed.', 'renderNewsFeed()');
    return;
  }
  if (stories.length === 0) {
    feed.innerHTML = renderEmptyState('📰', 'No stories published yet',
      'Approved alumni stories and college announcements will appear here.');
    return;
  }

  feed.innerHTML = stories.map(n => {
    const author = n.author_name || 'DIC Press Office';
    const date = n.published_date || formatDate(n.created_at);
    return `
    <div class="news-card">
      <div class="news-banner" style="background:linear-gradient(135deg, rgba(108,99,255,0.12), rgba(0,212,170,0.08))">${escapeHtml(n.emoji || '🌟')}</div>
      <div class="news-card-body">
        <div class="news-category">${escapeHtml(n.category)}</div>
        <div class="news-title">${escapeHtml(n.title)}</div>
        <div class="news-excerpt">${escapeHtml(n.excerpt || '')}</div>
        <div class="news-footer">
          <div class="news-author">
            <div class="news-author-avatar">${escapeHtml(author.slice(0,2).toUpperCase())}</div>
            <div>
              <div style="font-weight:600">${escapeHtml(author)}</div>
              <div class="news-meta">${escapeHtml(date)}</div>
            </div>
          </div>
          <span class="moderated-badge">✓ Published</span>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

async function renderSpotlightAlumni() {
  const el = document.getElementById('spotlight-alumni');
  if (!el) return;

  el.innerHTML = renderSkeletonCards(2, 'spotlight');
  const result = await API.getAlumni({ mentor: true, limit: 5 });

  if (result === null) {
    el.innerHTML = renderErrorState('Could not load alumni spotlights.', 'renderSpotlightAlumni()');
    return;
  }
  const spotlights = result.alumni;
  if (spotlights.length === 0) {
    el.innerHTML = renderEmptyState('✨', 'No mentors available yet');
    return;
  }

  el.innerHTML = spotlights.map(a => `
    <div class="spotlight-card">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,${a.color}40,${a.color}20);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${a.color};flex-shrink:0">${escapeHtml(a.initials)}</div>
      <div class="spotlight-info">
        <div class="spotlight-name">${escapeHtml(a.name)}</div>
        <div class="spotlight-sub">${escapeHtml(a.company || "—")} · Batch ${a.batch || "—"}</div>
      </div>
    </div>
  `).join('');
}

function renderMapClusters() {
  const container = document.getElementById('map-clusters');
  if (!container) return;

  const clusters = [
    { label: '8,241', size: 'xl', top: 42, left: 62, title: 'Bangladesh' },
    { label: '1,240', size: 'lg', top: 28, left: 44, title: 'United Kingdom' },
    { label: '987', size: 'lg', top: 35, left: 18, title: 'United States' },
    { label: '542', size: 'md', top: 38, left: 50, title: 'India' },
    { label: '487', size: 'md', top: 42, left: 54, title: 'UAE' },
    { label: '381', size: 'md', top: 72, left: 80, title: 'Australia' },
    { label: '298', size: 'sm', top: 40, left: 72, title: 'Singapore' },
    { label: '187', size: 'sm', top: 30, left: 48, title: 'Germany' },
    { label: '142', size: 'sm', top: 25, left: 36, title: 'Canada' },
  ];

  container.innerHTML = clusters.map(c => `
    <div class="map-cluster ${c.size}" style="top:${c.top}%;left:${c.left}%" title="${c.title}: ${c.label} alumni">
      ${c.label}
    </div>
  `).join('');
}

function renderCareerTimeline() {
  const el = document.getElementById('career-timeline');
  if (!el) return;
  el.innerHTML = MOCK_CAREER_TIMELINE.map(t => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-company">${t.company}</div>
      <div class="timeline-role">${t.role}</div>
      <div class="timeline-period">${t.period}</div>
    </div>
  `).join('');
}

function renderRBACTable() {
  const table = document.getElementById('rbac-table');
  if (!table) return;

  const permClass = {
    'Full': 'perm-full', 'Edit': 'perm-edit', 'View': 'perm-view',
    'None': 'perm-none', 'Limited': 'perm-limited', 'Audit': 'perm-audit',
    'Donate': 'perm-donate', 'Request': 'perm-view', 'Post': 'perm-edit',
    'Apply': 'perm-view', 'past': 'perm-none'
  };

  let html = `<thead><tr>
    <th class="module-col">Module / Function</th>
    ${MOCK_RBAC.roles.map(r => `<th class="role-col">${r}</th>`).join('')}
  </tr></thead><tbody>`;

  MOCK_RBAC.matrix.forEach((row, i) => {
    html += `<tr>
      <td class="module-name">${MOCK_RBAC.modules[i]}</td>
      ${row.map(p => `<td class="perm-cell"><span class="${permClass[p] || 'perm-none'}">${p}</span></td>`).join('')}
    </tr>`;
  });

  html += '</tbody>';
  table.innerHTML = html;
}

// ─── IMMUTABLE AUDIT LOG ───
async function renderAuditLog() {
  const el = document.getElementById('audit-log');
  if (!el) return;

  const rows = await API.getAuditLogs();
  if (apiFailed(rows)) {
    el.innerHTML = renderErrorState(rows?.error || 'Could not load audit logs.', 'renderAuditLog()');
    return;
  }
  if (rows.length === 0) {
    el.innerHTML = renderEmptyState('🛡', 'No audit entries yet', 'Privileged actions are recorded here as they happen.');
    return;
  }

  el.innerHTML = rows.map(l => `
    <div class="audit-entry">
      <div class="audit-icon" style="background:${escapeHtml(l.bg_color || 'rgba(0,168,89,0.15)')}">${escapeHtml(l.icon || '🛡')}</div>
      <div style="flex:1;min-width:0">
        <div class="audit-action">${escapeHtml(l.action)}</div>
        <div class="audit-meta">${escapeHtml(l.meta)} · ${escapeHtml(formatRelativeTime(l.created_at))}</div>
      </div>
      <div class="audit-hash" title="Hash-chained to the previous entry">${escapeHtml(l.hash)}</div>
    </div>`).join('');
}

// ─── COMPLIANCE GRID (REQ-14) ───
// Reports actual encryption / consent / audit state instead of fixed green pills.
async function renderComplianceGrid() {
  const el = document.getElementById('compliance-grid');
  if (!el) return;

  const items = await API.getComplianceStatus();
  if (apiFailed(items)) {
    el.innerHTML = renderErrorState(items?.error || 'Could not load compliance status.', 'renderComplianceGrid()');
    return;
  }

  const labels = { compliant: '✓ Compliant', pending: '◐ No data yet', at_risk: '⚠ Action required' };
  el.innerHTML = items.map(c => `
    <div class="compliance-card ${c.status}">
      <div class="compliance-icon">${c.icon}</div>
      <div class="compliance-title">${escapeHtml(c.title)}</div>
      <div class="compliance-desc">${escapeHtml(c.desc)}</div>
      <span class="compliance-status ${c.status}">${labels[c.status] || c.status}</span>
    </div>`).join('');
}

function renderTenantList() {
  const el = document.getElementById('tenant-list');
  if (!el) return;
  el.innerHTML = MOCK_TENANTS.map(t => `
    <div class="tenant-card glass-card">
      <div style="flex:1">
        <div style="font-size:16px;font-weight:700">${t.name}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${t.subdomain}</div>
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
  `).join('');
}

async function renderNotifications() {
  const el = document.getElementById('notif-list');
  if (!el) return;

  el.innerHTML = renderSkeletonCards(3, 'notif');

  const items = await API.getNotifications();

  if (items === null) {
    el.innerHTML = renderErrorState('Could not load notifications.', 'renderNotifications()');
    updateNotifBadge(0);
    return;
  }
  if (items.length === 0) {
    el.innerHTML = renderEmptyState('🔔', 'You are all caught up', 'New activity will show up here.');
    updateNotifBadge(0);
    return;
  }

  el.innerHTML = items.map(n => `
    <div class="notif-item${n.is_unread ? ' unread' : ''}" onclick="markNotificationRead(${n.id})">
      <div class="notif-item-icon">${escapeHtml(n.icon || '🔔')}</div>
      <div class="notif-item-body">
        <div class="notif-item-title">${escapeHtml(n.title)}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(n.subtitle || '')}</div>
        <div class="notif-item-time">${escapeHtml(formatRelativeTime(n.created_at))}</div>
      </div>
      ${n.is_unread ? '<div class="notif-item-unread"></div>' : ''}
    </div>
  `).join('');

  updateNotifBadge(items.filter(n => n.is_unread).length);
}

// Keeps the topbar bell count honest instead of the hardcoded "7".
function updateNotifBadge(count) {
  document.querySelectorAll('.notif-count').forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  });
}

async function markNotificationRead(id) {
  const res = await API.markNotificationRead(id);
  if (res) renderNotifications();
}

async function markAllNotificationsRead() {
  const res = await API.markAllNotificationsRead();
  if (res) {
    showToast(`✓ ${res.updated} notification${res.updated === 1 ? '' : 's'} marked as read`);
    renderNotifications();
  } else {
    showToast('⚠ Could not update notifications — please retry.');
  }
}

function renderInternshipDrives() {
  const el = document.getElementById('internship-drives');
  if (!el) return;
  const drives = [
    { company: 'bKash Ltd', role: 'Software Intern', emoji: '📱' },
    { company: 'Pathao', role: 'Data Science Intern', emoji: '🚗' },
    { company: 'Samsung R&D', role: 'AI/ML Intern', emoji: '📡' },
  ];
  el.innerHTML = drives.map(d => `
    <div class="internship-item">
      <span>${d.emoji}</span>
      <div style="flex:1"><div style="font-weight:600;font-size:13px">${d.role}</div><div style="font-size:11px;color:var(--text-muted)">${d.company}</div></div>
      <button class="btn btn-sm btn-outline" onclick="showPage('jobs')">View Board</button>
    </div>
  `).join('');
}

function renderAnalyticsMetrics() {
  const el = document.getElementById('analytics-metrics');
  if (!el) return;
  const metrics = [
    { label: 'Profile Update Rate', value: '72.3%', change: '+8.4%', up: true },
    { label: 'YoY Donation Growth', value: '35.2%', change: '+12.1%', up: true },
    { label: 'Mentorship Completion', value: '83.1%', change: '+5.7%', up: true },
    { label: 'Event Conversion Rate', value: '68.4%', change: '-2.1%', up: false },
    { label: 'System Uptime', value: '99.94%', change: '+0.04%', up: true },
    { label: 'Offline Sync Success', value: '99.8%', change: 'Stable', up: true },
  ];
  el.innerHTML = metrics.map(m => `
    <div class="analytics-metric-item">
      <div class="analytics-metric-label">${m.label}</div>
      <div class="analytics-metric-value" style="color:${m.up ? 'var(--teal)' : 'var(--amber)'}">${m.value}</div>
      <div class="analytics-metric-change ${m.up ? 'up' : 'down'}">${m.change} vs last period</div>
    </div>
  `).join('');
}

function generateGeoHeatmap() {
  const el = document.getElementById('geo-heatmap');
  if (!el) return;
  const countries = [
    { name: 'Bangladesh', count: 8241, pct: 100 },
    { name: 'United Kingdom', count: 1240, pct: 64 },
    { name: 'United States', count: 987, pct: 51 },
    { name: 'Canada', count: 542, pct: 28 },
    { name: 'UAE', count: 487, pct: 25 },
    { name: 'Australia', count: 381, pct: 19 },
    { name: 'Singapore', count: 298, pct: 15 },
    { name: 'Germany', count: 187, pct: 10 },
    { name: 'India', count: 142, pct: 7 },
    { name: 'Others', count: 342, pct: 18 },
  ];
  el.innerHTML = `<div class="geo-countries">${countries.map(c => `
    <div class="geo-country-item">
      <div class="geo-country-name">${c.name}</div>
      <div class="geo-country-bar-track"><div class="geo-country-bar-fill" style="width:${c.pct}%"></div></div>
      <div class="geo-country-count">${c.count.toLocaleString()}</div>
    </div>
  `).join('')}</div>`;
}

// ─── QR CODE ─────────────────────────────────────────────────
function initQRCode() {
  const el = document.getElementById('id-qr-code');
  if (!el || typeof QRCode === 'undefined') return;
  el.innerHTML = '';
  try {
    new QRCode(el, {
      text: 'https://dic.alumnai.io/verify?id=DIC-2020-0847&token=SEC-' + Math.random().toString(36).substr(2,12).toUpperCase(),
      width: 70,
      height: 70,
      colorDark: '#6C63FF',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch(e) { el.style.background = '#fff'; el.innerHTML = '<div style="font-size:8px;color:#6C63FF;padding:4px;text-align:center">QR Code</div>'; }
}

// ─── MODALS ──────────────────────────────────────────────────
function showModal(html) {
  const body = document.getElementById('modal-body');
  const overlay = document.getElementById('modal-overlay');
  if (body) body.innerHTML = html;
  if (overlay) overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function openModal(html) {
  showModal(html);
}
window.openModal = showModal;

function closeModal(e) {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

// ─── MENTOR REQUEST MODAL ───
function showMentorModal(mentorName = '', mentorId = null, matchScore = 0) {
  if (!mentorId) {
    showToast('ℹ Open a mentor from the suggestions list to send a request.');
    return;
  }
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🤝 Request a Mentor</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="socratic-prompt">
      <div class="socratic-prompt-icon">🤖</div>
      <div class="socratic-prompt-text">
        <strong>ConnectAI:</strong> Be specific about your goal and what guidance you need — focused requests are accepted far more often.
      </div>
    </div>
    <div style="margin-bottom:14px;padding:12px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
      <div style="font-size:12px;color:var(--text-muted)">Requesting mentorship from</div>
      <div style="font-size:15px;font-weight:700;margin-top:2px">${escapeHtml(mentorName)}</div>
      ${matchScore ? `<div style="font-size:12px;color:var(--teal);margin-top:2px">${matchScore}% career vector match</div>` : ''}
    </div>
    <div class="input-group">
      <label class="input-label">What do you need help with?</label>
      <input type="text" id="mentor-subject" class="form-input" placeholder="e.g. Transitioning from web development into ML engineering" required />
    </div>
    <div class="input-group">
      <label class="input-label">Your message</label>
      <textarea id="mentor-message" class="form-input" rows="5" placeholder="Introduce yourself, your background and what specific guidance would help most…"></textarea>
    </div>
    <button class="btn btn-primary btn-full" onclick="submitMentorRequest(${mentorId}, ${matchScore})">🤝 Send Request</button>
    <div style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center">Unanswered requests expire automatically after 5 days.</div>
  `);
}



// ─── DONATE MODAL ───
function showDonateModal(campaignId, campaignName) {
  state.selectedAmount = null;
  state.selectedGateway = null;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">💚 Donate</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="margin-bottom:14px;padding:12px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
      <div style="font-size:12px;color:var(--text-muted)">Contributing to</div>
      <div style="font-size:15px;font-weight:700;margin-top:2px">${escapeHtml(campaignName)}</div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Select Amount (৳)</div>
      <div class="amount-grid">
        ${[500, 1000, 2500, 5000, 10000, 25000].map(a =>
          `<button class="amount-btn" onclick="selectAmount(this, ${a})">৳${a.toLocaleString()}</button>`).join('')}
      </div>
      <div class="input-group mt-16">
        <label class="input-label">Or enter a custom amount</label>
        <input type="number" id="custom-amount" class="form-input" min="1" placeholder="e.g. 7500" inputmode="numeric" />
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Payment Method</div>
      <div class="gateway-grid">
        ${[['bkash','📱','bKash'],['nagad','📲','Nagad'],['rocket','🚀','Rocket'],['card','💳','Card']].map(([id, icon, label]) =>
          `<div class="gateway-option" onclick="selectGateway(this, '${id}')">
             <div style="font-size:22px">${icon}</div><div style="font-size:12px;font-weight:700">${label}</div>
           </div>`).join('')}
      </div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin:14px 0;cursor:pointer">
      <input type="checkbox" id="donate-anonymous" /> Donate anonymously
    </label>
    <button class="btn btn-primary btn-full" onclick="processDonation(${campaignId}, '${escapeHtml(campaignName).replace(/'/g, '&#39;')}')">Continue to Payment →</button>
  `);
}

function selectAmount(btn, amount) {
  document.querySelectorAll('.amount-option').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.selectedAmount = amount;
  document.getElementById('custom-amount').value = '';
}

function selectGateway(el, gateway) {
  document.querySelectorAll('.gateway-option').forEach(g => g.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedGateway = gateway;
}









// ─── CREATE EVENT (was a toast-only shell) ───
function showCreateEventModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Create Event</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="handleCreateEventSubmit(event)">
      <div class="input-group"><label class="input-label">Event Title</label>
        <input type="text" id="event-title" class="form-input" placeholder="e.g. Alumni Career Summit 2026" required /></div>
      <div class="input-group"><label class="input-label">Emoji</label>
        <input type="text" id="event-emoji" class="form-input" value="🎓" /></div>
      <div class="field-grid-2">
        <div class="input-group"><label class="input-label">Date</label>
          <input type="date" id="event-date" class="form-input" required /></div>
        <div class="input-group"><label class="input-label">Time</label>
          <input type="time" id="event-time" class="form-input" /></div>
      </div>
      <div class="input-group"><label class="input-label">Venue</label>
        <input type="text" id="event-venue" class="form-input" placeholder="Venue or Online (Zoom)" required /></div>
      <div class="field-grid-2">
        <div class="input-group"><label class="input-label">Capacity</label>
          <input type="number" id="event-capacity" class="form-input" min="1" value="200" required /></div>
        <div class="input-group"><label class="input-label">Ticket Price</label>
          <input type="text" id="event-price" class="form-input" placeholder="Free or ৳500" value="Free" /></div>
      </div>
      <div class="input-group"><label class="input-label">Type</label>
        <select id="event-type" class="form-select">
          <option>Gala</option><option>Professional</option><option>Conference</option>
          <option>Workshop</option><option>Reunion</option>
        </select></div>
      <button type="submit" class="btn btn-primary btn-full">Create Event</button>
    </form>
  `);
}

// ─── POST JOB (was a toast-only shell) ───
function showPostJobModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Post a Job</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="background:var(--primary-glow);border:1px solid rgba(108,99,255,0.2);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--primary-light)">
      🔒 Alumni-only posting — visible to verified DIC alumni.
    </div>
    <form onsubmit="handlePostJobSubmit(event)">
      <div class="input-group"><label class="input-label">Job Title</label>
        <input type="text" id="job-title" class="form-input" placeholder="e.g. Senior Software Engineer" required /></div>
      <div class="input-group"><label class="input-label">Company</label>
        <input type="text" id="job-company" class="form-input" placeholder="Your company name" required /></div>
      <div class="field-grid-2">
        <div class="input-group"><label class="input-label">Type</label>
          <select id="job-type" class="form-select">
            <option value="fulltime">Full-time</option><option value="parttime">Part-time</option>
            <option value="internship">Internship</option><option value="contract">Contract</option>
          </select></div>
        <div class="input-group"><label class="input-label">Location</label>
          <input type="text" id="job-location" class="form-input" placeholder="Dhaka / Remote" value="Dhaka" /></div>
      </div>
      <div class="input-group"><label class="input-label">Salary Range</label>
        <input type="text" id="job-salary" class="form-input" placeholder="e.g. ৳80K–৳120K/mo" /></div>
      <div class="input-group"><label class="input-label">Skill Tags (comma separated)</label>
        <input type="text" id="job-tags" class="form-input" placeholder="React, Node.js, PostgreSQL" /></div>
      <button type="submit" class="btn btn-primary btn-full">Post Job</button>
    </form>
  `);
}

function showCreateChapterModal() {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Create Chapter</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="handleCreateChapterSubmit(event)">
      <div class="input-group"><label class="input-label">Chapter Name</label><input type="text" id="chap-create-name" class="form-input" placeholder="e.g., Sylhet Regional Chapter" required /></div>
      <div class="input-group"><label class="input-label">Type</label><select id="chap-create-type" class="form-select"><option value="regional">Regional</option><option value="batch">Batch</option><option value="interest">Interest</option></select></div>
      <div class="input-group"><label class="input-label">Icon Emoji</label><input type="text" id="chap-create-icon" class="form-input" value="🏫" required /></div>
      <div class="input-group"><label class="input-label">Description</label><textarea id="chap-create-desc" class="form-input" rows="3" placeholder="What is this chapter for?"></textarea></div>
      <button type="submit" class="btn btn-primary btn-full mt-16">🚀 Submit Chapter for Moderation</button>
    </form>
  `);
}

async function handleCreateChapterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('chap-create-name').value.trim();
  const type = document.getElementById('chap-create-type').value;
  const icon = document.getElementById('chap-create-icon').value.trim() || '🏫';
  const description = document.getElementById('chap-create-desc').value.trim();

  if (!name) return;

  // The server decides the status from the session role: admins publish
  // immediately, everyone else enters the moderation queue.
  const res = await API.submitChapter({ name, type, icon, description });

  if (!res || res.error || !res.chapter) {
    showToast(`⚠ Could not create the chapter: ${res?.error || 'the server did not respond.'}`);
    return;
  }

  closeModal();

  if (res.status === 'pending_review') {
    showToast(`⏳ Chapter "${name}" submitted for moderator approval.`);
  } else {
    showToast(`✅ Chapter "${name}" created and published!`);
  }

  await renderChapters();
  // Only approved chapters are in the public list; select it if it is there.
  if (chaptersCache.some(c => c.id === res.chapter.id)) selectChapter(res.chapter.id);
  renderNotifications();
}

function showCreateNewsModal() {
  openModal(`
    <div class="modal-header">
      <div class="modal-title">✐ Write a Story</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="handleCreateStorySubmit(event)">
      <div class="input-group"><label class="input-label">Headline / Title</label><input type="text" id="story-create-title" class="form-input" placeholder="e.g., DIC AI Lab Launch 2026" required /></div>
      <div class="input-group"><label class="input-label">Category</label><select id="story-create-category" class="form-select"><option>Alumni Spotlight</option><option>Achievement</option><option>Announcement</option><option>Career News</option></select></div>
      <div class="input-group"><label class="input-label">Emoji Icon</label><input type="text" id="story-create-emoji" class="form-input" value="🌟" required /></div>
      <div class="input-group"><label class="input-label">Story Content</label><textarea id="story-create-content" class="form-input" rows="5" placeholder="Write your story here…" required></textarea></div>
      <button type="submit" class="btn btn-primary btn-full mt-16"> Submit Story for Review</button>
    </form>
  `);
}

async function handleCreateStorySubmit(e) {
  e.preventDefault();
  const title = document.getElementById('story-create-title').value.trim();
  const category = document.getElementById('story-create-category').value;
  const emoji = document.getElementById('story-create-emoji').value.trim() || '🌟';
  const content = document.getElementById('story-create-content').value.trim();

  if (!title || !content) return;

  const authorName = state.currentUser ? state.currentUser.name : 'Mohiuddin Rahman';

  const result = await API.submitStory({ title, category, emoji, content, authorName });

  if (!result || result.error) {
    showToast('⚠ Could not submit the story — please try again.');
    return;
  }

  closeModal();
  showToast(`⏳ Story "${title}" submitted for Super Admin moderation!`);

  // Refresh both sides of the workflow so the submission is visible immediately.
  if (typeof renderModerationPanel === 'function') renderModerationPanel();
  renderNewsFeed();
  renderNotifications();
}

function showTenantSwitcher() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">⇅ Switch Institution</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">You have cross-institutional access to the following alumni networks:</p>
    ${MOCK_TENANTS.map(t => `
      <div class="tenant-card glass-card" style="cursor:pointer" onclick="switchTenant('${t.name}')">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700">${t.name}</div>
          <div style="font-size:12px;color:var(--text-secondary)">${t.subdomain}</div>
        </div>
        <span class="tenant-status ${t.status}">${t.status.toUpperCase()}</span>
      </div>
    `).join('')}
  `);
}

function switchTenant(name) {
  document.getElementById('active-tenant').textContent = name;
  closeModal();
  showToast(`🏫 Switched to ${name}`);
}

// ─── ADMIN SECTIONS ─────────────────────────────────────────
function switchAdmin(section, btn) {
  document.querySelectorAll('.admin-tabs .chart-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
  document.getElementById('admin-' + section).classList.remove('hidden');
}

// ─── MISC ACTIONS ────────────────────────────────────────────


function showEditProfile() { showToast('✏ Profile editor loading…'); }







function handleGlobalSearch(value) {
  if (value.length > 2) {
    setTimeout(() => {
      if (state.currentPage !== 'directory') {
        showPage('directory');
        document.getElementById('dir-search').value = value;
        filterDirectory(value);
      }
    }, 300);
  }
}

// ─── TOAST NOTIFICATION ──────────────────────────────────────
function showToast(message) {
  let toast = document.getElementById('toast-container');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-container';
    toast.style.cssText = 'position:fixed;bottom:90px;right:20px;z-index:2000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(toast);
  }

  const t = document.createElement('div');
  t.style.cssText = 'background:rgba(17,27,46,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px 18px;font-size:13px;font-weight:600;color:#F1F5FF;backdrop-filter:blur(20px);box-shadow:0 8px 30px rgba(0,0,0,0.4);animation:slideInRight 0.3s ease;max-width:320px;pointer-events:auto;';
  t.textContent = message;
  toast.appendChild(t);

  setTimeout(() => {
    t.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

// Add toast keyframes
const style = document.createElement('style');
style.textContent = `
@keyframes slideInRight { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100px); opacity: 0; } }
`;
document.head.appendChild(style);

// ─── OFFLINE SIMULATION ──────────────────────────────────────
let isOnline = true;
function simulateOffline() {
  isOnline = !isOnline;
  const el = document.getElementById('offline-status');
  if (isOnline) {
    el.className = 'offline-status online';
    el.innerHTML = '<span class="status-dot"></span><span class="status-text">Online</span>';
    showToast('🟢 Connection restored. Syncing 247 records…');
  } else {
    el.className = 'offline-status offline';
    el.innerHTML = '<span class="status-dot"></span><span class="status-text">Offline Queue Active</span>';
    showToast('🟡 Offline mode. Changes will sync when connected.');
  }
}

// Click offline status to toggle
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('offline-status');
  if (el) el.addEventListener('click', simulateOffline);
});

// ─── MOBILE PROGRESSIVE DISCLOSURE HELPER ───
function toggleProgressiveDisclosure(targetId, btn) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const isHidden = target.classList.contains('hidden');
  if (isHidden) {
    target.classList.remove('hidden');
    if (btn) btn.innerHTML = '▲ Show Less';
  } else {
    target.classList.add('hidden');
    if (btn) btn.innerHTML = '▼ Show More';
  }
}

// ─── INSTANT MOBILE & DESKTOP DOM INITIALIZER ────────────────
let __appInitialized = false;
// Boot: restore an existing session if the stored token is still valid,
// otherwise show the login screen. This previously called enterApp()
// unconditionally, which walked straight past authentication.
async function initAppOnce() {
  if (__appInitialized) return;
  __appInitialized = true;

  initAppTheme();

  const user = await API.me();
  if (user) {
    enterAuthenticatedApp(user);
  } else {
    API.logout();
    showLoginScreen();
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initAppOnce, 1);
} else {
  document.addEventListener('DOMContentLoaded', initAppOnce);
  window.addEventListener('load', initAppOnce);
}

// ============================================================
// GAP-FIX ADDITIONS — REQ-01, REQ-03, REQ-05, REQ-07, REQ-08
//                     REQ-09, REQ-10, REQ-12, REQ-18
// ============================================================

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

// ─── 1. TOP DONORS LEADERBOARD (DASHBOARD) ───────────────────

// ─── DONOR LEADERBOARD ───
async function renderDonorLeaderboard() {
  const el = document.getElementById('donor-leaderboard');
  if (!el) return;

  const rows = await API.getDonorLeaderboard();
  if (apiFailed(rows)) {
    el.innerHTML = renderErrorState('Could not load the leaderboard.', 'renderDonorLeaderboard()');
    return;
  }
  if (rows.length === 0) {
    el.innerHTML = renderEmptyState('🏆', 'No donations yet', 'The top contributors will be listed here.');
    return;
  }

  const tiers = ['Gold Benefactor', 'Silver Patron', 'Bronze Supporter', 'Alumni Sustainer', 'Annual Contributor'];
  el.innerHTML = rows.map((d, i) => `
    <div class="donor-row">
      <div class="donor-rank rank-${i + 1}">${i + 1}</div>
      <div style="flex:1;min-width:0">
        <div class="donor-name">${escapeHtml(d.name || 'Anonymous Donor')}${d.batch ? ` · <span style="color:var(--text-muted);font-weight:500">Batch '${String(d.batch).slice(-2)}</span>` : ''}</div>
        <div class="donor-tier">${tiers[i] || 'Contributor'}</div>
      </div>
      <div class="donor-amount">৳${Number(d.total).toLocaleString()}</div>
    </div>`).join('');
}

// ─── 2. ANALYTICS: MENTORSHIP HEALTH & EVENT ROI ─────────────
const _origSwitchAnalytics = switchAnalytics;
switchAnalytics = function(tab, btn) {
  const mainPanel = document.getElementById('analytics-panel-main');
  const mentPanel = document.getElementById('analytics-panel-mentorship');
  const roiPanel = document.getElementById('analytics-panel-eventROI');

  // Update tabs active class
  document.querySelectorAll('.analytics-tabs .chart-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (mainPanel) mainPanel.classList.add('hidden');
  if (mentPanel) mentPanel.classList.add('hidden');
  if (roiPanel) roiPanel.classList.add('hidden');

  if (tab === 'mentorship') {
    if (mentPanel) mentPanel.classList.remove('hidden');
    renderMentorshipHealthAnalytics();
  } else if (tab === 'eventROI') {
    if (roiPanel) roiPanel.classList.remove('hidden');
    renderEventROIAnalytics();
  } else {
    if (mainPanel) mainPanel.classList.remove('hidden');
    if (typeof _origSwitchAnalytics === 'function') _origSwitchAnalytics(tab, btn);
  }
};

function renderMentorshipHealthAnalytics() {
  const grid = document.getElementById('mentorship-health-grid');
  const dist = document.getElementById('outcome-distribution');
  if (!grid) return;

  grid.innerHTML = `
    <div class="sync-overview-grid">
      <div class="sync-stat-card"><div class="sync-stat-val">1,203</div><div class="sync-stat-label">Active Connections</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--teal)">83%</div><div class="sync-stat-label">Goal Completion Rate</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--amber)">&lt;12 hrs</div><div class="sync-stat-label">Avg Mentor Response</div></div>
      <div class="sync-stat-card"><div class="sync-stat-val" style="color:var(--primary-light)">4.9 / 5.0</div><div class="sync-stat-label">Mentee Rating</div></div>
    </div>
  `;

  if (dist) {
    dist.innerHTML = `
      <div class="funnel-bars" style="margin-top:10px">
        <div class="funnel-item"><div class="funnel-label">Career Advice & Referrals</div><div class="funnel-track"><div class="funnel-fill bkash" style="width:72%">72%</div></div></div>
        <div class="funnel-item"><div class="funnel-label">Code & Technical Reviews</div><div class="funnel-track"><div class="funnel-fill nagad" style="width:58%">58%</div></div></div>
        <div class="funnel-item"><div class="funnel-label">Higher Education & Research</div><div class="funnel-track"><div class="funnel-fill rocket" style="width:41%">41%</div></div></div>
        <div class="funnel-item"><div class="funnel-label">Startup Pitch Feedback</div><div class="funnel-track"><div class="funnel-fill card" style="width:25%">25%</div></div></div>
      </div>
    `;
  }
}

const MOCK_EVENT_ROI = [
  { name: 'Alumni Reunion 2026', ticketsSold: 470, capacity: 500, rev: '৳7,05,000', cost: '৳3,20,000', margin: '+120%', roi: '2.2x' },
  { name: 'Tech Career Fair Q2', ticketsSold: 310, capacity: 350, rev: '৳3,10,000', cost: '৳1,10,000', margin: '+181%', roi: '2.8x' },
  { name: 'AI & Tech Symposium', ticketsSold: 180, capacity: 200, rev: '৳2,16,000', cost: '৳95,000', margin: '+127%', roi: '2.3x' },
  { name: 'UK Chapter Dinner', ticketsSold: 65, capacity: 70, rev: '৳2,60,000', cost: '৳1,80,000', margin: '+44%', roi: '1.4x' }
];

function renderEventROIAnalytics() {
  const table = document.getElementById('event-roi-table');
  const summary = document.getElementById('roi-summary');
  if (!table) return;

  table.innerHTML = `
    <div class="table-scroll">
      <table class="rbac-table">
        <thead>
          <tr>
            <th>Event Name</th>
            <th>Tickets Sold</th>
            <th>Revenue (BDT)</th>
            <th>Cost (BDT)</th>
            <th>Net Margin</th>
            <th>ROI Multiplier</th>
          </tr>
        </thead>
        <tbody>
          ${MOCK_EVENT_ROI.map(e => `
            <tr>
              <td style="font-weight:700">${e.name}</td>
              <td>${e.ticketsSold} / ${e.capacity}</td>
              <td style="color:var(--teal);font-weight:700">${e.rev}</td>
              <td style="color:var(--text-muted)">${e.cost}</td>
              <td><span class="card-badge teal">${e.margin}</span></td>
              <td style="font-weight:800;color:var(--primary-light)">${e.roi}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (summary) {
    summary.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div class="enrichment-stat-item"><span class="enrichment-stat-label">Total Events Financial Yield</span><span class="enrichment-stat-val" style="color:var(--teal)">৳14,91,000</span></div>
        <div class="enrichment-stat-item"><span class="enrichment-stat-label">Total Program Expenses</span><span class="enrichment-stat-val" style="color:var(--text-muted)">৳7,05,000</span></div>
        <div class="enrichment-stat-item"><span class="enrichment-stat-label">Net Surplus Generated</span><span class="enrichment-stat-val" style="color:var(--green)">+৳7,86,000</span></div>
        <div class="enrichment-stat-item"><span class="enrichment-stat-label">Average Event ROI</span><span class="enrichment-stat-val" style="color:var(--primary-light)">2.18x</span></div>
      </div>
    `;
  }
}

// ─── 3. REQ-14: NID & BRC AES-256 ENCRYPTED VAULT ───────────

// ─── IDENTITY VAULT PANEL (REQ-14) ───
async function renderNIDVaultPanel() {
  const el = document.getElementById('nid-vault-panel');
  if (!el) return;

  const data = await API.getVault();
  if (apiFailed(data)) {
    el.innerHTML = renderErrorState(data?.error || 'Could not load the identity vault.', 'renderNIDVaultPanel()');
    return;
  }

  const banner = data.encryptionEnabled
    ? `<div class="vault-banner ok">🔐 AES-256-GCM encryption active. Values are decryptable only with a logged reason.</div>`
    : `<div class="vault-banner warn">⚠ ENCRYPTION_KEY is not configured — the vault is refusing to store identity data.</div>`;

  el.innerHTML = `
    ${banner}
    <div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="showStoreIdentityModal()">➕ Encrypt a field</button>
      <button class="btn btn-ghost btn-sm" onclick="showVaultAccessLogs()">📜 Access log</button>
    </div>
    ${data.entries.length === 0
      ? renderEmptyState('🔐', 'No identity fields stored', 'Encrypted NID / BRC records will be listed here, masked.')
      : `<div style="display:flex;flex-direction:column;gap:8px">
          ${data.entries.map(v => `
            <div class="vault-row">
              <div class="vault-icon">🪪</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13px">${escapeHtml(v.owner_name)}</div>
                <div style="font-size:12px;color:var(--text-secondary)">
                  ${escapeHtml(v.field_type.toUpperCase())} · <span style="font-family:monospace">•••• •••• ${escapeHtml(v.last_four || '••••')}</span>
                </div>
              </div>
              <button class="btn btn-sm btn-outline" onclick="decryptVaultField(${v.id}, '${escapeHtml(v.owner_name).replace(/'/g, '&#39;')}')">🔓 Decrypt</button>
            </div>`).join('')}
        </div>`}
  `;
}



// ─── 4. BULK USER IMPORT & AUTOMATIC PROFILE CREATION ENGINE ──
// Import audit rows, loaded from PostgreSQL by loadImportHistory().
let importHistory = [];

// Fetches the audit trail then re-renders the panel with the real rows.
async function loadImportHistory() {
  const rows = await API.getImportHistory();
  if (rows === null) return;
  importHistory = rows;
  renderBulkImportPanel();
}

let currentImportState = {
  step: 1,
  filename: '',
  strategy: 'temp12345',
  dupResolution: 'update',   // retain data by enriching existing profiles
  totalRows: 0,
  headers: [],        // raw CSV header cells
  rawRows: [],        // raw CSV data cells
  mapping: [],        // per-column system field key (or 'ignore')
  validRecords: [],
  invalidRecords: [],
  duplicateRecords: [],
  lastResult: null
};

function downloadSampleImportCSV() {
  const headers = [
    'FullName', 'StudentID', 'RollNumber', 'RegistrationNumber', 'Batch', 'PassingYear', 'Department', 'Program', 'Section',
    'CGPA', 'CurrentStatus', 'Degree', 'GraduationDate', 'CurrentCompany', 'JobTitle', 'Industry', 'EmploymentStatus',
    'YearsExperience', 'Skills', 'LinkedIn', 'Portfolio', 'Email', 'MobileNumber', 'AltPhone', 'DateOfBirth', 'Gender',
    'BloodGroup', 'PresentAddress', 'PermanentAddress', 'Hometown', 'District', 'Country', 'Facebook', 'GitHub', 'Twitter',
    'EmergencyName', 'EmergencyPhone', 'EmergencyRelation', 'AreasOfExpertise', 'CanMentor', 'LookingForJob', 'Hiring', 'Networking'
  ];
  
  const sampleRow1 = [
    'Rafiqul Islam', 'DIC-2020-101', '101', 'REG-2020-001', '2020', '2020', 'CSE', 'BSc CSE', 'A',
    '3.85', 'Alumni', 'BSc CSE', '2020-12-15', 'Brain Station 23', 'Software Engineer', 'Technology', 'Full-time',
    '4', 'React; Node.js; AWS', 'https://linkedin.com/in/rafiqul', 'https://rafiqul.dev', 'rafiqul@gmail.com', '+8801711223344', '+8801811223344', '1998-05-12', 'Male',
    'O+', 'Dhanmondi, Dhaka', 'Comilla', 'Comilla', 'Dhaka', 'Bangladesh', 'https://fb.com/rafiqul', 'https://github.com/rafiqul', 'https://x.com/rafiqul',
    'Abul Islam', '+8801911223344', 'Father', 'Software Architecture; Cloud', 'Yes', 'No', 'Yes', 'Yes'
  ];

  const sampleRow2 = [
    'Nusrat Jahan Rima', 'DIC-2020-102', '102', 'REG-2020-002', '2020', '2020', 'SWE', 'BSc SWE', 'B',
    '3.92', 'Alumni', 'BSc SWE', '2020-12-15', 'Pathao', 'Data Analyst', 'Tech', 'Full-time',
    '3', 'Python; SQL; Tableau', 'https://linkedin.com/in/nusrat', 'https://nusrat.io', 'nusrat.rima@gmail.com', '+8801722334455', '', '1999-02-20', 'Female',
    'AB+', 'Gulshan, Dhaka', 'Noakhali', 'Noakhali', 'Dhaka', 'Bangladesh', '', 'https://github.com/nusrat', '',
    'Mariam Begum', '+8801922334455', 'Mother', 'Data Science; Machine Learning', 'Yes', 'Yes', 'No', 'Yes'
  ];

  const csvContent = "data:text/csv;charset=utf-8," 
    + headers.join(",") + "\n" 
    + sampleRow1.join(",") + "\n" 
    + sampleRow2.join(",");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "sample_alumni_import_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('📥 Downloaded sample_alumni_import_template.csv');
}

function renderBulkImportPanel() {
  const el = document.getElementById('bulk-import-panel');
  if (!el) return;

  el.innerHTML = `
    <div class="glass-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">📥 Bulk User Import &amp; Automatic Profile Generation</h3>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:2px">Upload CSV or Excel files to import hundreds of student/alumni records simultaneously with automated login accounts &amp; email notifications.</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="downloadSampleImportCSV()">📄 Download CSV Template</button>
      </div>

      <!-- WIZARD STEPS INDICATOR -->
      <div class="import-wizard-steps">
        <div class="wizard-step-item ${currentImportState.step === 1 ? 'active' : ''}">
          <span class="wizard-step-num">1</span> 📁 Upload File
        </div>
        <div class="wizard-step-item ${currentImportState.step === 2 ? 'active' : ''}">
          <span class="wizard-step-num">2</span> 🔍 Validation Engine
        </div>
        <div class="wizard-step-item ${currentImportState.step === 3 ? 'active' : ''}">
          <span class="wizard-step-num">3</span> ⚡ Preview &amp; Duplicates
        </div>
        <div class="wizard-step-item ${currentImportState.step === 4 ? 'active' : ''}">
          <span class="wizard-step-num">4</span> 🎉 Accounts Created
        </div>
      </div>

      <div id="wizard-step-container">
        ${renderWizardStepContent()}
      </div>
    </div>

    <!-- HISTORICAL IMPORT AUDIT LOG -->
    <div class="glass-card mt-16">
      <div class="card-header">
        <h3 class="card-title">📜 Import Activity History &amp; Audit Trail</h3>
        <span class="card-badge teal">Write-Once System Log</span>
      </div>
      <div class="table-scroll">
        <table class="rbac-table">
          <thead>
            <tr><th>Batch ID</th><th>Filename</th><th>Total Records</th><th>Successful</th><th>Failed</th><th>Duplicates</th><th>Date &amp; Admin</th><th>Speed</th></tr>
          </thead>
          <tbody>
            ${importHistory.map(h => `
              <tr>
                <td><strong>${escapeHtml(h.batch_code)}</strong></td>
                <td>📄 ${escapeHtml(h.filename)}</td>
                <td>${h.total_records}</td>
                <td><span class="card-badge teal">${h.success_count}</span></td>
                <td>${h.failed_count > 0 ? `<span class="card-badge amber">${h.failed_count}</span>` : '0'}</td>
                <td>${h.duplicate_count}</td>
                <td>${formatDate(h.created_at)} (${escapeHtml(h.admin_name)})</td>
                <td>${escapeHtml(h.processing_time)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderWizardStepContent() {
  if (currentImportState.step === 1) {
    return `
      <input type="file" id="import-file-input" accept=".csv,text/csv" style="display:none"
             onchange="handleImportFileSelected(this)" />
      <div class="dropzone" onclick="document.getElementById('import-file-input').click()">
        <div class="dropzone-icon">📄</div>
        <div class="dropzone-title">Click to choose a CSV file</div>
        <div class="dropzone-sub">Headers are detected and mapped automatically. Timestamp and
          &ldquo;Commicate with&rdquo; are excluded by default.</div>
      </div>

      <div class="field-grid-2" style="margin-top:16px">
        <div class="input-group">
          <label class="input-label">Initial Password Policy</label>
          <select class="form-select" id="password-strategy-select" onchange="currentImportState.strategy = this.value">
            <option value="temp12345">Shared temporary password (12345678)</option>
          </select>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
            Stored as a scrypt hash. Every imported account is flagged to change it on first login.
          </div>
        </div>
        <div class="input-group">
          <label class="input-label">If an account already exists</label>
          <select class="form-select" onchange="currentImportState.dupResolution = this.value">
            <option value="update">Update / enrich the existing profile (recommended)</option>
            <option value="skip">Skip the duplicate</option>
          </select>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
            Matched on email address, then mobile number.
          </div>
        </div>
      </div>

      <button class="btn btn-outline btn-full mt-16" onclick="downloadSampleImportCSV()">📥 Download a sample template</button>
    `;
  }

  // Column-mapping review — the administrator confirms every header before import.
  if (currentImportState.step === 'mapping') {
    const { headers, mapping, rawRows, totalRows, filename } = currentImportState;
    const mappedCount = mapping.filter(m => m !== 'ignore').length;
    const ignoredCount = mapping.filter(m => m === 'ignore').length;
    const hasName = mapping.includes('name');
    const hasEmail = mapping.includes('email');

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div style="font-weight:700;font-size:14px">📄 ${escapeHtml(filename)} — ${totalRows} rows, ${headers.length} columns</div>
        <button class="btn btn-outline btn-sm" onclick="resetImportWizard()">← Choose a different file</button>
      </div>

      <div class="validation-summary-bar mb-16">
        <div class="vstat-card"><div class="vstat-num">${totalRows}</div><div class="vstat-label">Rows</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--teal)">${mappedCount}</div><div class="vstat-label">Mapped</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--text-muted)">${ignoredCount}</div><div class="vstat-label">Excluded</div></div>
      </div>

      ${(!hasName || !hasEmail) ? `<div class="login-error" style="margin-bottom:12px">Full Name and Email must both be mapped before importing.</div>` : ''}

      <div class="mapping-list">
        ${headers.map((h, i) => {
          const sample = ((rawRows[0] && rawRows[0][i]) || '').trim().slice(0, 40);
          const isIgnored = mapping[i] === 'ignore';
          return `
          <div class="mapping-row${isIgnored ? ' excluded' : ''}">
            <div class="mapping-col">
              <div class="mapping-header">${escapeHtml(h)}</div>
              <div class="mapping-sample">${sample ? 'e.g. ' + escapeHtml(sample) : 'empty'}</div>
            </div>
            <div class="mapping-arrow">→</div>
            <select class="form-select" onchange="setImportMapping(${i}, this.value)">
              ${IMPORT_FIELDS.map(f => `<option value="${f.key}" ${mapping[i] === f.key ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
            </select>
          </div>`;
        }).join('')}
      </div>

      <button class="btn btn-primary btn-full mt-16" ${(!hasName || !hasEmail) ? 'disabled' : ''}
              onclick="validateImportRows()">✓ Confirm mapping and validate ${totalRows} rows</button>
    `;
  }

  if (currentImportState.step === 2 || currentImportState.step === 3) {
    const validCount = currentImportState.validRecords.length;
    const invalidCount = currentImportState.invalidRecords.length;
    const dupCount = currentImportState.duplicateRecords.length;

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-weight:700;font-size:14px;color:var(--text-primary)">
          📄 Parsed File: <strong>"${currentImportState.filename}"</strong> (${currentImportState.totalRows} Total Records)
        </div>
        <button class="btn btn-outline btn-sm" onclick="resetImportWizard()">← Upload Different File</button>
      </div>

      <!-- VALIDATION STATS -->
      <div class="validation-summary-bar">
        <div class="vstat-card"><div class="vstat-num">${currentImportState.totalRows}</div><div class="vstat-label">Total Rows</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--teal)">${validCount}</div><div class="vstat-label">Valid Records</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--amber)">${dupCount}</div><div class="vstat-label">Duplicates Found</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--red)">${invalidCount}</div><div class="vstat-label">Validation Errors</div></div>
      </div>

      <!-- DUPLICATE RESOLUTION STRATEGY -->
      ${dupCount > 0 ? `
        <div class="duplicate-strategy-box">
          <div style="font-weight:700;color:var(--amber);margin-bottom:6px">⚠️ ${dupCount} Duplicate Records Detected (Priority: StudentID &gt; Roll &gt; Email &gt; Phone)</div>
          <div style="display:flex;gap:16px;font-size:12px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="dup-strat" value="skip" checked onchange="currentImportState.dupResolution = this.value" />
              <span>Skip Duplicates (Recommended)</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="dup-strat" value="update" onchange="currentImportState.dupResolution = this.value" />
              <span>Update Existing Profiles</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="dup-strat" value="merge" onchange="currentImportState.dupResolution = this.value" />
              <span>Merge Records</span>
            </label>
          </div>
        </div>
      ` : ''}

      <!-- PREVIEW TABLE -->
      <div class="table-scroll" style="max-height:260px">
        <table class="rbac-table">
          <thead>
            <tr><th>Row</th><th>Full Name</th><th>Student ID</th><th>Email</th><th>Passing Year</th><th>Dept</th><th>Status</th><th>Validation Message</th></tr>
          </thead>
          <tbody>
            ${currentImportState.validRecords.map(r => `
              <tr>
                <td>#${r.row}</td>
                <td><strong>${r.name}</strong></td>
                <td>${r.studentId}</td>
                <td>${r.email}</td>
                <td>${r.year}</td>
                <td>${r.dept}</td>
                <td><span class="card-badge teal">Valid</span></td>
                <td style="color:var(--teal);font-size:11px">✓ Ready for Account Creation</td>
              </tr>
            `).join('')}
            ${currentImportState.duplicateRecords.map(r => `
              <tr>
                <td>#${r.row}</td>
                <td><strong>${r.name}</strong></td>
                <td>${r.studentId}</td>
                <td>${r.email}</td>
                <td>${r.year}</td>
                <td>${r.dept}</td>
                <td><span class="card-badge amber">Duplicate</span></td>
                <td style="color:var(--amber);font-size:11px">⚠ Matches existing alumni ID ${r.studentId}</td>
              </tr>
            `).join('')}
            ${currentImportState.invalidRecords.map(r => `
              <tr>
                <td>#${r.row}</td>
                <td><strong>${r.name || 'N/A'}</strong></td>
                <td>${r.studentId || 'Missing'}</td>
                <td>${r.email || 'Missing'}</td>
                <td>${r.year || 'N/A'}</td>
                <td>${r.dept || 'N/A'}</td>
                <td><span class="card-badge red">Invalid</span></td>
                <td style="color:var(--red);font-size:11px">❌ ${r.errorMsg}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
        ${invalidCount > 0 ? `
          <button class="btn btn-outline btn-sm" onclick="downloadImportErrorReportCSV()">📥 Download Error Report (${invalidCount} rows)</button>
        ` : '<div></div>'}
        <button class="btn btn-primary" onclick="executeBulkImportProcess()">🚀 Confirm &amp; Create ${validCount} Accounts →</button>
      </div>
    `;
  }

  if (currentImportState.step === 4) {
    return `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:48px;margin-bottom:8px">🎉</div>
        <h2 style="color:var(--teal);font-size:22px;font-weight:800">Bulk Import &amp; Profile Generation Complete!</h2>
        <p style="color:var(--text-secondary);font-size:13px;max-width:500px;margin:8px auto 20px">
          Successfully created <strong>${currentImportState.validRecords.length} User Accounts &amp; Alumni Profiles</strong> in the database. Account activation emails &amp; temporary credentials have been dispatched.
        </p>

        <div style="display:inline-flex;gap:12px;justify-content:center">
          <button class="btn btn-primary" onclick="showPage('directory')">◉ View Alumni Directory</button>
          <button class="btn btn-outline" onclick="resetImportWizard()">📥 Import Another File</button>
        </div>
      </div>
    `;
  }
}



function resetImportWizard() {
  Object.assign(currentImportState, {
    step: 1, filename: '', totalRows: 0,
    headers: [], rawRows: [], mapping: [],
    validRecords: [], invalidRecords: [], duplicateRecords: [], lastResult: null
  });
  const input = document.getElementById('import-file-input');
  if (input) input.value = '';
  renderBulkImportPanel();
}

function downloadImportErrorReportCSV() {
  const headers = ['RowNumber', 'Name', 'StudentID', 'Email', 'ErrorType', 'SuggestedFix'];
  const rows = currentImportState.invalidRecords.map(r => [
    r.row, `"${r.name || ''}"`, `"${r.studentId || ''}"`, `"${r.email || ''}"`, `"${r.errorMsg}"`, '"Provide required valid Student ID, Email, and Full Name"'
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "bulk_import_error_report.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('📥 Downloaded bulk_import_error_report.csv');
}

// Sends the parsed rows to POST /api/bulk-import, which inserts real users +
// alumni_profiles and writes an import_history audit row. This previously
// pushed objects into an in-memory array, which is why import_history stayed
// empty even though the endpoint worked.
async function executeBulkImportProcess() {
  currentImportState.step = 4;

  // Maximum retention: send the in-file duplicates as well. The server matches
  // them to the existing account and enriches that profile instead of dropping
  // the second submission on the floor.
  const records = [...currentImportState.validRecords, ...currentImportState.duplicateRecords];
  const startedAt = Date.now();

  showToast(`⏳ Importing ${records.length} record${records.length === 1 ? '' : 's'} into PostgreSQL…`);

  const result = await API.postBulkImport({
    records,
    filename: currentImportState.filename,
    adminName: state.currentUser ? state.currentUser.name : 'Admin',
    dupResolution: currentImportState.dupResolution,
    failedCount: currentImportState.invalidRecords.length,
    duplicateCount: currentImportState.duplicateRecords.length,
    processingTime: `${((Date.now() - startedAt) / 1000).toFixed(1)}s`
  });

  if (!result || result.error) {
    currentImportState.step = 3;
    renderBulkImportPanel();
    showToast(`⚠ Import failed: ${result?.error || 'the server did not respond.'}`);
    return;
  }

  // Keep the server's own tallies — the client's in-file counts do not include
  // duplicates found against existing accounts.
  currentImportState.lastResult = result;

  loadImportHistory(); // re-renders the panel including the new audit row
  showToast(`🎉 Import complete — ${result.created} created, ${result.updated} updated, ` +
            `${result.skipped} duplicates skipped, ${result.rejected} rejected.`);

  // Reflect the new alumni immediately wherever they appear.
  state.directory.offset = 0;
  renderAlumniGrid();
}

// ─── 5. ADMIN DYNAMIC CUSTOM FIELD MANAGER ───────────────────
let MOCK_CUSTOM_FIELDS = [
  { id: 'cf_1', label: 'Research Publications', section: 'academic', type: 'text', required: false },
  { id: 'cf_2', label: 'Scholarship / Award Name', section: 'academic', type: 'text', required: false },
  { id: 'cf_3', label: 'Startup Pitch Deck / Video Link', section: 'networking', type: 'url', required: false }
];

// ─── CUSTOM FIELDS ───
async function renderCustomFieldManager() {
  const el = document.getElementById('custom-field-manager');
  if (!el) return;

  const fields = await API.getCustomFields();
  if (apiFailed(fields)) {
    el.innerHTML = renderErrorState(fields?.error || 'Could not load custom fields.', 'renderCustomFieldManager()');
    return;
  }

  el.innerHTML = `
    <form onsubmit="handleCreateCustomField(event)" class="custom-field-form">
      <div class="field-grid-2">
        <div class="input-group"><label class="input-label">Field Label</label>
          <input type="text" id="cf-label" class="form-input" placeholder="e.g. LinkedIn Headline" required /></div>
        <div class="input-group"><label class="input-label">Section</label>
          <select id="cf-section" class="form-select">
            <option value="academic">Academic</option><option value="professional">Professional</option>
            <option value="contact">Contact</option><option value="personal">Personal</option>
          </select></div>
      </div>
      <div class="field-grid-2">
        <div class="input-group"><label class="input-label">Field Type</label>
          <select id="cf-type" class="form-select">
            <option value="text">Text</option><option value="number">Number</option>
            <option value="date">Date</option><option value="select">Dropdown</option>
            <option value="url">URL</option>
          </select></div>
        <div class="input-group" style="display:flex;align-items:flex-end">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;min-height:48px;cursor:pointer">
            <input type="checkbox" id="cf-required" /> Required field
          </label></div>
      </div>
      <button type="submit" class="btn btn-primary btn-full">➕ Add Custom Field</button>
    </form>
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">
      ${fields.length ? fields.map(f => `
        <div class="custom-field-row">
          <div class="vault-icon">🧩</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">${escapeHtml(f.label)}${f.is_required ? ' <span style="color:var(--red)">*</span>' : ''}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(f.section)} · ${escapeHtml(f.field_type)} · <span style="font-family:monospace;font-size:11px">${escapeHtml(f.id)}</span></div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="deleteCustomField('${escapeHtml(f.id)}', '${escapeHtml(f.label).replace(/'/g, '&#39;')}')">🗑</button>
        </div>`).join('')
      : renderEmptyState('🧩', 'No custom fields yet', 'Add schema fields without a code change.')}
    </div>`;
}

async function handleCreateCustomField(e) {
  if (e) e.preventDefault();
  const res = await API.createCustomField({
    label: document.getElementById('cf-label').value.trim(),
    section: document.getElementById('cf-section').value,
    fieldType: document.getElementById('cf-type').value,
    isRequired: document.getElementById('cf-required').checked
  });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not create the field.'}`); return; }
  showToast(`✅ Custom field "${res.label}" added.`);
  renderCustomFieldManager();
}

async function deleteCustomField(id, label) {
  if (!confirm(`Delete the custom field "${label}"?`)) return;
  const res = await API.deleteCustomFieldApi(id);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not delete.'}`); return; }
  showToast('🗑 Custom field deleted.');
  renderCustomFieldManager();
}

// ─── 6. COMPREHENSIVE 10-SECTION USER PROFILE HUB ─────────────
let PROFILE_PRIVACY_SETTINGS = {
  mobile: 'private',
  email: 'alumni',
  address: 'private',
  cgpa: 'private',
  linkedin: 'public',
  github: 'public',
  company: 'public'
};

let FULL_USER_PROFILE = {
  // Basic
  fullName: 'Mohiuddin Rahman',
  nickname: 'Mohi',
  studentId: 'DIC-2020-0847',
  rollNumber: '847',
  registrationNumber: 'REG-2020-0847',
  batch: 2020,
  passingYear: 2020,
  department: 'Computer Science & Engineering',
  program: 'BSc CSE',
  section: 'A',
  currentStatus: 'Alumni & Tech Lead',
  dob: '1998-08-14',
  gender: 'Male',
  bloodGroup: 'O+',
  bio: 'Full-stack software architect specializing in cloud systems, React, Node.js, and enterprise security. Passionate about empowering DIC alumni.',

  // Contact
  primaryEmail: 'mohiuddin@dic.edu.bd',
  secondaryEmail: 'mohiuddin.dev@gmail.com',
  mobileNumber: '+880 1712-345678',
  altMobile: '+880 1812-345678',
  emergencyName: 'Abdur Rahman',
  emergencyPhone: '+880 1912-345678',
  emergencyRelation: 'Father',

  // Address
  presentAddress: 'House 42, Road 11, Dhanmondi, Dhaka-1209',
  permanentAddress: 'Village: Uttarpara, Upazila: Sadar',
  hometown: 'Comilla',
  city: 'Dhaka',
  district: 'Comilla',
  division: 'Chittagong',
  country: 'Bangladesh',
  postalCode: '1209',

  // Academic
  institution: 'Daffodil International College',
  degree: 'Bachelor of Science in Computer Science & Engineering',
  cgpa: '3.92 / 4.00',
  admissionYear: 2016,
  clubs: 'DIC Computer Club (President 2019), Robotics Club',
  scholarship: 'DIC Chairman Merit Scholarship (100% Waiver)',
  awards: '1st Runner Up - National Collegiate Programming Contest 2019',
  publications: 'AI-Based Crop Disease Detection (IEEE 2020)',

  // Professional
  currentCompany: 'Brain Station 23',
  jobTitle: 'Senior Software Engineer',
  employmentType: 'Full-time',
  industry: 'Software & Information Technology',
  yearsExperience: '5 Years',
  skills: 'React, Node.js, TypeScript, PostgreSQL, AWS, Docker, Microservices',
  certifications: 'AWS Certified Solutions Architect, Certified Kubernetes Administrator (CKA)',

  // Networking
  lookingForJob: false,
  hiring: true,
  canMentor: true,
  lookingForMentor: false,
  collaboration: true,

  // Social
  linkedin: 'https://linkedin.com/in/mohiuddin-rahman',
  facebook: 'https://facebook.com/mohiuddin.dic',
  github: 'https://github.com/mohiuddin-dic',
  twitter: 'https://x.com/mohiuddin_dev',
  website: 'https://mohiuddin.dev'
};

function render10SectionProfile(filterSection = 'all') {
  const container = document.getElementById('profile-hub-content');
  if (!container) return;

  const p = FULL_USER_PROFILE;
  const priv = PROFILE_PRIVACY_SETTINGS;

  let html = '';

  // 1. BASIC INFO
  if (filterSection === 'all' || filterSection === 'basic') {
    html += `
      <div class="profile-section-card">
        <div class="profile-section-header">
          <div class="profile-section-title">👤 Section 1: Basic &amp; Academic Identity</div>
          <span class="privacy-badge public">🌐 Public</span>
        </div>
        <div class="field-grid-3 mb-16">
          <div class="profile-field-row"><div><div class="field-label">Full Name</div><div class="field-val">${p.fullName}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Nickname</div><div class="field-val">${p.nickname}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Student ID</div><div class="field-val">${p.studentId}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Roll &amp; Reg No</div><div class="field-val">${p.rollNumber} / ${p.registrationNumber}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Batch &amp; Dept</div><div class="field-val">Batch ${p.batch} · ${p.department}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Status &amp; Gender</div><div class="field-val">${p.currentStatus} · ${p.gender} (${p.bloodGroup})</div></div></div>
        </div>
        <div class="profile-field-row"><div><div class="field-label">Biography</div><div class="field-val">${p.bio}</div></div></div>
      </div>
    `;
  }

  // 2. CONTACT & EMERGENCY
  if (filterSection === 'all' || filterSection === 'contact') {
    html += `
      <div class="profile-section-card">
        <div class="profile-section-header">
          <div class="profile-section-title">📱 Section 2: Contact &amp; Emergency Details</div>
          <span class="privacy-badge ${priv.mobile}">${priv.mobile === 'private' ? '🔒 Private' : '🌐 Public'}</span>
        </div>
        <div class="field-grid-2 mb-16">
          <div class="profile-field-row"><div><div class="field-label">Primary Email</div><div class="field-val">${p.primaryEmail}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Secondary Email</div><div class="field-val">${p.secondaryEmail}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Mobile Number</div><div class="field-val">${p.mobileNumber}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Emergency Contact</div><div class="field-val">${p.emergencyName} (${p.emergencyRelation}) — ${p.emergencyPhone}</div></div></div>
        </div>
      </div>
    `;
  }

  // 3. ADDRESS & LOCATION
  if (filterSection === 'all' || filterSection === 'location') {
    html += `
      <div class="profile-section-card">
        <div class="profile-section-header">
          <div class="profile-section-title">📍 Section 3: Address &amp; Geographical Location</div>
          <span class="privacy-badge ${priv.address}">${priv.address === 'private' ? '🔒 Private' : '👥 Alumni Only'}</span>
        </div>
        <div class="field-grid-2 mb-16">
          <div class="profile-field-row"><div><div class="field-label">Present Address</div><div class="field-val">${p.presentAddress}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Permanent Address</div><div class="field-val">${p.permanentAddress}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Hometown &amp; District</div><div class="field-val">${p.hometown}, ${p.district}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Country &amp; Zip</div><div class="field-val">${p.country} (${p.postalCode})</div></div></div>
        </div>
      </div>
    `;
  }

  // 4. ACADEMIC RECORD
  if (filterSection === 'all' || filterSection === 'academic') {
    html += `
      <div class="profile-section-card">
        <div class="profile-section-header">
          <div class="profile-section-title">🎓 Section 4: Academic Honors &amp; Publications</div>
          <span class="privacy-badge alumni">👥 Alumni Only</span>
        </div>
        <div class="field-grid-2 mb-16">
          <div class="profile-field-row"><div><div class="field-label">Degree &amp; CGPA</div><div class="field-val">${p.degree} (CGPA: ${p.cgpa})</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Scholarship &amp; Awards</div><div class="field-val">${p.scholarship}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Clubs &amp; Societies</div><div class="field-val">${p.clubs}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Research Publications</div><div class="field-val">${p.publications}</div></div></div>
        </div>
      </div>
    `;
  }

  // 5. PROFESSIONAL INFO
  if (filterSection === 'all' || filterSection === 'professional') {
    html += `
      <div class="profile-section-card">
        <div class="profile-section-header">
          <div class="profile-section-title">💼 Section 5: Professional Career &amp; Experience</div>
          <span class="privacy-badge public">🌐 Public</span>
        </div>
        <div class="field-grid-2 mb-16">
          <div class="profile-field-row"><div><div class="field-label">Current Company &amp; Role</div><div class="field-val">${p.currentCompany} — ${p.jobTitle}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Industry &amp; Experience</div><div class="field-val">${p.industry} (${p.yearsExperience})</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Technical Skills</div><div class="field-val">${p.skills}</div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Certifications</div><div class="field-val">${p.certifications}</div></div></div>
        </div>
      </div>
    `;
  }

  // 6. NETWORKING & HIRING
  if (filterSection === 'all' || filterSection === 'networking') {
    html += `
      <div class="profile-section-card">
        <div class="profile-section-header">
          <div class="profile-section-title">🤝 Section 6: Networking &amp; Mentorship Status</div>
          <span class="privacy-badge public">🌐 Public</span>
        </div>
        <div class="verification-badges-grid mb-16">
          <span class="verify-pill" style="background:rgba(0,168,89,0.2)">✓ Open for Mentoring Students</span>
          <span class="verify-pill" style="background:rgba(0,212,170,0.2)">✓ Actively Hiring at Brain Station 23</span>
          <span class="verify-pill">✓ Available for Startup Collaboration</span>
        </div>
      </div>
    `;
  }

  // 7. SOCIAL PROFILES
  if (filterSection === 'all' || filterSection === 'social') {
    html += `
      <div class="profile-section-card">
        <div class="profile-section-header">
          <div class="profile-section-title">🌐 Section 7: Social Profiles &amp; Portfolio</div>
          <span class="privacy-badge public">🌐 Public</span>
        </div>
        <div class="field-grid-2 mb-16">
          <div class="profile-field-row"><div><div class="field-label">LinkedIn</div><div class="field-val"><a href="${p.linkedin}" target="_blank" style="color:var(--teal)">${p.linkedin}</a></div></div></div>
          <div class="profile-field-row"><div><div class="field-label">GitHub</div><div class="field-val"><a href="${p.github}" target="_blank" style="color:var(--teal)">${p.github}</a></div></div></div>
          <div class="profile-field-row"><div><div class="field-label">Personal Portfolio</div><div class="field-val"><a href="${p.website}" target="_blank" style="color:var(--teal)">${p.website}</a></div></div></div>
        </div>
      </div>
    `;
  }

  // 8. CUSTOM FIELDS (ADMIN CREATED)
  if (filterSection === 'all' || filterSection === 'custom') {
    if (MOCK_CUSTOM_FIELDS.length > 0) {
      html += `
        <div class="profile-section-card">
          <div class="profile-section-header">
            <div class="profile-section-title">⚙ Section 8: Admin Custom Institution Fields</div>
            <span class="privacy-badge alumni">👥 DIC Portal Only</span>
          </div>
          <div class="field-grid-2 mb-16">
            ${MOCK_CUSTOM_FIELDS.map(f => `
              <div class="profile-field-row">
                <div>
                  <div class="field-label">${f.label}</div>
                  <div class="field-val">IEEE Research Paper / National Award 2020</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  container.innerHTML = html;
}

function switchProfileHubSection(sectionTag, btn) {
  document.querySelectorAll('.profile-hub-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  render10SectionProfile(sectionTag);
}

// ─── 7. FULL PROFILE EDITOR MODAL ───────────────────────────
function showEditProfileV2() {
  const p = FULL_USER_PROFILE;
  openModal(`
    <div class="onboarding-header">
      <div class="onboarding-title">✎ Edit Comprehensive Profile</div>
      <div class="onboarding-sub">Update your 10-section profile details and field privacy settings</div>
    </div>

    <form onsubmit="handleSaveProfileV2(event)" style="display:flex;flex-direction:column;gap:14px;margin-top:14px;max-height:60vh;overflow-y:auto;padding-right:6px">
      <div class="input-group"><label class="input-label">Full Name</label><input type="text" id="edit-fullname" class="form-input" value="${p.fullName}" required /></div>
      <div class="input-group"><label class="input-label">Current Company &amp; Job Title</label><input type="text" id="edit-company" class="form-input" value="${p.currentCompany}" required /></div>
      <div class="input-group"><label class="input-label">Technical Skills (Comma separated)</label><input type="text" id="edit-skills" class="form-input" value="${p.skills}" required /></div>
      <div class="input-group"><label class="input-label">LinkedIn Profile URL</label><input type="url" id="edit-linkedin" class="form-input" value="${p.linkedin}" /></div>
      <div class="input-group"><label class="input-label">Mobile Number Privacy Level</label>
        <select class="form-select" id="edit-priv-mobile">
          <option value="public" ${PROFILE_PRIVACY_SETTINGS.mobile === 'public' ? 'selected' : ''}>🌐 Public (Everyone)</option>
          <option value="alumni" ${PROFILE_PRIVACY_SETTINGS.mobile === 'alumni' ? 'selected' : ''}>👥 DIC Alumni Only</option>
          <option value="private" ${PROFILE_PRIVACY_SETTINGS.mobile === 'private' ? 'selected' : ''}>🔒 Private (Only Me)</option>
        </select>
      </div>
      <div class="input-group"><label class="input-label">Biography</label><textarea id="edit-bio" class="form-input" rows="3">${p.bio}</textarea></div>
      <button type="submit" class="btn btn-primary btn-full mt-16">💾 Save Profile &amp; Update ID Card</button>
    </form>
  `);
}

function handleSaveProfileV2(e) {
  e.preventDefault();
  FULL_USER_PROFILE.fullName = document.getElementById('edit-fullname').value.trim();
  FULL_USER_PROFILE.currentCompany = document.getElementById('edit-company').value.trim();
  FULL_USER_PROFILE.skills = document.getElementById('edit-skills').value.trim();
  FULL_USER_PROFILE.linkedin = document.getElementById('edit-linkedin').value.trim();
  FULL_USER_PROFILE.bio = document.getElementById('edit-bio').value.trim();
  PROFILE_PRIVACY_SETTINGS.mobile = document.getElementById('edit-priv-mobile').value;

  closeModal();
  render10SectionProfile();

  // Update Digital ID & topbar name
  const nameEl = document.getElementById('id-card-name');
  if (nameEl) nameEl.textContent = FULL_USER_PROFILE.fullName;
  
  showToast('✅ User Profile & Field Privacy Settings Saved!');
}

// ─── 8. AUDIENCE SEGMENTATION ENGINE (ADMIN) ─────────────────
function renderSegmentationPanel() {
  const el = document.getElementById('segmentation-panel');
  if (!el) return;
  el.innerHTML = `
    <div class="glass-card">
      <div class="card-header">
        <h3 class="card-title">🎯 Advanced Alumni Audience Segmentation</h3>
        <span class="card-badge teal">Real-Time Vector Filtering</span>
      </div>
      <div class="segment-builder">
        <div class="input-group">
          <label class="input-label">Batch Range</label>
          <select class="form-select" onchange="updateSegmentCount()">
            <option value="all">All Batches (2000 - 2026)</option>
            <option value="recent">Recent Graduates (2020 - 2026)</option>
            <option value="senior">Senior Alumni (2000 - 2015)</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label">Industry Domain</label>
          <select class="form-select" onchange="updateSegmentCount()">
            <option value="all">All Domains</option>
            <option value="tech">Software &amp; Technology</option>
            <option value="finance">Banking &amp; Finance</option>
            <option value="business">Business &amp; Entrepreneurship</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label">Donation History</label>
          <select class="form-select" onchange="updateSegmentCount()">
            <option value="all">Any Donor Status</option>
            <option value="donors">Active Donors (FY26)</option>
            <option value="nondonors">Non-Donors</option>
          </select>
        </div>
      </div>
      <div style="margin-top:16px;padding:12px;background:var(--bg-glass);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center">
        <div><strong style="color:var(--teal)">Segment Match:</strong> <span id="segment-count-val">3,420</span> Alumni matched</div>
        <button class="btn btn-primary btn-sm" onclick="showBroadcastModal()">📢 Broadcast to Segment</button>
      </div>
    </div>
  `;
}

function updateSegmentCount() {
  const el = document.getElementById('segment-count-val');
  if (!el) return;
  const count = Math.floor(Math.random() * 2000) + 1500;
  el.textContent = count.toLocaleString() + ' Alumni';
}

// ─── 6. NEWS POLLS & TRENDING TAGS ───────────────────────────

// ─── LIVE POLL ───
async function renderActivePoll() {
  const els = renderTargets('active-poll');
  if (!els.length) return;
  const el = { set innerHTML(v) { els.forEach(e => e.innerHTML = v); } };

  const poll = await API.getActivePoll();
  if (apiFailed(poll)) {
    el.innerHTML = renderErrorState('Could not load the poll.', 'renderActivePoll()');
    return;
  }
  if (!poll) {
    el.innerHTML = renderEmptyState('🗳', 'No active poll');
    return;
  }

  el.innerHTML = `
    <div class="poll-header">
      <div class="poll-title">🗳 Institutional Alumni Poll</div>
      <div class="poll-meta">🟢 Live · ${poll.total} vote${poll.total === 1 ? '' : 's'}</div>
    </div>
    <div class="poll-question-text">${escapeHtml(poll.question)}</div>
    <div class="poll-options">
      ${poll.options.map((o, idx) => {
        const pct = poll.total ? Math.round((poll.counts[idx] / poll.total) * 100) : 0;
        const mine = poll.myVote === idx;
        return `
        <button class="poll-option-btn${mine ? ' voted' : ''}" onclick="votePoll(${poll.id}, ${idx})">
          <div class="poll-option-bar" style="width:${pct}%"></div>
          <span class="poll-option-text">${mine ? '✓ ' : ''}${escapeHtml(o)}</span>
          <span class="poll-option-pct">${pct}%</span>
        </button>`;
      }).join('')}
    </div>
    ${poll.myVote !== null ? '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;text-align:center">Your vote is recorded. Tap another option to change it.</div>' : ''}
  `;
}

async function votePoll(pollId, idx) {
  const res = await API.votePoll(pollId, idx);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Vote failed.'}`); return; }
  showToast('🗳 Your vote has been recorded.');
  renderActivePoll();
}

function renderTrendingTags() {
  const el = document.getElementById('trending-tags');
  if (!el) return;
  const tags = ['#Reunion2026', '#bKashScholarship', '#AITechSymposium', '#BUETPartnership', '#MentorshipDrive'];
  el.innerHTML = `<div class="trending-tag-cloud">${tags.map(t => `<span class="trending-tag" onclick="showToast('Filtering feed for ${t}')">${t}</span>`).join('')}</div>`;
}

function renderPastPolls() {
  const el = document.getElementById('past-polls');
  if (!el) return;
  el.innerHTML = `
    <div style="font-size:12px;color:var(--text-secondary)">
      <div style="padding:6px 0;border-bottom:1px solid var(--border-glass)">
        <div style="font-weight:700">FY26 Mentorship Model</div>
        <div style="font-size:10px;color:var(--teal)">✓ 1-on-1 Matching won (64%)</div>
      </div>
      <div style="padding:6px 0">
        <div style="font-weight:700">Digital ID Card Design</div>
        <div style="font-size:10px;color:var(--teal)">✓ Glassmorphism Dark won (78%)</div>
      </div>
    </div>
  `;
}

// ─── 7. GAMIFICATION & BADGES ────────────────────────────────
function renderEngagementScore() {
  const el = document.getElementById('engagement-score-display');
  if (!el) return;
  el.innerHTML = `
    <div class="engagement-score-display">
      <div class="score-badge-circle">👑</div>
      <div class="score-points">1,840 PTS</div>
      <div class="score-level">Gold Tier Alumni</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Earn points by donating, mentoring, or attending events</div>
    </div>
  `;
}

function renderAlumniBadges() {
  const el = document.getElementById('alumni-badges');
  if (!el) return;
  const badges = [
    { icon: '🤝', title: 'Master Mentor', desc: '5+ active mentees' },
    { icon: '💎', title: 'Top Donor', desc: 'Contributed ৳50k+' },
    { icon: '🎫', title: 'Event Regular', desc: 'Attended 5+ reunions' },
    { icon: '🎓', title: 'SIS Verified', desc: 'Authentic record matched' },
    { icon: '📱', title: 'PWA Early Adopter', desc: 'Mobile app user' },
    { icon: '📢', title: 'Community Champion', desc: 'Referred 10+ alumni' }
  ];
  el.innerHTML = `
    <div class="alumni-badges-grid">
      ${badges.map(b => `
        <div class="badge-card">
          <div class="badge-icon">${b.icon}</div>
          <div class="badge-title">${b.title}</div>
          <div class="badge-desc">${b.desc}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── 8. EVENT WAITLIST MANAGER ───────────────────────────────
const _origFilterEvents = filterEvents;
filterEvents = function(type, btn) {
  if (type === 'waitlist') {
    document.querySelectorAll('.events-tabs .chart-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderEventWaitlist();
  } else {
    if (typeof _origFilterEvents === 'function') _origFilterEvents(type, btn);
  }
};

function renderEventWaitlist() {
  const grid = document.getElementById('events-grid');
  if (!grid) return;
  const waitlist = [
    { name: 'Dr. Kazi Rahman', event: 'Alumni Reunion 2026', pos: '#1', batch: '2014' },
    { name: 'Shirin Sultana', event: 'Alumni Reunion 2026', pos: '#2', batch: '2018' },
    { name: 'Mahmudul Hasan', event: 'AI & Tech Symposium', pos: '#1', batch: '2021' }
  ];
  grid.innerHTML = `
    <div class="glass-card span-3" style="grid-column: span 3">
      <div class="card-header">
        <h3 class="card-title">⏳ Event Capacity Overflow Waitlist</h3>
        <span class="card-badge amber">3 Pending Auto-Promotions</span>
      </div>
      ${waitlist.map(w => `
        <div class="waitlist-item">
          <div>
            <span style="font-weight:700">${w.name}</span>
            <span style="font-size:11px;color:var(--text-muted)"> (${w.event} · Waitlist Position ${w.pos})</span>
          </div>
          <button class="btn btn-sm btn-primary" onclick="showToast('🎟 Promoted ${w.name} from waitlist to confirmed ticket!')">Promote to Ticket →</button>
        </div>
      `).join('')}
    </div>
  `;
}

// ─── 9. MODERATION QUEUE & APPROVAL WORKFLOW ─────────────────
async function renderModerationPanel() {
  const el = document.getElementById('moderation-panel');
  if (!el) return;

  let pendingChapters = [];
  let pendingStories = [];

  if (typeof API !== 'undefined') {
    const queue = await API.getModerationQueue();
    if (queue) {
      pendingChapters = queue.pendingChapters || [];
      pendingStories = queue.pendingStories || [];
    }
  }

  el.innerHTML = `
    <div class="glass-card mb-16">
      <div class="card-header">
        <h3 class="card-title">🏫 Pending Chapter Creation Approvals (${pendingChapters.length})</h3>
        <span class="card-badge ${pendingChapters.length > 0 ? 'amber' : 'teal'}">${pendingChapters.length} Pending Review</span>
      </div>
      ${pendingChapters.length === 0 ? `
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">✓ No pending chapter review requests at this time.</div>
      ` : `
        <div class="table-scroll">
          <table class="rbac-table">
            <thead>
              <tr><th>Icon</th><th>Chapter Name</th><th>Type</th><th>Description</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${pendingChapters.map(c => `
                <tr>
                  <td style="font-size:20px">${c.icon}</td>
                  <td><strong>${c.name}</strong></td>
                  <td><span class="card-badge teal">${c.type}</span></td>
                  <td style="font-size:12px;color:var(--text-secondary)">${c.description || 'No description provided'}</td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-sm btn-primary" onclick="handleModerateChapter(${c.id}, 'approve')">Approve ✓</button>
                      <button class="btn btn-sm btn-danger" onclick="handleModerateChapter(${c.id}, 'reject')">Reject ✕</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <div class="glass-card">
      <div class="card-header">
        <h3 class="card-title">✐ Pending Story &amp; News Approvals (${pendingStories.length})</h3>
        <span class="card-badge ${pendingStories.length > 0 ? 'amber' : 'teal'}">${pendingStories.length} Pending Review</span>
      </div>
      ${pendingStories.length === 0 ? `
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">✓ No pending story moderation requests at this time.</div>
      ` : `
        <div class="table-scroll">
          <table class="rbac-table">
            <thead>
              <tr><th>Emoji</th><th>Headline</th><th>Category</th><th>Author</th><th>Excerpt</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${pendingStories.map(s => `
                <tr>
                  <td style="font-size:20px">${s.emoji || '🌟'}</td>
                  <td><strong>${s.title}</strong></td>
                  <td><span class="card-badge indigo">${s.category}</span></td>
                  <td>${s.author_name}</td>
                  <td style="font-size:12px;color:var(--text-secondary)">${s.excerpt}</td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-sm btn-primary" onclick="handleModerateStory(${s.id}, 'approve')">Approve ✓</button>
                      <button class="btn btn-sm btn-danger" onclick="handleModerateStory(${s.id}, 'reject')">Reject ✕</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

async function handleModerateChapter(id, action) {
  if (typeof API !== 'undefined') {
    await API.moderateChapter(id, action);
  }
  showToast(`✅ Chapter ${action === 'approve' ? 'Approved & Published' : 'Rejected'}`);
  renderModerationPanel();
  renderChapters();
}

async function handleModerateStory(id, action) {
  if (typeof API !== 'undefined') {
    await API.moderateStory(id, action);
  }
  showToast(`✅ Story ${action === 'approve' ? 'Approved & Published to News Feed' : 'Rejected'}`);
  renderModerationPanel();
  renderNewsFeed();
}

// ─── ADMIN SWITCHER UPDATE ───────────────────────────────────
const _origSwitchAdmin = switchAdmin;
switchAdmin = function(tab, btn) {
  document.querySelectorAll('.admin-tabs .chart-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  const sections = ['rbac', 'audit', 'compliance', 'nidvault', 'tenants', 'offlinesync', 'broadcast', 'bulkimport', 'customfields', 'moderation', 'segmentation'];
  sections.forEach(s => {
    const el = document.getElementById(`admin-${s}`);
    if (el) el.classList.add('hidden');
  });

  const target = document.getElementById(`admin-${tab}`);
  if (target) target.classList.remove('hidden');

  if (tab === 'nidvault') renderNIDVaultPanel();
  if (tab === 'bulkimport') renderBulkImportPanel();
  if (tab === 'customfields') renderCustomFieldManager();
  if (tab === 'moderation') renderModerationPanel();
  if (tab === 'segmentation') renderSegmentationPanel();
  if (tab === 'offlinesync') renderOfflineSyncPanel();
  if (tab === 'broadcast') renderBroadcastHistory();
};



/* ============================================================
   v2 ACTION HANDLERS
   Replace the toast-only stubs (buyTicket, applyJob, simulateCheckin,
   acceptRequest, sendBroadcast, exportUserData, downloadReceipt,
   decryptVaultField, showDeleteAccount, downloadEventReport …) with calls
   to the real endpoints.
   ============================================================ */

// ─── EVENT REGISTRATION & TICKETS ───

async function registerForEvent(eventId, title, isFull) {
  showToast(isFull ? '⏳ Joining the waitlist…' : '🎫 Reserving your ticket…');

  // A client mutation id makes an offline replay idempotent server-side.
  const res = await API.registerForEvent(eventId, {
    clientMutationId: `reg-${eventId}-${state.currentUser.id}-${Date.now()}`
  });

  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Registration failed.'}`); return; }

  showToast(res.status === 'waitlisted'
    ? `⏳ "${title}" is full — you are on the waitlist.`
    : `✅ Ticket confirmed for "${title}".`);

  renderEvents(state.eventFilter || 'upcoming');
  renderNotifications();
  if (res.status === 'confirmed') viewMyTicket(eventId);
}

async function cancelTicket(eventId, title) {
  if (!confirm(`Cancel your ticket for "${title}"?`)) return;
  const res = await API.cancelRegistration(eventId);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not cancel.'}`); return; }
  showToast(`✓ Ticket cancelled${res.promoted ? ' — a waitlisted alumnus was promoted.' : '.'}`);
  renderEvents(state.eventFilter || 'upcoming');
}

async function viewMyTicket(eventId) {
  const ticket = await API.getMyTicket(eventId);
  if (apiFailed(ticket) || !ticket) { showToast('⚠ No ticket found for this event.'); return; }

  showModal(`
    <div class="modal-header">
      <div class="modal-title">🎫 Your Ticket</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="text-align:center;padding:8px 0">
      <div id="ticket-qr" style="display:flex;justify-content:center;margin-bottom:14px"></div>
      <div style="font-family:monospace;font-size:15px;font-weight:800;letter-spacing:0.06em;color:var(--teal)">${escapeHtml(ticket.ticket_code)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">
        ${escapeHtml(ticket.status === 'waitlisted' ? 'Waitlisted — you will be notified if a seat opens' : 'Confirmed')}
        ${ticket.checked_in ? ' · ✅ Checked in' : ''}
      </div>
      ${Number(ticket.amount_paid) > 0
        ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Paid ৳${Number(ticket.amount_paid).toLocaleString()}${ticket.payment_gateway ? ` via ${escapeHtml(ticket.payment_gateway)}` : ''}</div>`
        : ''}
      <div style="font-size:11px;color:var(--text-muted);margin-top:14px">Present this QR code at the venue entrance.</div>
    </div>
  `);

  // Render the signed payload as a scannable QR.
  if (typeof QRCode !== 'undefined') {
    try {
      new QRCode(document.getElementById('ticket-qr'), {
        text: ticket.qr_payload, width: 168, height: 168,
        colorDark: '#0B3897', colorLight: '#ffffff'
      });
    } catch (e) {
      document.getElementById('ticket-qr').innerHTML = '<div style="font-size:52px">🎫</div>';
    }
  } else {
    document.getElementById('ticket-qr').innerHTML = '<div style="font-size:52px">🎫</div>';
  }
}

async function handleCheckIn(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('checkin-code');
  const box = document.getElementById('checkin-result');
  const code = input.value.trim();
  if (!code) return;

  const res = await API.checkInTicket(code);

  if (apiFailed(res)) {
    box.innerHTML = `<div class="state-panel state-error" style="padding:18px">
        <div class="state-title">${escapeHtml(res?.error || 'Check-in failed')}</div>
      </div>`;
    return;
  }

  box.innerHTML = `<div class="state-panel" style="padding:18px;border-color:rgba(52,211,153,0.4);background:rgba(52,211,153,0.08)">
      <div class="state-icon">✅</div>
      <div class="state-title">${escapeHtml(res.attendee)} checked in</div>
      ${res.batch ? `<div class="state-subtitle">Batch ${res.batch}</div>` : ''}
    </div>`;
  input.value = '';
  input.focus();
}

async function showAttendeesModal(eventId) {
  const rows = await API.getAttendees(eventId);
  if (apiFailed(rows)) { showToast(`⚠ ${rows?.error || 'Could not load attendees.'}`); return; }

  const confirmed = rows.filter(r => r.status === 'confirmed');
  const waitlisted = rows.filter(r => r.status === 'waitlisted');
  const checkedIn = rows.filter(r => r.checked_in).length;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">👥 Attendees</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <span class="card-badge teal">${confirmed.length} confirmed</span>
      <span class="card-badge amber">${waitlisted.length} waitlisted</span>
      <span class="card-badge">${checkedIn} checked in</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto">
      ${rows.length ? rows.map(a => `
        <div class="glass-card" style="display:flex;align-items:center;gap:10px;padding:10px 12px">
          <div class="alumni-avatar" style="width:36px;height:36px;font-size:12px;background:var(--teal);flex-shrink:0"><span>${escapeHtml(a.initials || '??')}</span></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">${escapeHtml(a.name)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${escapeHtml([a.dept, a.batch && `Batch ${a.batch}`, a.company].filter(Boolean).join(' · ') || '—')}</div>
            <div style="font-size:10px;color:var(--text-muted);font-family:monospace">${escapeHtml(a.ticket_code)}</div>
          </div>
          <span class="card-badge ${a.checked_in ? 'teal' : a.status === 'waitlisted' ? 'amber' : ''}">${a.checked_in ? '✅ In' : a.status === 'waitlisted' ? 'Waitlist' : 'Confirmed'}</span>
        </div>`).join('')
      : renderEmptyState('👤', 'No registrations yet')}
    </div>
  `);
}

// ─── DONATIONS ───

async function processDonation(campaignId, campaignName) {
  const custom = document.getElementById('custom-amount');
  const amount = state.selectedAmount || (custom && parseFloat(custom.value));

  if (!amount || amount <= 0) { showToast('⚠ Please select or enter a donation amount'); return; }
  if (!state.selectedGateway) { showToast('⚠ Please select a payment gateway'); return; }

  // Phase 1: write the PENDING ledger row before contacting the gateway.
  const created = await API.createDonation({
    campaignId, amount, gateway: state.selectedGateway,
    isAnonymous: document.getElementById('donate-anonymous')?.checked || false
  });

  if (apiFailed(created)) { showToast(`⚠ ${created?.error || 'Could not start the donation.'}`); return; }

  const gwNames = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', card: 'Visa/Mastercard' };
  const gwName = gwNames[state.selectedGateway] || state.selectedGateway;
  const donation = created.donation;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔐 Authorize Payment</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="payment-step">
      <div style="font-size:44px;margin-bottom:10px">${state.selectedGateway === 'bkash' ? '📱' : state.selectedGateway === 'nagad' ? '📲' : state.selectedGateway === 'rocket' ? '🚀' : '💳'}</div>
      <div style="font-size:17px;font-weight:800;margin-bottom:6px">Authorising via ${escapeHtml(gwName)}</div>
      <div style="color:var(--text-secondary);margin-bottom:6px">Amount: <strong style="color:var(--teal)">৳${Number(amount).toLocaleString()}</strong></div>
      <div style="font-family:monospace;font-size:11px;color:var(--text-muted);margin-bottom:18px">Ref ${escapeHtml(donation.transaction_reference)}</div>
      <div style="background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:16px;margin-bottom:18px">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">Enter your ${escapeHtml(gwName)} PIN</div>
        <div class="otp-inputs" style="justify-content:center">
          ${[0,1,2,3].map(() => '<input type="password" class="otp-box" maxlength="1" inputmode="numeric" />').join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-full" onclick="settleDonation(${donation.id}, true)">✓ Confirm Payment</button>
      <button class="btn btn-ghost btn-full mt-8" onclick="settleDonation(${donation.id}, false)">Simulate a failed payment</button>
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px">A PENDING ledger entry has already been recorded. The campaign total updates only on confirmation.</div>
    </div>
  `);
}

async function settleDonation(donationId, success) {
  const res = await API.confirmDonation(donationId, {
    success, failureReason: success ? null : 'Simulated gateway decline'
  });

  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not settle the transaction.'}`); return; }

  const d = res.donation;

  if (d.status === 'FAILED') {
    showModal(`
      <div class="modal-header">
        <div class="modal-title">❌ Payment Failed</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="payment-step">
        <div style="font-size:44px;margin-bottom:10px">⚠️</div>
        <div style="font-size:16px;font-weight:800;margin-bottom:6px">The transaction was declined</div>
        <div style="color:var(--text-secondary);margin-bottom:8px">${escapeHtml(d.failure_reason || 'The gateway rejected the payment.')}</div>
        <div style="font-family:monospace;font-size:11px;color:var(--text-muted);margin-bottom:18px">Ref ${escapeHtml(d.transaction_reference)}</div>
        <button class="btn btn-primary btn-full" onclick="closeModal(); showPage('donations')">Try again</button>
      </div>
    `);
    renderCampaignsEnhanced();
    return;
  }

  const date = new Date(d.completed_at || Date.now()).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' });

  showModal(`
    <div class="modal-header">
      <div class="modal-title">🎉 Payment Successful</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="payment-step">
      <div class="payment-success">✅</div>
      <div class="payment-success-title">Thank you for your donation!</div>
      <div class="payment-success-sub">Your contribution has been recorded in the ledger.</div>
      <div class="receipt-preview">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;text-align:center">OFFICIAL TAX RECEIPT</div>
        <div style="font-size:11px;text-align:center;color:var(--text-muted);margin-bottom:12px">Daffodil International College Alumni Association</div>
        <div class="receipt-row"><span>Donor</span><span>${escapeHtml(d.is_anonymous ? 'Anonymous' : d.donor_name)}</span></div>
        <div class="receipt-row"><span>Receipt No.</span><span style="font-family:monospace;font-size:11px">${escapeHtml(d.receipt_code)}</span></div>
        <div class="receipt-row"><span>Transaction</span><span style="font-family:monospace;font-size:11px">${escapeHtml(d.transaction_reference)}</span></div>
        <div class="receipt-row"><span>Gateway</span><span>${escapeHtml(d.payment_gateway)}</span></div>
        <div class="receipt-row"><span>Date</span><span style="font-size:11px">${escapeHtml(date)}</span></div>
        <div class="receipt-row"><span>Amount</span><span>৳${Number(d.amount).toLocaleString()}</span></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="downloadReceipt(${d.id})">📄 Download Receipt</button>
        <button class="btn btn-outline" onclick="closeModal()">✓ Done</button>
      </div>
    </div>
  `);

  state.selectedAmount = null;
  state.selectedGateway = null;
  renderCampaignsEnhanced();
  renderDonorLeaderboard();
  renderNotifications();
}

// Generates a real downloadable receipt from the ledger row.
async function downloadReceipt(donationId) {
  const rows = await API.getMyDonations();
  if (apiFailed(rows)) { showToast('⚠ Could not load your receipt.'); return; }

  const d = rows.find(r => r.id === donationId) || rows[0];
  if (!d) { showToast('⚠ Receipt not found.'); return; }

  const lines = [
    'DAFFODIL INTERNATIONAL COLLEGE — ALUMNI ASSOCIATION',
    'OFFICIAL DONATION RECEIPT (Tax Deductible)',
    '',
    `Receipt No.      : ${d.receipt_code || '—'}`,
    `Transaction Ref  : ${d.transaction_reference}`,
    `Donor            : ${d.is_anonymous ? 'Anonymous' : d.donor_name}`,
    `Campaign         : ${d.campaign_name || '—'}`,
    `Amount           : BDT ${Number(d.amount).toLocaleString()}`,
    `Payment Gateway  : ${d.payment_gateway}`,
    `Status           : ${d.status}`,
    `Date             : ${new Date(d.completed_at || d.created_at).toLocaleString('en-GB')}`,
    '',
    'This receipt was generated from the institutional donation ledger.',
    'Verify at: alumni.dic.edu.bd/verify/' + (d.receipt_code || '')
  ];

  downloadTextFile(`DIC_Receipt_${d.receipt_code || d.id}.txt`, lines.join('\n'));
  showToast('📄 Receipt downloaded.');
}

async function deleteCampaignPrompt(id, name) {
  if (!confirm(`Delete the campaign "${name}"? Donations already recorded are retained in the ledger.`)) return;
  const res = await API.deleteCampaign(id);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not delete.'}`); return; }
  showToast('🗑 Campaign deleted.');
  renderCampaignsEnhanced();
}

// ─── MENTORSHIP ───

async function submitMentorRequest(mentorId, matchScore) {
  const subject = document.getElementById('mentor-subject')?.value.trim();
  const message = document.getElementById('mentor-message')?.value.trim();
  if (!subject) { showToast('⚠ Please describe what you need help with.'); return; }

  const res = await API.requestMentorship({ mentorId, subject, message, matchScore });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Request failed.'}`); return; }

  closeModal();
  showToast('🤝 Mentorship request sent — it expires in 5 days if unanswered.');
  renderMentorships();
  renderNotifications();
}

async function respondToMentorship(id, action) {
  const res = await API.respondMentorship(id, action);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not update the request.'}`); return; }
  const verb = { accept: 'accepted', decline: 'declined', complete: 'marked complete' }[action];
  showToast(`✓ Mentorship ${verb}.`);
  renderMentorships();
  renderNotifications();
}

// ─── JOBS ───

async function applyJob(jobId, title) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">📄 Apply — ${escapeHtml(title)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="submitJobApplication(event, ${jobId})">
      <div class="input-group">
        <label class="input-label">Cover note</label>
        <textarea id="apply-note" class="form-input" rows="4" placeholder="Why are you a good fit for this role?"></textarea>
      </div>
      <div class="input-group">
        <label class="input-label">Resume / portfolio URL (optional)</label>
        <input type="url" id="apply-resume" class="form-input" placeholder="https://…" />
      </div>
      <button type="submit" class="btn btn-primary btn-full">Submit Application</button>
    </form>
  `);
}

async function submitJobApplication(e, jobId) {
  if (e) e.preventDefault();
  const res = await API.applyToJob(jobId, {
    coverNote: document.getElementById('apply-note')?.value.trim(),
    resumeUrl: document.getElementById('apply-resume')?.value.trim()
  });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Application failed.'}`); return; }
  closeModal();
  showToast('✅ Application submitted.');
  renderJobsEnhanced();
}

async function showJobApplicants(jobId, title) {
  const rows = await API.getJobApplicants(jobId);
  if (apiFailed(rows)) { showToast(`⚠ ${rows?.error || 'Could not load applicants.'}`); return; }

  showModal(`
    <div class="modal-header">
      <div class="modal-title">👥 Applicants — ${escapeHtml(title)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto">
      ${rows.length ? rows.map(a => `
        <div class="glass-card" style="padding:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="alumni-avatar" style="width:36px;height:36px;font-size:12px;background:var(--teal);flex-shrink:0"><span>${escapeHtml(a.initials || '??')}</span></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px">${escapeHtml(a.name)}</div>
              <div style="font-size:11px;color:var(--text-secondary)">${escapeHtml([a.dept, a.batch && `Batch ${a.batch}`, a.company].filter(Boolean).join(' · ') || '—')}</div>
            </div>
            <span class="card-badge">${escapeHtml(a.status)}</span>
          </div>
          ${a.cover_note ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;padding-top:8px;border-top:1px solid var(--border-glass)">${escapeHtml(a.cover_note)}</div>` : ''}
        </div>`).join('')
      : renderEmptyState('📭', 'No applications yet')}
    </div>
  `);
}

async function submitReferralRequest(jobId) {
  const message = document.getElementById('referral-message')?.value.trim();
  const res = await API.requestReferral(jobId, message);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not send the request.'}`); return; }
  closeModal();
  showToast('🤝 Referral request sent to the poster.');
}

async function deleteJobPrompt(id, title) {
  if (!confirm(`Delete the posting "${title}"?`)) return;
  const res = await API.deleteJob(id);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not delete.'}`); return; }
  showToast('🗑 Job posting deleted.');
  renderJobsEnhanced();
}

// ─── BROADCASTS ───

async function sendBroadcast() {
  const title = document.getElementById('broadcast-title')?.value.trim();
  const body = document.getElementById('broadcast-body')?.value.trim();
  const targetRole = document.getElementById('broadcast-target')?.value || 'all';
  const channels = [...document.querySelectorAll('.broadcast-channel.active')].map(c => c.dataset.channel);

  if (!title) { showToast('⚠ Enter a broadcast title.'); return; }
  if (!body) { showToast('⚠ Enter the message body.'); return; }

  const res = await API.sendBroadcastApi({ title, body, channels: channels.length ? channels : ['push'], targetRole });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Broadcast failed.'}`); return; }

  closeModal();
  showToast(`📢 Broadcast delivered to ${res.recipients} recipient${res.recipients === 1 ? '' : 's'} via ${(channels.length ? channels : ['push']).join(' + ')}.`);
  if (typeof renderBroadcastHistory === 'function') renderBroadcastHistory();
  renderNotifications();
}

// ─── COMPLIANCE: DSAR & IDENTITY VAULT ───

function downloadTextFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Downloads through fetch so the Authorization header is attached.
async function exportUserData(format = 'json') {
  showToast(`📦 Preparing your ${format.toUpperCase()} export…`);
  try {
    const res = await fetch(API.dsarExportUrl(format), {
      headers: { Authorization: `Bearer ${localStorage.getItem('dic_session_token')}` }
    });
    if (!res.ok) throw new Error('export failed');
    const text = await res.text();
    downloadTextFile(`dic_my_data.${format}`, text, format === 'csv' ? 'text/csv' : 'application/json');
    showToast('✅ Your data export has been downloaded.');
  } catch {
    showToast('⚠ Could not generate the export. Please try again.');
  }
}

async function exportProfileDSAR() {
  return exportUserData('json');
}

async function showDeleteAccount() {
  const pending = await API.getDeletionRequest();
  const hasPending = !apiFailed(pending) && pending;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">⚠ Delete Account</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    ${hasPending ? `
      <div class="state-panel" style="border-color:rgba(255,140,66,0.4);background:rgba(255,140,66,0.08)">
        <div class="state-icon">⏳</div>
        <div class="state-title">Deletion already scheduled</div>
        <div class="state-subtitle">Your account will be permanently purged on ${escapeHtml(formatDate(pending.purge_after))}. You can cancel until then.</div>
      </div>
      <button class="btn btn-primary btn-full mt-16" onclick="cancelAccountDeletion()">↩ Cancel deletion request</button>
    ` : `
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
        Under PDPA 2026 your account enters a <strong>30-day grace period</strong> before permanent deletion.
        You can cancel at any point during that window. We recommend exporting your data first.
      </p>
      <button class="btn btn-outline btn-full" onclick="exportUserData('json')">📦 Export my data first</button>
      <div class="input-group mt-16">
        <label class="input-label">Reason (optional)</label>
        <textarea id="delete-reason" class="form-input" rows="3" placeholder="Help us understand why you are leaving…"></textarea>
      </div>
      <button class="btn btn-danger btn-full" onclick="confirmAccountDeletion()">Request account deletion</button>
    `}
  `);
}

async function confirmAccountDeletion() {
  if (!confirm('Schedule your account for deletion in 30 days?')) return;
  const res = await API.requestDeletion(document.getElementById('delete-reason')?.value.trim());
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not submit the request.'}`); return; }
  closeModal();
  showToast(`⚠ Account deletion scheduled for ${formatDate(res.request.purge_after)}. You can cancel until then.`);
  renderNotifications();
}

async function cancelAccountDeletion() {
  const res = await API.cancelDeletion();
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not cancel.'}`); return; }
  closeModal();
  showToast('✓ Deletion request cancelled — your account is active.');
}

// Decrypts a real AES-256-GCM field; the reason is mandatory and audited.
async function decryptVaultField(vaultId, ownerName) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔓 Decrypt Identity Field</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
      Decrypting ${escapeHtml(ownerName)}'s identity data is a privileged action. Your name, the reason
      and a timestamp are written to the immutable access log.
    </p>
    <div class="input-group">
      <label class="input-label">Reason for access (required)</label>
      <input type="text" id="vault-reason" class="form-input" placeholder="e.g. Scholarship eligibility verification" required />
    </div>
    <button class="btn btn-primary btn-full" onclick="performVaultReveal(${vaultId})">🔓 Decrypt & Log Access</button>
    <div id="vault-reveal-result" class="mt-16"></div>
  `);
}

async function performVaultReveal(vaultId) {
  const reason = document.getElementById('vault-reason')?.value.trim();
  const box = document.getElementById('vault-reveal-result');

  const res = await API.revealVaultField(vaultId, reason);
  if (apiFailed(res)) {
    box.innerHTML = `<div class="state-panel state-error" style="padding:16px"><div class="state-title">${escapeHtml(res?.error || 'Decryption failed')}</div></div>`;
    return;
  }

  box.innerHTML = `
    <div class="state-panel" style="padding:18px;border-color:rgba(52,211,153,0.4);background:rgba(52,211,153,0.08)">
      <div class="state-title" style="font-family:monospace;font-size:18px;letter-spacing:0.08em">${escapeHtml(res.value)}</div>
      <div class="state-subtitle">${escapeHtml(res.fieldType.toUpperCase())} · ${escapeHtml(res.owner)} · access logged</div>
    </div>`;
  if (typeof renderAuditLog === 'function') renderAuditLog();
}

async function storeIdentityField() {
  const fieldType = document.getElementById('vault-field-type')?.value;
  const value = document.getElementById('vault-field-value')?.value.trim();
  if (!value) { showToast('⚠ Enter a value to encrypt.'); return; }

  const res = await API.storeVaultField({ fieldType, value });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not store the field.'}`); return; }
  closeModal();
  showToast(`🔐 ${fieldType.toUpperCase()} encrypted with AES-256-GCM and stored.`);
  if (typeof renderNIDVaultPanel === 'function') renderNIDVaultPanel();
}

// Records consent with IP + policy version (PDPA 2026).
async function recordConsent(consentType, granted = true) {
  const res = await API.recordConsent({ consentType, granted });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not record consent.'}`); return; }
  showToast(granted ? '✓ Consent recorded.' : '✓ Consent withdrawn.');
}

// ─── EVENT PLANNER REPORTS ───

async function downloadEventReport(type = 'full', eventId = 1) {
  showToast(`📊 Generating the ${type} report…`);
  try {
    const res = await fetch(API.plannerReportUrl(eventId, type), {
      headers: { Authorization: `Bearer ${localStorage.getItem('dic_session_token')}` }
    });
    if (!res.ok) throw new Error('report failed');
    downloadTextFile(`dic_event_${eventId}_${type}_report.csv`, await res.text(), 'text/csv');
    showToast('✅ Report downloaded.');
  } catch {
    showToast('⚠ Could not generate the report.');
  }
}

async function exportPDF() { return downloadEventReport('full'); }
async function exportExcel() { return downloadEventReport('full'); }

function filterJobLocation(v) {
  state.jobFilters = { ...(state.jobFilters || {}), location: v === 'all' ? '' : v };
  renderJobsEnhanced();
}

async function handleCreateEventSubmit(e) {
  if (e) e.preventDefault();
  const rawDate = document.getElementById('event-date').value;
  const res = await API.createEvent({
    title: document.getElementById('event-title').value.trim(),
    emoji: document.getElementById('event-emoji').value.trim() || '🎓',
    eventDate: rawDate ? new Date(rawDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'TBA',
    eventTime: document.getElementById('event-time').value,
    venue: document.getElementById('event-venue').value.trim(),
    capacity: document.getElementById('event-capacity').value,
    price: document.getElementById('event-price').value.trim() || 'Free',
    type: document.getElementById('event-type').value
  });

  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not create the event.'}`); return; }
  closeModal();
  showToast(`✅ "${res.title}" created and published.`);
  renderEvents(state.eventFilter || 'upcoming');
}

async function handlePostJobSubmit(e) {
  if (e) e.preventDefault();
  const res = await API.createJob({
    title: document.getElementById('job-title').value.trim(),
    company: document.getElementById('job-company').value.trim(),
    type: document.getElementById('job-type').value,
    location: document.getElementById('job-location').value.trim(),
    salary: document.getElementById('job-salary').value.trim(),
    tags: document.getElementById('job-tags').value
  });

  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not post the job.'}`); return; }
  closeModal();
  showToast(`✅ "${res.title}" posted to the job board.`);
  renderJobsEnhanced();
}

// ─── CREATE CAMPAIGN (was a toast-only shell) ───
function showCreateCampaign() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Create Campaign</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="handleCreateCampaignSubmit(event)">
      <div class="input-group"><label class="input-label">Campaign Name</label>
        <input type="text" id="campaign-name" class="form-input" placeholder="e.g. Science Lab Fund 2026" required /></div>
      <div class="input-group"><label class="input-label">Description</label>
        <textarea id="campaign-desc" class="form-input" rows="3" placeholder="Describe the impact of this campaign…"></textarea></div>
      <div class="field-grid-2">
        <div class="input-group"><label class="input-label">Goal Amount (৳)</label>
          <input type="number" id="campaign-goal" class="form-input" min="1" value="1500000" required /></div>
        <div class="input-group"><label class="input-label">Days to run</label>
          <input type="number" id="campaign-days" class="form-input" min="1" value="30" /></div>
      </div>
      <div class="input-group"><label class="input-label">Category</label>
        <select id="campaign-tag" class="form-select">
          <option value="scholarship">Scholarship</option><option value="education">Education</option>
          <option value="infrastructure">Infrastructure</option><option value="sports">Sports</option>
        </select></div>
      <div class="input-group"><label class="input-label">Payment Gateways</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${['bkash','nagad','rocket','card'].map((g, i) =>
            `<button type="button" class="chip campaign-gateway${i !== 2 ? ' active' : ''}" data-gateway="${g}" onclick="this.classList.toggle('active')">${g.charAt(0).toUpperCase() + g.slice(1)}</button>`).join('')}
        </div></div>
      <button type="submit" class="btn btn-primary btn-full">Create Campaign</button>
    </form>
  `);
}

async function handleCreateCampaignSubmit(e) {
  if (e) e.preventDefault();
  const gateways = [...document.querySelectorAll('.campaign-gateway.active')].map(b => b.dataset.gateway);
  const res = await API.createCampaign({
    name: document.getElementById('campaign-name').value.trim(),
    description: document.getElementById('campaign-desc').value.trim(),
    goalAmount: document.getElementById('campaign-goal').value,
    daysLeft: document.getElementById('campaign-days').value,
    tag: document.getElementById('campaign-tag').value,
    gateways
  });

  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not create the campaign.'}`); return; }
  closeModal();
  showToast(`✅ "${res.name}" is now live.`);
  renderCampaignsEnhanced();
}

// ─── BROADCAST MODAL (was a toast-only shell) ───
function showBroadcastModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">📢 Send Broadcast</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="input-group"><label class="input-label">Title</label>
      <input type="text" id="broadcast-title" class="form-input" placeholder="e.g. Reunion registration now open" required /></div>
    <div class="input-group"><label class="input-label">Message</label>
      <textarea id="broadcast-body" class="form-input" rows="4" placeholder="Write your announcement…" required></textarea></div>
    <div class="input-group"><label class="input-label">Audience</label>
      <select id="broadcast-target" class="form-select">
        <option value="all">Everyone</option>
        <option value="alumni">Alumni only</option>
        <option value="moderator">Moderators</option>
        <option value="dept_admin">Department admins</option>
        <option value="univ_admin">College admins</option>
      </select></div>
    <div class="input-group"><label class="input-label">Channels</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${[['push','🔔 Push'],['sms','💬 SMS'],['email','✉ Email']].map((c, i) =>
          `<button type="button" class="chip broadcast-channel${i === 0 ? ' active' : ''}" data-channel="${c[0]}" onclick="this.classList.toggle('active')">${c[1]}</button>`).join('')}
      </div></div>
    <button class="btn btn-primary btn-full" onclick="sendBroadcast()">📢 Send Broadcast</button>
    <div style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center">Recipients are resolved from the live audience and delivered as in-app notifications.</div>
  `);
}

function showStoreIdentityModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔐 Encrypt an Identity Field</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
      The value is encrypted with AES-256-GCM in the application layer before it reaches PostgreSQL.
      Only the last four digits are stored separately for display.
    </p>
    <div class="input-group"><label class="input-label">Field type</label>
      <select id="vault-field-type" class="form-select">
        <option value="nid">National ID (NID)</option>
        <option value="brc">Birth Registration (BRC)</option>
        <option value="passport">Passport</option>
      </select></div>
    <div class="input-group"><label class="input-label">Value</label>
      <input type="text" id="vault-field-value" class="form-input" placeholder="Enter the identity number" autocomplete="off" required /></div>
    <button class="btn btn-primary btn-full" onclick="storeIdentityField()">🔐 Encrypt & Store</button>
  `);
}

async function showVaultAccessLogs() {
  const rows = await API.getVaultAccessLogs();
  if (apiFailed(rows)) { showToast(`⚠ ${rows?.error || 'Could not load access logs.'}`); return; }

  showModal(`
    <div class="modal-header">
      <div class="modal-title">📜 Vault Access Log</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto">
      ${rows.length ? rows.map(l => `
        <div class="glass-card" style="padding:12px">
          <div style="font-weight:700;font-size:13px">${escapeHtml(l.accessed_by_name || 'Unknown')} decrypted ${escapeHtml((l.field_type || '').toUpperCase())}</div>
          <div style="font-size:12px;color:var(--text-secondary)">Subject: ${escapeHtml(l.owner_name || '—')}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Reason: ${escapeHtml(l.reason)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escapeHtml(formatRelativeTime(l.created_at))}</div>
        </div>`).join('')
      : renderEmptyState('📜', 'No decryption events recorded')}
    </div>
  `);
}

// ─── CHAPTERS (REQ-13) — single source of truth is PostgreSQL ───
async function renderChapters() {
  const tree = document.getElementById('chapter-tree');
  if (!tree) return;

  tree.innerHTML = renderSkeletonCards(3, 'chapter');
  const rows = await API.getChapters();

  if (rows === null) {
    tree.innerHTML = renderErrorState('Could not load chapters.', 'renderChapters()');
    return;
  }

  chaptersCache = rows.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    icon: c.icon || '🏫',
    description: c.description || '',
    // members_count is the counter the join/leave endpoint maintains.
    members: c.members_count || 0,
    events: c.events_count || 0,
    parent: c.parent_id ?? null
  }));

  // Membership comes from PostgreSQL for the signed-in user.
  USER_CHAPTER_MEMBERSHIPS = new Set(rows.filter(c => c.is_member).map(c => c.id));

  if (chaptersCache.length === 0) {
    tree.innerHTML = renderEmptyState('⬡', 'No chapters yet', 'Create the first regional, batch or interest chapter.');
    const detail = document.getElementById('chapter-detail');
    if (detail) detail.innerHTML = '';
    return;
  }

  const roots = chaptersCache.filter(c => c.parent === null);
  const children = (parentId) => chaptersCache.filter(c => c.parent === parentId);

  tree.innerHTML = roots.map(c => `
    <div class="chapter-node" onclick="selectChapter(${c.id})">
      <span class="chapter-icon">${escapeHtml(c.icon)}</span>
      <span class="chapter-name">${escapeHtml(c.name)}</span>
      <span class="chapter-type ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>
      <span class="chapter-count">${c.members.toLocaleString()}</span>
    </div>
    ${children(c.id).map(sub => `
      <div class="chapter-node chapter-indent" onclick="selectChapter(${sub.id})">
        <span class="chapter-icon">${escapeHtml(sub.icon)}</span>
        <span class="chapter-name">${escapeHtml(sub.name)}</span>
        <span class="chapter-type ${escapeHtml(sub.type)}">${escapeHtml(sub.type)}</span>
        <span class="chapter-count">${sub.members.toLocaleString()}</span>
      </div>
    `).join('')}
  `).join('');

  if (chaptersCache.length > 0) selectChapter(chaptersCache[chaptersCache.length - 1].id);
}

// ─── NOTIFICATION PANEL ───
function showNotifications() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  // Pull fresh rows every time the panel opens — it previously toggled a
  // container nothing had rendered into.
  if (!panel.classList.contains('hidden')) renderNotifications();
}

function closeNotifications() {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.classList.add('hidden');
}
// Shared table→card renderer. On mobile every planner table becomes a stack of
// cards (Phase 7) instead of a horizontally scrolling grid.
function plannerTable(columns, rows, rowFn, emptyIcon, emptyText) {
  if (!rows.length) return renderEmptyState(emptyIcon, emptyText);
  return `
    <div class="planner-table">
      <div class="planner-table-head">
        ${columns.map(c => `<div>${escapeHtml(c)}</div>`).join('')}
      </div>
      ${rows.map(r => `<div class="planner-table-row">${rowFn(r).map((cell, i) =>
          `<div data-label="${escapeHtml(columns[i])}">${cell}</div>`).join('')}</div>`).join('')}
    </div>`;
}

function plannerToolbar(kind, label) {
  const canEdit = state.currentUser && ['super_admin', 'univ_admin', 'dept_admin', 'moderator'].includes(state.currentUser.role);
  if (!canEdit) return '';
  return `<button class="btn btn-sm btn-primary" onclick="showPlannerItemModal('${kind}')">➕ Add ${escapeHtml(label)}</button>`;
}

// ─── PLANNER: VENDORS / TIMELINE / LOGISTICS TABS (new in Phase 6) ───
function renderPlannerExtraTab(tab) {
  const container = document.getElementById('planner-tab-content');
  if (!container || !CURRENT_PLANNER_DATA) return;
  const d = CURRENT_PLANNER_DATA;

  if (tab === 'vendors') {
    const committed = (d.vendors || []).reduce((a, v) => a + Number(v.contract_value || 0), 0);
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">🏪 Vendor Management</h3>
          ${plannerToolbar('vendors', 'Vendor')}
        </div>
        <div class="planner-metrics-ribbon mb-16">
          <div class="pmetric-card"><div class="pmetric-val">${(d.vendors || []).length}</div><div class="pmetric-lab">Vendors</div></div>
          <div class="pmetric-card"><div class="pmetric-val" style="color:var(--teal)">৳${committed.toLocaleString()}</div><div class="pmetric-lab">Committed Value</div></div>
          <div class="pmetric-card"><div class="pmetric-val">${(d.vendors || []).filter(v => v.status === 'contracted' || v.status === 'paid').length}</div><div class="pmetric-lab">Contracted</div></div>
        </div>
        ${plannerTable(
          ['Vendor', 'Category', 'Contact', 'Contract', 'Rating', 'Status', ''],
          d.vendors || [],
          v => [
            `<strong>${escapeHtml(v.name)}</strong>`,
            escapeHtml(v.category || '—'),
            `${escapeHtml(v.contact_person || '—')}${v.phone ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(v.phone)}</div>` : ''}`,
            `৳${Number(v.contract_value).toLocaleString()}`,
            '★'.repeat(v.rating || 0) + '☆'.repeat(5 - (v.rating || 0)),
            `<span class="card-badge ${v.status === 'paid' ? 'teal' : v.status === 'contracted' ? '' : 'amber'}">${escapeHtml(v.status)}</span>`,
            `<button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('vendors', ${v.id})">🗑</button>`
          ],
          '🏪', 'No vendors added yet')}
      </div>`;

  } else if (tab === 'timeline') {
    const done = (d.timeline || []).filter(m => m.status === 'done').length;
    const avg = (d.timeline || []).length
      ? Math.round((d.timeline).reduce((a, m) => a + (m.progress || 0), 0) / d.timeline.length) : 0;
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">🗓 Event Timeline</h3>
          ${plannerToolbar('timeline', 'Milestone')}
        </div>
        <div class="planner-metrics-ribbon mb-16">
          <div class="pmetric-card"><div class="pmetric-val">${(d.timeline || []).length}</div><div class="pmetric-lab">Milestones</div></div>
          <div class="pmetric-card"><div class="pmetric-val" style="color:var(--teal)">${done}</div><div class="pmetric-lab">Completed</div></div>
          <div class="pmetric-card"><div class="pmetric-val">${avg}%</div><div class="pmetric-lab">Avg Progress</div></div>
        </div>
        ${(d.timeline || []).length ? `<div class="timeline-track">
          ${d.timeline.map(m => `
            <div class="timeline-item ${escapeHtml(m.status)}">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="timeline-head">
                  <strong>${escapeHtml(m.title)}</strong>
                  <span class="card-badge ${m.status === 'done' ? 'teal' : m.status === 'delayed' ? 'amber' : ''}">${escapeHtml(m.status.replace('_', ' '))}</span>
                </div>
                ${m.description ? `<div class="timeline-desc">${escapeHtml(m.description)}</div>` : ''}
                <div class="timeline-meta">
                  📅 ${escapeHtml(formatDate(m.starts_at))} → ${escapeHtml(formatDate(m.ends_at))}
                  ${m.owner ? ` · 👤 ${escapeHtml(m.owner)}` : ''} · ${escapeHtml(m.phase)}
                </div>
                <div class="progress-track" style="margin-top:8px"><div class="progress-fill" style="width:${m.progress || 0}%"></div></div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
                  <span style="font-size:11px;color:var(--text-muted)">${m.progress || 0}% complete</span>
                  <button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('timeline', ${m.id})">🗑</button>
                </div>
              </div>
            </div>`).join('')}
        </div>` : renderEmptyState('🗓', 'No milestones yet', 'Break the event into phases with owners and dates.')}
      </div>`;

  } else if (tab === 'logistics') {
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">🚚 Logistics &amp; Site Operations</h3>
          ${plannerToolbar('logistics', 'Item')}
        </div>
        ${plannerTable(
          ['Item', 'Category', 'Qty', 'Location', 'Responsible', 'Status', ''],
          d.logistics || [],
          l => [
            `<strong>${escapeHtml(l.item)}</strong>`,
            escapeHtml(l.category || '—'),
            String(l.quantity ?? 1),
            escapeHtml(l.location || '—'),
            escapeHtml(l.responsible || '—'),
            `<span class="card-badge ${l.status === 'on_site' || l.status === 'arranged' ? 'teal' : 'amber'}">${escapeHtml((l.status || '').replace('_', ' '))}</span>`,
            `<button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('logistics', ${l.id})">🗑</button>`
          ],
          '🚚', 'No logistics items yet')}
      </div>`;
  }
}

// ─── PLANNER ANALYTICS — computed server-side from real rows ───
async function renderPlannerAnalytics() {
  const container = document.getElementById('planner-tab-content');
  if (!container) return;

  const a = await API.getPlannerAnalytics(CURRENT_PLANNER_EVENT_ID);
  if (apiFailed(a)) {
    container.innerHTML = renderErrorState(a?.error || 'Could not load analytics.', 'renderPlannerAnalytics()');
    return;
  }

  const roi = a.budget.actual ? (((a.sponsors.secured - a.budget.actual) / a.budget.actual) * 100).toFixed(1) : '0.0';

  container.innerHTML = `
    <div class="glass-card">
      <div class="card-header">
        <h3 class="card-title">📈 Event Analytics</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm btn-primary" onclick="downloadEventReport('full', ${CURRENT_PLANNER_EVENT_ID})">📥 Full report (CSV)</button>
          <button class="btn btn-sm btn-outline" onclick="downloadEventReport('budget', ${CURRENT_PLANNER_EVENT_ID})">💰 Budget only</button>
        </div>
      </div>

      <div class="planner-metrics-ribbon mt-14 mb-16">
        <div class="pmetric-card">
          <div class="pmetric-val" style="color:${roi >= 0 ? 'var(--teal)' : 'var(--red)'}">${roi >= 0 ? '+' : ''}${roi}%</div>
          <div class="pmetric-lab">Sponsor ROI vs Spend</div>
        </div>
        <div class="pmetric-card">
          <div class="pmetric-val">${a.tasks.completionRate}%</div>
          <div class="pmetric-lab">Task Completion (${a.tasks.completed || 0}/${a.tasks.total})</div>
        </div>
        <div class="pmetric-card">
          <div class="pmetric-val">${a.budget.utilisation}%</div>
          <div class="pmetric-lab">Budget Utilisation</div>
        </div>
        <div class="pmetric-card">
          <div class="pmetric-val" style="color:var(--teal)">${a.sponsors.coverage}%</div>
          <div class="pmetric-lab">Sponsor Coverage</div>
        </div>
      </div>

      <div class="field-grid-2">
        <div class="analytics-block">
          <div class="analytics-block-title">💰 Budget</div>
          <div class="analytics-row"><span>Estimated</span><strong>৳${a.budget.estimated.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Actual</span><strong>৳${a.budget.actual.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Variance</span><strong style="color:${a.budget.variance >= 0 ? 'var(--teal)' : 'var(--red)'}">৳${a.budget.variance.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Budget lines</span><strong>${a.budget.lines}</strong></div>
        </div>
        <div class="analytics-block">
          <div class="analytics-block-title">🤝 Sponsorship</div>
          <div class="analytics-row"><span>Secured</span><strong>৳${a.sponsors.secured.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Full pipeline</span><strong>৳${a.sponsors.pipeline.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Sponsors</span><strong>${a.sponsors.count}</strong></div>
        </div>
        <div class="analytics-block">
          <div class="analytics-block-title">📢 Marketing</div>
          <div class="analytics-row"><span>Spend</span><strong>৳${a.marketing.spend.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Reach</span><strong>${a.marketing.reach.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Conversions</span><strong>${a.marketing.conversions.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Cost / conversion</span><strong>৳${a.marketing.costPerConversion.toLocaleString()}</strong></div>
        </div>
        <div class="analytics-block">
          <div class="analytics-block-title">🚦 Delivery</div>
          <div class="analytics-row"><span>Timeline progress</span><strong>${a.timeline.avgProgress}%</strong></div>
          <div class="analytics-row"><span>Milestones done</span><strong>${a.timeline.done}/${a.timeline.milestones}</strong></div>
          <div class="analytics-row"><span>Procurement spend</span><strong>৳${a.procurement.spend.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Vendors committed</span><strong>৳${a.vendors.committed.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>High-severity risks</span><strong>${a.risks.high || 0}</strong></div>
        </div>
      </div>
    </div>`;
}

// ─── PLANNER CRUD MODALS ───
const PLANNER_FIELDS = {
  vendors:    { label: 'Vendor', fields: [['name','Vendor name','text',true],['category','Category','text'],['contactPerson','Contact person','text'],['phone','Phone','tel'],['email','Email','email'],['contractValue','Contract value (৳)','number'],['rating','Rating (0-5)','number'],['status','Status','select',false,['shortlisted','contracted','paid','rejected']]] },
  timeline:   { label: 'Milestone', fields: [['title','Milestone title','text',true],['description','Description','textarea'],['phase','Phase','text'],['startsAt','Start date','date'],['endsAt','End date','date'],['owner','Owner','text'],['progress','Progress %','number'],['status','Status','select',false,['pending','in_progress','done','delayed']]] },
  logistics:  { label: 'Logistics item', fields: [['item','Item','text',true],['category','Category','text'],['quantity','Quantity','number'],['location','Location','text'],['responsible','Responsible','text'],['status','Status','select',false,['planned','arranged','on_site','returned']]] },
  marketing:  { label: 'Campaign', fields: [['channel','Channel','text',true],['campaignName','Campaign name','text',true],['audience','Audience','text'],['budget','Budget (৳)','number'],['reach','Reach','number'],['conversions','Conversions','number'],['scheduledFor','Scheduled for','date'],['status','Status','select',false,['planned','live','completed','paused']]] },
  meetings:   { label: 'Meeting', fields: [['title','Meeting title','text',true],['agenda','Agenda','textarea'],['meetingDate','Date','date'],['meetingTime','Time','text'],['location','Location','text'],['attendees','Attendees','text'],['status','Status','select',false,['scheduled','held','cancelled']]] },
  committees: { label: 'Committee', fields: [['name','Committee name','text',true],['leaderName','Leader','text',true],['membersCount','Members','number'],['budgetAllocated','Budget (৳)','number']] },
  volunteers: { label: 'Volunteer', fields: [['volunteerName','Volunteer name','text',true],['shiftTime','Shift','text'],['assignedCommittee','Committee','text'],['attendanceStatus','Attendance','select',false,['assigned','checked_in','absent']]] },
  risks:      { label: 'Risk', fields: [['riskTitle','Risk','text',true],['category','Category','text'],['severity','Severity','select',false,['high','medium','low']],['contingencyPlan','Contingency plan','textarea',true]] }
};

function showPlannerItemModal(kind) {
  const spec = PLANNER_FIELDS[kind];
  if (!spec) return;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Add ${escapeHtml(spec.label)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="submitPlannerItem(event, '${kind}')">
      ${spec.fields.map(([key, label, type, required, options]) => {
        if (type === 'textarea') {
          return `<div class="input-group"><label class="input-label">${escapeHtml(label)}</label>
            <textarea id="pf-${key}" class="form-input" rows="3" ${required ? 'required' : ''}></textarea></div>`;
        }
        if (type === 'select') {
          return `<div class="input-group"><label class="input-label">${escapeHtml(label)}</label>
            <select id="pf-${key}" class="form-select">${options.map(o => `<option value="${o}">${o.replace('_', ' ')}</option>`).join('')}</select></div>`;
        }
        return `<div class="input-group"><label class="input-label">${escapeHtml(label)}</label>
          <input type="${type}" id="pf-${key}" class="form-input" ${required ? 'required' : ''} /></div>`;
      }).join('')}
      <button type="submit" class="btn btn-primary btn-full">Save ${escapeHtml(spec.label)}</button>
    </form>
  `);
}

async function submitPlannerItem(e, kind) {
  if (e) e.preventDefault();
  const spec = PLANNER_FIELDS[kind];
  const payload = { eventId: CURRENT_PLANNER_EVENT_ID };
  spec.fields.forEach(([key]) => {
    const el = document.getElementById('pf-' + key);
    if (el && el.value !== '') payload[key] = el.value;
  });

  const res = await API.createPlannerItem(kind, payload);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not save.'}`); return; }

  closeModal();
  showToast(`✅ ${spec.label} added.`);
  await loadEventPlannerWorkspace(CURRENT_PLANNER_EVENT_ID);
}

async function deletePlannerItem(kind, id) {
  if (!confirm('Delete this entry?')) return;
  const res = await API.deletePlannerItem(kind, id);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not delete.'}`); return; }
  showToast('🗑 Deleted.');
  await loadEventPlannerWorkspace(CURRENT_PLANNER_EVENT_ID);
}

/* ============================================================
   BULK IMPORT — REAL CSV PARSING
   Replaces simulateFileUploadProcess(), which ignored the chosen file and
   returned 12 hardcoded rows. This reads the actual file, parses it to
   RFC 4180, auto-maps headers, and validates before anything is sent.
   ============================================================ */

// Canonical system fields the importer can populate. `ignore` marks columns
// that must never reach a profile.
const IMPORT_FIELDS = [
  { key: 'ignore',         label: '— Do not import —' },
  { key: 'name',           label: 'Full Name',                       required: true },
  { key: 'email',          label: 'Email Address',                   required: true },
  { key: 'mobile',         label: 'Mobile Number' },
  { key: 'hscPassingYear', label: 'HSC Passing Year / Batch' },
  { key: 'hscGroup',       label: 'HSC Group' },
  { key: 'hscVersion',     label: 'HSC Version' },
  { key: 'bloodGroup',     label: 'Blood Group' },
  { key: 'presentAddress', label: 'Present Address' },
  { key: 'occupation',     label: 'Occupation' },
  { key: 'organization',   label: 'Current Organization / Institution' },
  { key: 'designation',    label: 'Current Designation' },
  { key: 'photoUrl',       label: 'Profile Photo URL' },
  { key: 'facebook',       label: 'Facebook Profile Link' }
];

// Header patterns -> system field. Anything unmatched defaults to "do not
// import", so a new column can never silently land in the wrong place.
const HEADER_RULES = [
  [/^timestamp$/i,                                   'ignore'],
  [/^comm?[ui]nicate\s*with$/i,                      'ignore'],  // CSV header is misspelled "Commicate with"
  [/^(full\s*)?name$/i,                              'name'],
  [/e-?mail/i,                                       'email'],
  [/(mobile|phone|contact\s*number)/i,               'mobile'],
  [/hsc.*(pass|year|batch)|(^|\s)batch(\s|$)/i,      'hscPassingYear'],
  [/^group\s*$|hsc\s*group/i,                        'hscGroup'],
  [/version|medium/i,                                'hscVersion'],
  [/blood/i,                                         'bloodGroup'],
  [/(present|current)\s*address|^address$/i,         'presentAddress'],
  [/occupation|profession/i,                         'occupation'],
  [/institution|organization|organisation|company|workplace/i, 'organization'],
  [/designation|job\s*title|position/i,              'designation'],
  [/photo|image|picture/i,                           'photoUrl'],
  [/facebook|fb\s*profile/i,                         'facebook']
];

function autoMapHeader(header) {
  const h = (header || '').trim();
  for (const [pattern, field] of HEADER_RULES) if (pattern.test(h)) return field;
  return 'ignore';
}

// RFC 4180 parser: handles quoted fields, embedded commas/newlines and "" escapes.
function parseCSVText(text) {
  const rows = [];
  let row = [], cur = '', quoted = false;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // strip BOM

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r') { /* handled by \n */ }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

// Mirrors the server normaliser so the preview shows what will actually be stored.
function sanitizeEmailClient(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase().replace(/[\u00a0\s]+/g, " ");
  const tokens = s.split(" ").filter(Boolean);
  const token = tokens.find(t => t.includes("@"));
  const looksValid = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v || "");
  if (token && tokens.length > 1 && looksValid(token)) return token;
  s = s.replace(/\s+/g, "").replace(/^mailto:/, "").replace(/[,;]+$/, "");
  return s || null;
}

function normalizeBloodGroupClient(raw) {
  if (!raw || !String(raw).trim()) return null;
  let s = String(raw).trim().toUpperCase().replace(/[()'`.\s]/g, '');
  s = s.replace(/POSSATIVE|POSITIVE|POSITIVR|POSTIVE|POS(?![A-Z])|PLUS/g, '+')
       .replace(/NEGATIVE|NEGETIVE|NEG(?![A-Z])|MINUS/g, '-')
       .replace(/VE$/, '')
       .replace(/^0/, 'O')
       .replace(/ABB/g, 'AB')
       .replace(/\++/g, '+').replace(/-+/g, '-');
  const letters = (s.match(/AB|A|B|O/) || [])[0];
  if (!letters) return 'Unknown';
  const sign = s.includes('+') ? '+' : (s.includes('-') ? '-' : null);
  if (!sign) return 'Unknown';   // never guess a rhesus factor
  const candidate = letters + sign;
  return ['A+','A-','B+','B-','AB+','AB-','O+','O-'].includes(candidate) ? candidate : 'Unknown';
}

function handleImportFileSelected(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  if (!/\.(csv|txt)$/i.test(file.name)) {
    showToast('⚠ Please choose a .csv file. XLSX is not supported yet — export it to CSV first.');
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => showToast('⚠ Could not read the file.');
  reader.onload = () => {
    try {
      const rows = parseCSVText(String(reader.result));
      if (rows.length < 2) { showToast('⚠ The file has no data rows.'); return; }

      currentImportState.filename = file.name;
      currentImportState.headers = rows[0].map(h => h.trim());
      currentImportState.rawRows = rows.slice(1);
      currentImportState.totalRows = rows.length - 1;
      currentImportState.mapping = currentImportState.headers.map(autoMapHeader);
      currentImportState.step = 'mapping';

      renderBulkImportPanel();
      showToast(`📄 Parsed "${file.name}" — ${currentImportState.totalRows} rows, ${currentImportState.headers.length} columns.`);
    } catch (e) {
      showToast('⚠ Could not parse the CSV: ' + e.message);
    }
  };
  reader.readAsText(file);
}

function setImportMapping(colIndex, fieldKey) {
  currentImportState.mapping[colIndex] = fieldKey;
  renderBulkImportPanel();
}

// Applies the mapping, then validates and classifies every row.
function validateImportRows() {
  const { headers, rawRows, mapping } = currentImportState;
  const valid = [], invalid = [], duplicates = [];
  const seenEmail = new Set(), seenMobile = new Set();

  rawRows.forEach((cells, i) => {
    const rec = { row: i + 2 };   // +2: 1-based, and row 1 is the header
    mapping.forEach((field, col) => {
      if (field === 'ignore') return;
      rec[field] = (cells[col] || '').trim();
    });

    // Maximum-retention policy: blank optional fields are stored as NULL and
    // never block a row. Only a record that cannot be identified or saved at
    // all is rejected — email is UNIQUE NOT NULL and is the login identifier.
    rec.emailRaw = rec.email;
    rec.email = sanitizeEmailClient(rec.email) || '';

    // A non-4-digit year is dropped rather than failing the row.
    if (rec.hscPassingYear && !/^\d{4}$/.test(rec.hscPassingYear)) {
      rec.hscPassingYearRaw = rec.hscPassingYear;
      rec.hscPassingYear = '';
    }

    const errors = [];
    if (!rec.name) errors.push('Missing name — cannot identify the person');
    if (!rec.email) errors.push('Missing email — required as the unique login identifier');
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(rec.email))
      errors.push('Email could not be recovered: "' + rec.emailRaw + '"');

    if (errors.length) { invalid.push({ ...rec, errorMsg: errors.join(' · ') }); return; }

    // Count blanks for the import summary.
    rec._missing = ['mobile','hscPassingYear','hscGroup','hscVersion','bloodGroup',
                    'presentAddress','occupation','organization','designation',
                    'photoUrl','facebook'].filter(f => !rec[f] || !String(rec[f]).trim());

    const emailKey = rec.email.toLowerCase();
    const mobileKey = (rec.mobile || '').replace(/\D/g, '').slice(-10);
    if (seenEmail.has(emailKey) || (mobileKey && seenMobile.has(mobileKey))) {
      // Same person submitted twice. Keep the later row so its data can enrich
      // the existing profile rather than being thrown away.
      duplicates.push({ ...rec, errorMsg: 'Same person as an earlier row (merged, not discarded)' });
      return;
    }
    seenEmail.add(emailKey);
    if (mobileKey) seenMobile.add(mobileKey);

    rec.bloodGroupNormalized = normalizeBloodGroupClient(rec.bloodGroup);
    valid.push(rec);
  });

  currentImportState.validRecords = valid;
  currentImportState.invalidRecords = invalid;
  currentImportState.duplicateRecords = duplicates;
  currentImportState.step = 2;
  renderBulkImportPanel();
  showToast(`🔍 Validated: ${valid.length} valid · ${duplicates.length} duplicates · ${invalid.length} errors`);
}

/* ============================================================
   SIGN UP  —  the app previously offered sign-in only, so an alumnus who
   was not bulk imported had no route into the system.
   ============================================================ */

function switchAuthMode(mode) {
  const signin = document.getElementById('auth-panel-signin');
  const signup = document.getElementById('auth-panel-signup');
  const tabIn = document.getElementById('auth-tab-signin');
  const tabUp = document.getElementById('auth-tab-signup');
  if (!signin || !signup) return;

  const isSignup = mode === 'signup';
  signup.classList.toggle('hidden', !isSignup);
  signin.classList.toggle('hidden', isSignup);
  tabUp.classList.toggle('active', isSignup);
  tabIn.classList.toggle('active', !isSignup);

  showLoginError('');
  showSignupError('');
}

function showSignupError(message) {
  const el = document.getElementById('signup-error');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('hidden', !message);
}

async function handleSignupSubmit(e) {
  if (e) e.preventDefault();

  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-password2').value;

  showSignupError('');

  if (password !== confirm) { showSignupError('The two passwords do not match.'); return; }
  if (password.length < 8) { showSignupError('Password must be at least 8 characters.'); return; }
  if (!document.getElementById('signup-consent').checked) {
    showSignupError('Please accept the data processing consent to continue.');
    return;
  }

  const btn = document.getElementById('signup-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating your account…';

  const result = await API.register({
    name, email, password,
    hscPassingYear: document.getElementById('signup-hsc-year').value,
    hscGroup: document.getElementById('signup-hsc-group').value,
    mobile: document.getElementById('signup-mobile').value.trim(),
    bloodGroup: document.getElementById('signup-blood-group').value
  });

  btn.disabled = false; btn.textContent = 'Create Account →';

  if (!result || result.error) { showSignupError(result?.error || 'Registration failed.'); return; }

  // Consent is logged server-side with IP and policy version (PDPA 2026).
  await API.recordConsent({ consentType: 'data_processing', granted: true });

  enterAuthenticatedApp(result.user);
  showToast('🎓 Account created. An administrator will verify your alumni status shortly.');
}

// Prompts bulk-imported users to replace the shared initial password.
function showChangePasswordModal(forced = false) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔑 ${forced ? 'Set a New Password' : 'Change Password'}</div>
      ${forced ? '' : '<button class="modal-close" onclick="closeModal()">✕</button>'}
    </div>
    ${forced ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
      Your account was created by a bulk import and still uses the shared initial password.
      Please choose your own before continuing.</p>` : ''}
    <form onsubmit="handleChangePassword(event)">
      <div class="input-group">
        <label class="input-label">Current Password</label>
        <input type="password" id="cp-current" class="form-input" autocomplete="current-password" required />
      </div>
      <div class="input-group">
        <label class="input-label">New Password</label>
        <input type="password" id="cp-new" class="form-input" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="input-group">
        <label class="input-label">Confirm New Password</label>
        <input type="password" id="cp-new2" class="form-input" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="login-error hidden" id="cp-error" role="alert"></div>
      <button type="submit" class="btn btn-primary btn-full">Update Password</button>
    </form>
  `);
}

async function handleChangePassword(e) {
  if (e) e.preventDefault();
  const cur = document.getElementById('cp-current').value;
  const nw = document.getElementById('cp-new').value;
  const nw2 = document.getElementById('cp-new2').value;
  const err = document.getElementById('cp-error');

  const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
  if (nw !== nw2) return fail('The two passwords do not match.');
  if (nw.length < 8) return fail('Password must be at least 8 characters.');

  const res = await API.changePassword(cur, nw);
  if (apiFailed(res)) return fail(res?.error || 'Could not update the password.');

  closeModal();
  showToast('✅ Password updated.');
}

/* ============================================================
   PROFILE EDITOR — includes the fields added for the reunion CSV:
   Blood Group, Occupation, Current Organization / Institution,
   Current Designation, HSC Passing Year / Group / Version.
   ============================================================ */

const BLOOD_GROUP_OPTIONS = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown','Prefer not to say'];
const OCCUPATION_OPTIONS = ['Student','Job','Business','Others'];
const HSC_GROUP_OPTIONS = ['Science','Business Studies','Humanities'];
const HSC_VERSION_OPTIONS = ['Bangla','English'];

async function showEditProfileV2() {
  const p = await API.getMyProfile();
  if (apiFailed(p)) { showToast(`⚠ ${p?.error || 'Could not load your profile.'}`); return; }

  const sel = (id, label, options, value, allowBlank = true) => `
    <div class="input-group">
      <label class="input-label">${escapeHtml(label)}</label>
      <select id="${id}" class="form-select">
        ${allowBlank ? `<option value="">Not specified</option>` : ''}
        ${options.map(o => `<option ${String(value) === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
      </select>
    </div>`;

  const txt = (id, label, value, type = 'text', placeholder = '') => `
    <div class="input-group">
      <label class="input-label">${escapeHtml(label)}</label>
      <input type="${type}" id="${id}" class="form-input" placeholder="${escapeHtml(placeholder)}"
             value="${escapeHtml(value ?? '')}" />
    </div>`;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">✏️ Edit My Profile</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="handleSaveProfileV2(event)">
      <div class="modal-section-title">Identity</div>
      ${txt('pf-name', 'Full Name', p.full_name)}
      ${txt('pf-mobile', 'Mobile Number', p.mobile_number, 'tel', '01XXXXXXXXX')}
      ${sel('pf-bloodGroup', 'Blood Group', BLOOD_GROUP_OPTIONS, p.blood_group)}

      <div class="modal-section-title mt-16">Academic</div>
      <div class="field-grid-2">
        ${txt('pf-hscPassingYear', 'HSC Passing Year / Batch', p.passing_year, 'number')}
        ${sel('pf-hscGroup', 'HSC Group', HSC_GROUP_OPTIONS, p.hsc_group)}
      </div>
      ${sel('pf-hscVersion', 'HSC Version', HSC_VERSION_OPTIONS, p.hsc_version)}

      <div class="modal-section-title mt-16">Professional</div>
      ${sel('pf-occupation', 'Occupation', OCCUPATION_OPTIONS, p.occupation)}
      ${txt('pf-organization', 'Current Organization / Institution', p.current_company, 'text', 'e.g. NZ Tex Group')}
      ${txt('pf-designation', 'Current Designation', p.job_title, 'text', 'e.g. AGM')}

      <div class="modal-section-title mt-16">Contact &amp; Links</div>
      ${txt('pf-presentAddress', 'Present Address', p.present_address)}
      ${txt('pf-facebook', 'Facebook Profile Link', p.facebook, 'url')}
      ${txt('pf-linkedin', 'LinkedIn', p.linkedin, 'url')}

      <div class="login-error hidden" id="pf-error" role="alert"></div>
      <button type="submit" class="btn btn-primary btn-full mt-16">Save Profile</button>
    </form>
  `);
}

async function handleSaveProfileV2(e) {
  if (e) e.preventDefault();
  const v = (id) => document.getElementById(id)?.value ?? '';

  const res = await API.updateMyProfile({
    name: v('pf-name'),
    mobile: v('pf-mobile'),
    bloodGroup: v('pf-bloodGroup'),
    hscPassingYear: v('pf-hscPassingYear'),
    hscGroup: v('pf-hscGroup'),
    hscVersion: v('pf-hscVersion'),
    occupation: v('pf-occupation'),
    organization: v('pf-organization'),
    designation: v('pf-designation'),
    presentAddress: v('pf-presentAddress'),
    facebook: v('pf-facebook'),
    linkedin: v('pf-linkedin')
  });

  if (apiFailed(res)) {
    const err = document.getElementById('pf-error');
    if (err) { err.textContent = res?.error || 'Could not save.'; err.classList.remove('hidden'); }
    return;
  }

  closeModal();
  showToast('✅ Profile updated.');
  if (state.currentUser && v('pf-name')) state.currentUser.name = v('pf-name').trim();
  updateUserUI();
  if (typeof render10SectionProfile === 'function') render10SectionProfile();
  renderAlumniGrid();
}

function showEditProfile() { return showEditProfileV2(); }
