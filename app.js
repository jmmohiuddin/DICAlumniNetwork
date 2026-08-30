/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE — ALUMNI PLATFORM
   Single-Institution System with 5-Level Role-Based Access Control
   ============================================================ */

'use strict';

/* A map of real administrator e-mail addresses next to a shared password used
   to live here, in a file served unauthenticated to every visitor. Anyone
   reading View Source could sign in as super_admin. Identity now comes only
   from POST /api/auth/login, and those accounts have been rotated. */


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

// Legacy data (nav items, chapters, jobs, notifications…) still stores a single
// emoji character per icon field. This maps that character to a Lucide icon
// name so those fields can render as real icons without ever reflecting
// arbitrary text into innerHTML — unmapped input silently falls back.
const EMOJI_ICON_MAP = {
  '🎓':'graduation-cap', '👥':'users', '👤':'user', '🔒':'lock', '🔓':'unlock',
  '🔐':'lock-keyhole', '⚠':'triangle-alert', '✅':'circle-check-big', '✓':'check',
  '✕':'x', '✗':'x', '❌':'circle-x', '🤝':'handshake', '🗑':'trash-2', '🛡':'shield',
  '➕':'plus', '🎫':'ticket', '🎟':'ticket', '📋':'clipboard-list', '🔍':'search',
  '📥':'download', '⬇':'download', '📍':'map-pin', '📌':'pin', '✎':'pen-line',
  '✏':'pen-line', '✐':'pen-line', '📝':'file-text', '🌐':'globe', '🏫':'school',
  '👑':'crown', '⚡':'zap', '🏢':'building-2', '🏛':'landmark', '🚀':'rocket',
  '💰':'circle-dollar-sign', '📱':'smartphone', '📲':'smartphone', '🎉':'party-popper',
  '📊':'bar-chart-3', '📈':'trending-up', '💼':'briefcase', '📜':'scroll-text',
  '🌙':'moon', '🔔':'bell', '🏆':'trophy', '⚙':'settings', '🔄':'refresh-cw',
  '🗳':'vote', '🟢':'circle', '🟡':'circle', '🔴':'circle', '🌟':'sparkle',
  '⭐':'star', '✦':'sparkle', '✨':'sparkles', '🏪':'store', '📅':'calendar',
  '🗓':'calendar-check', '🚚':'truck', '⬡':'hexagon', '📦':'package', '🎨':'palette',
  '🛒':'shopping-cart', '🍎':'wallet', '☀':'sun', '📭':'inbox', '💚':'heart',
  '❤':'heart', '💳':'credit-card', '🔑':'key', '🧩':'puzzle', '☰':'menu',
  '🎙':'mic', '🔤':'languages', '💻':'laptop', '🎪':'layout-grid', '👋':'hand',
  '📚':'book-open', '📷':'camera', '⛔':'ban', '📣':'megaphone', '📢':'megaphone',
  '📰':'newspaper', '🚗':'car', '📡':'satellite', '🪪':'id-card', '📁':'folder',
  '💾':'save', '🎯':'target', '💎':'gem', '💬':'message-circle', '✉':'mail',
  '★':'star', '☆':'star', '🚦':'gauge', '🤖':'bot', '📄':'file-text',
  '↻':'refresh-cw', '↩':'undo-2', '⇅':'repeat', '↑':'trending-up',
  '◉':'users', '◈':'calendar-days', '◎':'id-card', '▦':'layout-dashboard',
  '⏻':'log-out', '⏳':'hourglass', '⏱':'timer', '●':'circle-dot', '○':'circle',
  '◀':'chevron-left', '▲':'chevron-up', '▼':'chevron-down', '⏭':'skip-forward',
  '⊞':'layout-dashboard', '⟁':'webhook', '⊕':'map', '⟳':'users-round', 'ℹ':'info',
  '🇬🇧':'flag', '🇺🇸':'flag',
};

function emojiIcon(rawEmoji, fallbackIconName) {
  // v5 writes Lucide names directly into icon columns; older rows still hold
  // an emoji glyph, so both are accepted and both render as an icon.
  const looksLikeIconName = typeof rawEmoji === 'string' && /^[a-z][a-z0-9-]*$/.test(rawEmoji);
  const name = EMOJI_ICON_MAP[rawEmoji] || (looksLikeIconName ? rawEmoji : null)
             || fallbackIconName || 'circle';
  return `<i data-lucide="${name}" class="ui-icon" aria-hidden="true"></i>`;
}

function formatDate(value) {
  if (!value) return '';
  const s = String(value);
  // Date-only values are formatted from their parts; see evDate().
  const plain = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plain) {
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return plain[3] + ' ' + M[Number(plain[2]) - 1] + ' ' + plain[1];
  }
  const d = new Date(value);
  if (isNaN(d)) return s;
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
      <div class="state-icon"><i data-lucide="triangle-alert" class="ui-icon"></i></div>
      <div class="state-title">${escapeHtml(message)}</div>
      <div class="state-subtitle">The server or database did not respond.</div>
      ${retryFn ? `<button class="btn btn-secondary state-retry" onclick="${retryFn}"><i data-lucide="refresh-cw" class="ui-icon"></i> Retry</button>` : ''}
    </div>
  `;
}

// ─── AUTHENTICATION ─────────────────────────────────────────
// The only way into the app is POST /api/auth/login with credentials the user
// types. The client never holds a password and never chooses a role.

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

/* The two instant-role-switch helpers that used to sit here were removed. Both
   signed in with the hardcoded administrator credentials above, so any visitor
   — or any alumnus from the browser console — could obtain a super_admin
   session. A user role is now whatever the server says it is on
   /api/auth/login and /api/auth/me, read from the users row on every request;
   changing it requires an administrator changing users.role. */

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
  // Read-only: the role is reported by the server, not chosen in the browser.
  const topbarRole = document.getElementById('topbar-role-display');
  const drawerRole = document.getElementById('drawer-role-display');

  if (topbarAvatar) topbarAvatar.textContent = u.initials;
  if (sidebarAvatar) sidebarAvatar.textContent = u.initials;
  if (sidebarName) sidebarName.textContent = u.name;
  if (sidebarRole) sidebarRole.textContent = u.roleLabel;
  if (topbarRole) topbarRole.textContent = u.roleLabel;
  if (drawerRole) drawerRole.textContent = u.roleLabel;
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
    { id: 'events', icon: 'calendar-days', label: 'Events & Tickets', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
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
      <span class="nav-icon">${emojiIcon(item.icon, 'circle')}</span>
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

// ─── APP INITIALIZATION & ROLE-BASED DASHBOARDS ──────────────
function initApp() {
  updateUserUI();
  renderSidebarNav(state.currentUser.role);
  renderDashboard();

  // Initialize background data
  renderAlumniGrid();
  renderMentorships();
  renderCampaignsEnhanced();
  if (typeof startCampaignTicker === 'function') startCampaignTicker();
  renderEventsPage();
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
        <h1 class="page-title">Welcome back, ${u.name}! <i data-lucide="hand" class="ui-icon"></i></h1>
        <p class="page-subtitle">Daffodil International College · ${u.dept}</p>
      </div>
      <button class="btn btn-primary" onclick="showPage('profile')"><i data-lucide="id-card" class="ui-icon"></i> View Digital ID</button>
    </div>

    <!-- PROFILE COMPLETENESS -->
    <div class="profile-completeness-banner glass-card">
      <div class="pc-left">
        <div class="pc-title">DIC Profile Completeness</div>
        <div class="pc-track"><div class="pc-fill" style="width:85%"></div></div>
        <div class="pc-sub">85% complete — Gold Tier Alumni Status</div>
      </div>
      <div class="pc-score-ring">
        <div class="pc-ring-val" style="color:var(--daffodil-primary)">85%</div>
      </div>
    </div>

    <div class="dashboard-split">
      <div class="dashboard-left">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title"><i data-lucide="handshake" class="ui-icon"></i> Recommended DIC Alumni Connections</h3></div>
          <div id="dash-alumni-grid" class="alumni-grid"></div>
        </div>
        <div class="glass-card mt-16">
          <div class="card-header"><h3 class="card-title"><i data-lucide="calendar" class="ui-icon"></i> Upcoming DIC Events</h3></div>
          <div id="dash-events-grid" class="events-grid"></div>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title"><i data-lucide="trophy" class="ui-icon"></i> Top Donors Leaderboard</h3><span class="card-badge amber">FY 2026</span></div>
          <div id="donor-leaderboard"></div>
        </div>
        <div class="glass-card mt-16">
          <div class="card-header"><h3 class="card-title"><i data-lucide="vote" class="ui-icon"></i> DIC Live Poll</h3></div>
          <div id="dash-active-poll"></div>
        </div>
      </div>
    </div>
  `;
  renderAlumniGrid();
  renderEventsPage();
  renderDonorLeaderboard();
  renderActivePoll();
}

// <i data-lucide="shield" class="ui-icon"></i> 2. MODERATOR DASHBOARD
function renderModeratorDashboard(page) {
  const u = state.currentUser;
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><i data-lucide="shield" class="ui-icon"></i> Community Moderation Center</h1>
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
          <div class="card-header"><h3 class="card-title"><i data-lucide="search" class="ui-icon"></i> Pending Alumni Verification Queue</h3></div>
          <div id="verification-queue"></div>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title"><i data-lucide="triangle-alert" class="ui-icon"></i> Flagged Content Queue</h3></div>
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
        <h1 class="page-title"><i data-lucide="building-2" class="ui-icon"></i> Department Admin Center</h1>
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
          <div class="card-header"><h3 class="card-title"><i data-lucide="trending-up" class="ui-icon"></i> CSE Alumni Placement Funnel</h3></div>
          <canvas id="dashboard-chart" height="180"></canvas>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title"><i data-lucide="clipboard-list" class="ui-icon"></i> CSE Verification Queue</h3></div>
          <div id="verification-queue"></div>
        </div>
      </div>
    </div>
  `;
  renderVerificationQueue();
  setTimeout(initDashboardChart, 100);
}

// <i data-lucide="landmark" class="ui-icon"></i> 4. COLLEGE ADMIN DASHBOARD
function renderUnivAdminDashboard(page) {
  const u = state.currentUser;
  page.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><i data-lucide="landmark" class="ui-icon"></i> DIC Executive Command Center</h1>
        <p class="page-subtitle">Daffodil International College · FY 2026 Q3 Overview</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" onclick="showBroadcastModal()"><i data-lucide="megaphone" class="ui-icon"></i> College Broadcast</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card indigo">
        <div class="kpi-icon"><i data-lucide="users" class="ui-icon"></i></div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-alumni">38,420</div>
          <div class="kpi-label">Total DIC Verified Alumni</div>
          <div class="kpi-trend up"><i data-lucide="trending-up" class="ui-icon"></i> 9.2% this quarter</div>
        </div>
      </div>
      <div class="kpi-card teal">
        <div class="kpi-icon">৳</div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-funds">৳45.2L</div>
          <div class="kpi-label">Funds Collected</div>
          <div class="kpi-trend up"><i data-lucide="trending-up" class="ui-icon"></i> 14.8% YoY</div>
        </div>
      </div>
      <div class="kpi-card amber">
        <div class="kpi-icon"><i data-lucide="handshake" class="ui-icon"></i></div>
        <div class="kpi-body">
          <div class="kpi-value" id="kpi-mentors">3,800</div>
          <div class="kpi-label">Mentorship Connections</div>
          <div class="kpi-trend up"><i data-lucide="trending-up" class="ui-icon"></i> 83% completion</div>
        </div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-icon"><i data-lucide="ticket" class="ui-icon"></i></div>
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
          <div class="card-header"><h3 class="card-title"><i data-lucide="trending-up" class="ui-icon"></i> DIC 12-Month Alumni Engagement Trends</h3></div>
          <canvas id="dashboard-chart" height="180"></canvas>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title"><i data-lucide="trophy" class="ui-icon"></i> Top Benefactors</h3></div>
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
        <h1 class="page-title"><i data-lucide="crown" class="ui-icon"></i> DIC Super Admin Control Panel</h1>
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
          <div class="card-header"><h3 class="card-title"><i data-lucide="scroll-text" class="ui-icon"></i> Immutable System Security Audit Trail</h3><button class="btn btn-outline btn-sm" onclick="showPage('admin')">View Full Audit Log →</button></div>
          <div id="audit-log"></div>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title"><i data-lucide="settings" class="ui-icon"></i> Platform Feature Flags</h3></div>
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
  if (page === 'events') renderEventsPage();
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
    color: '#0B3897',
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
          borderColor: '#0B3897',
          backgroundColor: '#0B389718',
          borderWidth: 2.5,
          fill: false,
          tension: 0.4,
          pointBackgroundColor: '#0B3897',
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
            color: '#334155',
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
          bodyColor: '#C7D2E8',
          padding: 12,
          cornerRadius: 10,
        }
      },
      scales: {
        x: { grid: { color: 'rgba(11, 56, 151, 0.08)' }, ticks: { color: '#64748B', font: { size: 11, family: 'Inter' } } },
        y: { grid: { color: 'rgba(11, 56, 151, 0.08)' }, ticks: { color: '#64748B', font: { size: 11, family: 'Inter' } } }
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
        <button class="approve-btn" onclick="approveAlumni('${item.name}')"><i data-lucide="check" class="ui-icon"></i> Approve</button>
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
    container.innerHTML = renderEmptyState('<i data-lucide="search" class="ui-icon"></i>', 'No profiles match your search',
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
    btn.innerHTML = '<i data-lucide="check" class="ui-icon"></i> Connected';
    btn.classList.add('connected');
    btn.setAttribute('disabled', 'true');
    btn.style.background = 'rgba(0,212,170,0.15)';
    btn.style.color = 'var(--teal)';
    btn.style.borderColor = 'rgba(0,212,170,0.4)';
  } else {
    document.querySelectorAll('.connect-btn').forEach(b => {
      if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(name)) {
        b.innerHTML = '<i data-lucide="check" class="ui-icon"></i> Connected';
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
          ${a.verified ? '<div class="verified-badge-icon"><i data-lucide="check" class="ui-icon"></i></div>' : ''}
        </div>
        <div class="alumni-card-info">
          <div class="alumni-card-name">${escapeHtml(a.name)}</div>
          <div class="alumni-card-role">${escapeHtml(subtitle)}</div>
          <div class="alumni-card-location"><i data-lucide="map-pin" class="ui-icon"></i> ${escapeHtml(a.location || 'Location not set')}${a.batch ? ` · Batch ${a.batch}` : ''}</div>
        </div>
      </div>
      <div class="alumni-tags">
        ${(a.skills || []).map(s => `<span class="alumni-tag">${escapeHtml(s)}</span>`).join('')}
        ${a.mentor ? '<span class="alumni-tag mentor-tag"><i data-lucide="handshake" class="ui-icon"></i> Mentor</span>' : ''}
      </div>
      <div class="alumni-card-actions">
        <button class="connect-btn ${isConn ? 'connected' : ''}"
                onclick="event.stopPropagation(); connectAlumni('${nameAttr}', this)"
                ${isConn ? 'disabled' : ''}>${isConn ? '<i data-lucide="check" class="ui-icon"></i> Connected' : '+ Connect'}</button>
        ${a.mentor ? `<button class="mentor-req-btn" onclick="event.stopPropagation(); showMentorModal('${nameAttr}', ${a.id})"><i data-lucide="handshake" class="ui-icon"></i> Request Mentorship</button>` : ''}
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
        <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
          <div class="verified-badge-icon"><i data-lucide="check" class="ui-icon"></i></div>
        </div>
        <div style="flex:1">
          <div class="onboarding-title" style="font-size:18px">${profile.name}</div>
          <div class="onboarding-sub">${[profile.jobTitle, profile.company].filter(Boolean).join(" · ") || "Profile incomplete"}</div>
          <div style="font-size:11px;color:var(--teal);margin-top:2px"><i data-lucide="graduation-cap" class="ui-icon"></i> ${val(profile.degree)}${profile.batch ? ` (Batch ${profile.batch})` : ""} · ${val(profile.department)}</div>
        </div>
        <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;max-height:62vh;overflow-y:auto;padding-right:6px">
      <!-- AI MENTORSHIP VECTOR MATCH BADGE (REQ-04) -->
      <div style="background:linear-gradient(135deg, rgba(0,168,89,0.15), rgba(0,86,145,0.15));border:1px solid rgba(0,168,89,0.3);border-radius:var(--radius-sm);padding:10px 14px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:22px"><i data-lucide="bot" class="ui-icon"></i></span>
          <div>
            <div style="font-weight:700;font-size:13px;color:var(--teal)">${matchScore}% AI Mentorship Career Vector Match</div>
            <div style="font-size:11px;color:var(--text-secondary)">Evaluated against Industry (25%), Skill Gap (20%), and Campus Involvement</div>
          </div>
        </div>
        <span class="card-badge teal">${matchScore}% Match</span>
      </div>

      <!-- VERIFICATION BADGES -->
      <div class="verification-badges-grid">
        ${profile.studentId ? `<span class="verify-pill"><i data-lucide="check" class="ui-icon"></i> Student ID ${escapeHtml(profile.studentId)}</span>` : ""}
        ${profile.email ? `<span class="verify-pill"><i data-lucide="check" class="ui-icon"></i> Email Verified (${escapeHtml(profile.email)})</span>` : ""}
        <span class="verify-pill"><i data-lucide="check" class="ui-icon"></i> DIC Alumni Board Verified</span>
      </div>

      <!-- ABOUT BIO -->
      <div class="profile-section-card">
        <div class="profile-section-title" style="font-size:13px;font-weight:700;color:var(--teal)"><i data-lucide="pin" class="ui-icon"></i> About &amp; Biography</div>
        <div style="font-size:13px;color:var(--text-primary);margin-top:6px">${val(profile.bio)}</div>
      </div>

      <!-- CAREER & LOCATION -->
      <div class="profile-section-card">
        <div class="profile-section-title" style="font-size:13px;font-weight:700;color:var(--teal)"><i data-lucide="briefcase" class="ui-icon"></i> Professional &amp; Location Details</div>
        <div class="field-grid-2" style="margin-top:8px">
          <div><div class="field-label">Current Role &amp; Employer</div><div class="field-val">${profile.jobTitle || profile.company ? escapeHtml([profile.jobTitle, profile.company].filter(Boolean).join(" at ")) : unset}</div></div>
          <div><div class="field-label">Geographical Location</div><div class="field-val"><i data-lucide="map-pin" class="ui-icon"></i> ${val(profile.location)}</div></div>
          <div><div class="field-label">Primary Email</div><div class="field-val">${val(profile.email)}</div></div>
          <div><div class="field-label">Mobile Number</div><div class="field-val">${val(profile.mobile)}</div></div>
        </div>
      </div>

      <!-- SKILLS -->
      <div class="profile-section-card">
        <div class="profile-section-title" style="font-size:13px;font-weight:700;color:var(--teal)"><i data-lucide="zap" class="ui-icon"></i> Core Expertise &amp; Skills</div>
        <div class="alumni-tags" style="margin-top:8px">
          ${(profile.skills && profile.skills.length) ? profile.skills.map(s => `<span class="alumni-tag">${escapeHtml(s)}</span>`).join('') : unset}
        </div>
      </div>

      <!-- PRD UTILITIES (DIGITAL PASS & DSAR EXPORT) -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" style="flex:1" onclick="showToast('🎟 Generated DIC Wallet Pass (Apple/Google PKPass)')"><i data-lucide="ticket" class="ui-icon"></i> Download Digital Pass</button>
        <button class="btn btn-outline btn-sm" style="flex:1" onclick="exportProfileDSAR('${profile.name}')"><i data-lucide="download" class="ui-icon"></i> Export Data (DSAR JSON)</button>
      </div>

      <!-- ACTION BUTTONS -->
      <div class="field-grid-2" style="margin-top:10px">
        <button class="btn btn-primary btn-full" onclick="closeModal(); connectAlumni('${profile.name}')">+ Connect</button>
        <button class="btn btn-outline btn-full" onclick="closeModal(); showMentorModal('${escapeHtml(profile.name).replace(/'/g, '&#39;')}', ${profile.id})"><i data-lucide="handshake" class="ui-icon"></i> Request Mentorship</button>
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
          <div class="alumni-avatar" style="width:44px;height:44px;background:linear-gradient(135deg,rgba(11,56,151,0.3),rgba(0,212,170,0.3));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">${escapeHtml(initials || '??')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px">${escapeHtml(other)}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(m.subject)}</div>
          </div>
          <span class="mentorship-type-badge ${isMentor ? 'mentor' : 'mentee'}">${isMentor ? '<i data-lucide="graduation-cap" class="ui-icon"></i> Mentoring' : '<i data-lucide="book-open" class="ui-icon"></i> Learning'}</span>
          <button class="btn btn-ghost btn-sm" onclick="respondToMentorship(${m.id}, 'complete')">Complete</button>
        </div>`;
      }).join('') : renderEmptyState('<i data-lucide="handshake" class="ui-icon"></i>', 'No active mentorships', 'Accepted mentorship connections will appear here.');
    }
  }

  if (pending) {
    if (apiFailed(data)) {
      pending.innerHTML = '';
    } else if (data.incoming.length === 0) {
      pending.innerHTML = renderEmptyState('<i data-lucide="inbox" class="ui-icon"></i>', 'No pending requests');
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
          <span class="expiry-badge"><i data-lucide="timer" class="ui-icon"></i> ${daysLeft}d left</span>
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
      suggested.innerHTML = renderEmptyState('<i data-lucide="sparkles" class="ui-icon"></i>', 'No mentor matches yet');
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




// Every event gets its own planner (tasks, budget, etc). The dropdown is how
// an organizer switches between the events they've created — without it the
// workspace could only ever show event #1.


// The lightweight workspace for casual events (e.g. an Iftar party): just the
// event basics and "who's doing what", none of the budget/sponsor/vendor
// machinery a small get-together doesn't need.



















function filterJobs(value) { renderJobsEnhanced(value); }
function filterJobType(v) {
  state.jobFilters = { ...(state.jobFilters || {}), type: v === 'all' ? '' : v };
  renderJobsEnhanced();
}

// Restored verbatim from f293872. It sat between two event functions that were
// deleted during the Events rework and was removed with them, leaving the
// onchange handler at index.html:620 throwing a ReferenceError.
function filterJobLocation(v) {
  state.jobFilters = { ...(state.jobFilters || {}), location: v === 'all' ? '' : v };
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
        <div class="chapter-detail-icon">${emojiIcon(c.icon, 'hexagon')}</div>
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
        <div class="chapter-member"><span style="font-size:20px"><i data-lucide="user" class="ui-icon"></i></span><span>${m}</span></div>
      `).join('')}
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn ${isJoined ? 'btn-outline' : 'btn-primary'} btn-sm" id="btn-join-${c.id}" onclick="toggleJoinChapter(${c.id})">
          ${isJoined ? '<i data-lucide="check" class="ui-icon"></i> Joined Chapter' : '+ Join Chapter'}
        </button>
        <button class="btn btn-outline btn-sm" onclick="showChapterMembersModal(${c.id})"><i data-lucide="users" class="ui-icon"></i> View Members</button>
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
        <div class="onboarding-title"><i data-lucide="users" class="ui-icon"></i> Chapter Enrolled Members</div>
        <div class="onboarding-sub">${escapeHtml(c ? c.name : 'DIC Alumni Chapter')}</div>
        <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
      </div>
      ${renderEmptyState('<i data-lucide="user" class="ui-icon"></i>', 'No members yet', 'Be the first to join this chapter.')}
    `);
    return;
  }

  openModal(`
    <div class="onboarding-header">
      <div class="onboarding-title"><i data-lucide="users" class="ui-icon"></i> Chapter Enrolled Members</div>
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
    feed.innerHTML = renderEmptyState('<i data-lucide="newspaper" class="ui-icon"></i>', 'No stories published yet',
      'Approved alumni stories and college announcements will appear here.');
    return;
  }

  feed.innerHTML = stories.map(n => {
    const author = n.author_name || 'DIC Press Office';
    const date = n.published_date || formatDate(n.created_at);
    return `
    <div class="news-card">
      <div class="news-banner" style="background:linear-gradient(135deg, rgba(11,56,151,0.12), rgba(0,212,170,0.08))">${emojiIcon(n.emoji, 'sparkle')}</div>
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
          <span class="moderated-badge"><i data-lucide="check" class="ui-icon"></i> Published</span>
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
    el.innerHTML = renderEmptyState('<i data-lucide="sparkles" class="ui-icon"></i>', 'No mentors available yet');
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
    el.innerHTML = renderEmptyState('<i data-lucide="shield" class="ui-icon"></i>', 'No audit entries yet', 'Privileged actions are recorded here as they happen.');
    return;
  }

  el.innerHTML = rows.map(l => `
    <div class="audit-entry">
      <div class="audit-icon" style="background:${escapeHtml(l.bg_color || 'rgba(0,168,89,0.15)')}">${emojiIcon(l.icon, 'shield')}</div>
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

  const labels = { compliant: '<i data-lucide="check" class="ui-icon"></i> Compliant', pending: '<i data-lucide="clock" class="ui-icon"></i> No data yet', at_risk: '<i data-lucide="triangle-alert" class="ui-icon"></i> Action required' };
  el.innerHTML = items.map(c => `
    <div class="compliance-card ${c.status}">
      <div class="compliance-icon">${emojiIcon(c.icon, 'shield-check')}</div>
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
    el.innerHTML = renderEmptyState('<i data-lucide="bell" class="ui-icon"></i>', 'You are all caught up', 'New activity will show up here.');
    updateNotifBadge(0);
    return;
  }

  el.innerHTML = items.map(n => `
    <div class="notif-item${n.is_unread ? ' unread' : ''}${n.link_entity ? ' linked' : ''}"
         ${n.link_entity ? 'role="button" tabindex="0"' : ''}
         onclick="openNotification(${n.id}, '${n.link_entity || ''}', ${n.link_id || 'null'})"
         ${n.link_entity ? `onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"` : ''}>
      <div class="notif-item-icon">${emojiIcon(n.icon, 'bell')}</div>
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

/* Notifications carry link_entity/link_id, so clicking one opens the thing it
   is about instead of only marking it read. Staff land in the event workspace;
   an assignee who is not staff gets the task itself, which they can update. */
async function openNotification(id, entity, linkId) {
  markNotificationRead(id);
  if (!entity || !linkId) return;
  if (typeof closeNotifications === 'function') closeNotifications();

  if (entity === 'task') {
    showPage('events');
    if (evCanManage()) {
      const t = await API.getTask(linkId);
      if (!apiFailed(t) && t.event_id) {
        await openEventWorkspace(t.event_id, 'tasks');
        await evOpenTask(linkId);
        return;
      }
    }
    await evOpenTask(linkId);
    return;
  }

  if (entity === 'event') {
    showPage('events');
    if (evCanManage()) await openEventWorkspace(linkId, 'overview');
    return;
  }

  if (entity === 'ticket') {
    showPage('events');
    await evViewTicket(linkId);
  }
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
      <span>${emojiIcon(d.emoji, 'briefcase')}</span>
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
      colorDark: '#0B3897',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch(e) { el.style.background = '#fff'; el.innerHTML = '<div style="font-size:8px;color:#0B3897;padding:4px;text-align:center">QR Code</div>'; }
}

// ─── MODALS ──────────────────────────────────────────────────
let _modalReturnFocus = null;
// A data-entry form must not be dismissed by a stray click on the backdrop —
// that would silently throw away everything the user typed. Only read-only
// dialogs (a ticket, a public preview) opt back in via { dismissable: true }.
let _modalDismissable = false;

function showModal(html, options) {
  const opts = options || {};
  const body = document.getElementById('modal-body');
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (body) body.innerHTML = html;

  _modalDismissable = opts.dismissable === true;

  if (content) {
    // The creation wizard needs room for three step labels side by side.
    content.classList.toggle('modal-wide', opts.wide === true);
    content.setAttribute('role', 'dialog');
    content.setAttribute('aria-modal', 'true');
    const heading = content.querySelector('.modal-title');
    if (heading) {
      heading.id = heading.id || 'modal-heading';
      content.setAttribute('aria-labelledby', heading.id);
    } else {
      content.removeAttribute('aria-labelledby');
    }
    // Every close control is normalised here rather than trusting each call
    // site: an untyped <button> inside a <form> submits instead of closing.
    content.querySelectorAll('.modal-close').forEach(btn => {
      btn.setAttribute('type', 'button');
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Close');
      btn.dataset.modalClose = '1';
    });
  }

  if (overlay) overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  _modalReturnFocus = (_modalReturnFocus && document.getElementById('modal-overlay') &&
                       !overlay.classList.contains('hidden') && content.contains(document.activeElement))
    ? _modalReturnFocus            // re-render of an already-open dialog: keep the original opener
    : document.activeElement;

  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();

  requestAnimationFrame(() => {
    const first = content && content.querySelector(
      'input:not([type=hidden]):not([disabled]), select, textarea, button:not(.modal-close), [href], [tabindex]:not([tabindex="-1"])');
    (first || content)?.focus?.();
  });
}

// Delegated close handling. Survives every re-render of the dialog body,
// works for a click on the icon inside the button, and works on touch.
document.addEventListener('click', (e) => {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;

  const closer = e.target.closest && e.target.closest('[data-modal-close], .modal-close');
  if (closer) { e.preventDefault(); e.stopPropagation(); closeModal(); return; }

  // Backdrop: the click landed on the overlay itself, not inside the dialog.
  if (e.target === overlay && _modalDismissable) closeModal();
});

// Keeps Tab inside an open dialog rather than letting it walk the page behind.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  const overlay = document.getElementById('modal-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  const content = document.getElementById('modal-content');
  if (!content) return;

  const focusable = [...content.querySelectorAll(
    'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null || el === document.activeElement);
  if (!focusable.length) return;

  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

function openModal(html) {
  showModal(html);
}
window.openModal = showModal;

function closeModal(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
  _modalDismissable = false;
  // Hand focus back to whatever opened the dialog.
  if (_modalReturnFocus && document.contains(_modalReturnFocus)) {
    try { _modalReturnFocus.focus(); } catch (err) { /* element may be gone */ }
  }
  _modalReturnFocus = null;
}

// Escape closes whichever modal is open, independent of where the click
// actually lands — a keyboard-driven fallback for the close button.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const overlay = document.getElementById('modal-overlay');
  if (overlay && !overlay.classList.contains('hidden')) closeModal();
});

// ─── MENTOR REQUEST MODAL ───
function showMentorModal(mentorName = '', mentorId = null, matchScore = 0) {
  if (!mentorId) {
    showToast('ℹ Open a mentor from the suggestions list to send a request.');
    return;
  }
  showModal(`
    <div class="modal-header">
      <div class="modal-title"><i data-lucide="handshake" class="ui-icon"></i> Request a Mentor</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    <div class="socratic-prompt">
      <div class="socratic-prompt-icon"><i data-lucide="bot" class="ui-icon"></i></div>
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
    <button class="btn btn-primary btn-full" onclick="submitMentorRequest(${mentorId}, ${matchScore})"><i data-lucide="handshake" class="ui-icon"></i> Send Request</button>
    <div style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center">Unanswered requests expire automatically after 5 days.</div>
  `);
}



// ─── DONATE MODAL ───
function showDonateModal(campaignId, campaignName) {
  state.selectedAmount = null;
  state.selectedGateway = null;

  showModal(`
    <div class="modal-header">
      <div class="modal-title"><i data-lucide="heart" class="ui-icon"></i> Donate</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
        ${[['bkash','<i data-lucide="smartphone" class="ui-icon"></i>','bKash'],['nagad','<i data-lucide="smartphone" class="ui-icon"></i>','Nagad'],['rocket','<i data-lucide="rocket" class="ui-icon"></i>','Rocket'],['card','<i data-lucide="credit-card" class="ui-icon"></i>','Card']].map(([id, icon, label]) =>
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

// ─── POST JOB (was a toast-only shell) ───
function showPostJobModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title"><i data-lucide="plus" class="ui-icon"></i> Post a Job</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    <div style="background:var(--primary-glow);border:1px solid rgba(11,56,151,0.2);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--primary-light)">
      <i data-lucide="lock" class="ui-icon"></i> Alumni-only posting — visible to verified DIC alumni.
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
      <div class="modal-title"><i data-lucide="plus" class="ui-icon"></i> Create Chapter</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    <form onsubmit="handleCreateChapterSubmit(event)">
      <div class="input-group"><label class="input-label">Chapter Name</label><input type="text" id="chap-create-name" class="form-input" placeholder="e.g., Sylhet Regional Chapter" required /></div>
      <div class="input-group"><label class="input-label">Type</label><select id="chap-create-type" class="form-select"><option value="regional">Regional</option><option value="batch">Batch</option><option value="interest">Interest</option></select></div>
      <div class="input-group"><label class="input-label">Icon Emoji</label><input type="text" id="chap-create-icon" class="form-input" value="🏫" required /></div>
      <div class="input-group"><label class="input-label">Description</label><textarea id="chap-create-desc" class="form-input" rows="3" placeholder="What is this chapter for?"></textarea></div>
      <button type="submit" class="btn btn-primary btn-full mt-16"><i data-lucide="rocket" class="ui-icon"></i> Submit Chapter for Moderation</button>
    </form>
  `);
}

async function handleCreateChapterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('chap-create-name').value.trim();
  const type = document.getElementById('chap-create-type').value;
  const icon = document.getElementById('chap-create-icon').value.trim() || '<i data-lucide="school" class="ui-icon"></i>';
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
      <div class="modal-title"><i data-lucide="pen-line" class="ui-icon"></i> Write a Story</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
  const emoji = document.getElementById('story-create-emoji').value.trim() || '<i data-lucide="sparkle" class="ui-icon"></i>';
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
      <div class="modal-title"><i data-lucide="repeat" class="ui-icon"></i> Switch Institution</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
// message is developer-authored text that may embed a leading emoji plus
// server- or user-derived data (names, error strings). The emoji is mapped
// to a safe, fixed icon element; everything else stays textContent so
// interpolated data can never be interpreted as markup.
function showToast(message, iconName) {
  let toast = document.getElementById('toast-container');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-container';
    toast.className = 'toast-stack';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  const t = document.createElement('div');
  t.className = 'toast';

  // v5 callers pass a Lucide name. Older callers still prefix an emoji, which
  // is mapped to the equivalent icon and stripped from the text.
  let name = iconName || null;
  if (!name) {
    const lead = message.match(/^(\S+)\s*/);
    if (lead && EMOJI_ICON_MAP[lead[1]]) {
      name = EMOJI_ICON_MAP[lead[1]];
      message = message.slice(lead[0].length);
    }
  }
  if (name) {
    const iconEl = document.createElement('i');
    iconEl.setAttribute('data-lucide', name);
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.className = 'ui-icon toast-icon';
    t.appendChild(iconEl);
  }

  const span = document.createElement('span');
  span.textContent = message;
  t.appendChild(span);

  toast.appendChild(t);
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 3200);
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
    if (btn) btn.innerHTML = '<i data-lucide="chevron-up" class="ui-icon"></i> Show Less';
  } else {
    target.classList.add('hidden');
    if (btn) btn.innerHTML = '<i data-lucide="chevron-down" class="ui-icon"></i> Show More';
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

// ─── LUCIDE ICON RENDERING ────────────────────────────────────
// The UI is built almost entirely from innerHTML template strings, so
// <i data-lucide="..."> placeholders keep appearing as the app re-renders.
// Re-scanning after every DOM mutation (instead of after each render call)
// means every one of those call sites gets icons for free.
(function () {
  function renderIcons() {
    if (window.lucide) lucide.createIcons();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderIcons);
  } else {
    renderIcons();
  }
  // Trailing debounce rather than a single rAF: the app's dashboards render
  // progressively as each API call resolves, so mutations can land across
  // several ticks. Each new mutation pushes the timer back, guaranteeing a
  // final createIcons() pass once the burst actually settles.
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderIcons, 50);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();

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
    container.innerHTML = renderEmptyState('<i data-lucide="heart" class="ui-icon"></i>', 'No active campaigns', 'Fundraising campaigns will appear here once launched.');
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
          <span><i data-lucide="users" class="ui-icon"></i> ${Number(c.donors_count || 0).toLocaleString()} donors</span>
          <span><i data-lucide="calendar" class="ui-icon"></i> ${c.days_left} days left</span>
        </div>
      </div>
      <div class="campaign-footer">
        <div class="gateway-pills">
          ${gateways.map(g => `<span class="gateway-pill ${escapeHtml(g)}">${escapeHtml(g.charAt(0).toUpperCase() + g.slice(1))}</span>`).join('')}
        </div>
        <div style="display:flex;gap:6px">
          ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="deleteCampaignPrompt(${c.id}, '${safeName}')"><i data-lucide="trash-2" class="ui-icon"></i></button>` : ''}
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
      <div class="modal-title"><i data-lucide="handshake" class="ui-icon"></i> Request a Referral</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
    <button class="btn btn-primary btn-full" onclick="submitReferralRequest(${jobId})"><i data-lucide="handshake" class="ui-icon"></i> Send Referral Request</button>
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
    container.innerHTML = renderEmptyState('<i data-lucide="briefcase" class="ui-icon"></i>', 'No openings match your filters',
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
      <div class="job-company-logo">${emojiIcon(j.emoji, 'briefcase')}</div>
      <div class="job-info">
        <div class="job-title">${escapeHtml(j.title)}</div>
        <div class="job-company">${escapeHtml(j.company)}</div>
        <div class="job-meta">
          <span class="job-meta-item"><i data-lucide="map-pin" class="ui-icon"></i> ${escapeHtml(j.location || '—')}</span>
          <span class="job-meta-item"><i data-lucide="user" class="ui-icon"></i> ${escapeHtml(j.posted_by_name || 'DIC Alumni')}</span>
          <span class="job-meta-item">🕒 ${escapeHtml(formatRelativeTime(j.created_at))}</span>
          <span class="job-meta-item"><i data-lucide="download" class="ui-icon"></i> ${j.applicants} applicant${j.applicants === 1 ? '' : 's'}</span>
        </div>
        <div class="job-tags">${tags.map(t => `<span class="job-tag">${escapeHtml(t)}</span>`).join('')}</div>
      </div>
      <div class="job-right">
        <div class="job-salary">${escapeHtml(j.salary || 'Negotiable')}</div>
        <span class="job-type-badge ${escapeHtml(j.type)}">${escapeHtml((j.type || '').charAt(0).toUpperCase() + (j.type || '').slice(1))}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${mine || isAdmin
            ? `<button class="apply-btn" onclick="showJobApplicants(${j.id}, '${safeTitle}')"><i data-lucide="users" class="ui-icon"></i> Applicants (${j.applicants})</button>
               <button class="referral-btn" onclick="deleteJobPrompt(${j.id}, '${safeTitle}')"><i data-lucide="trash-2" class="ui-icon"></i> Delete</button>`
            : `<button class="apply-btn" ${j.has_applied ? 'disabled' : ''} onclick="applyJob(${j.id}, '${safeTitle}')">${j.has_applied ? '<i data-lucide="check" class="ui-icon"></i> Applied' : 'Apply →'}</button>
               <button class="referral-btn" onclick="showReferralModal(${j.id}, '${safeTitle}', '${escapeHtml(j.posted_by_name || '').replace(/'/g, '&#39;')}')"><i data-lucide="handshake" class="ui-icon"></i> Referral</button>`}
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
        <div class="career-update-badge ${c.updateType}">${c.updateType === 'ai' ? '<i data-lucide="bot" class="ui-icon"></i> AI Updated' : c.updateType === 'self' ? '<i data-lucide="pen-line" class="ui-icon"></i> Self-Reported' : '<i data-lucide="hourglass" class="ui-icon"></i> Pending'}</div>
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
      <div class="modal-title"><i data-lucide="pen-line" class="ui-icon"></i> Update My Career</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    <div class="socratic-prompt">
      <div class="socratic-prompt-icon"><i data-lucide="bot" class="ui-icon"></i></div>
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
      <i data-lucide="lock" class="ui-icon"></i> Opt-out: You can hide any field from AI enrichment. Your scraping opt-out preference is stored encrypted.
    </div>
    <button class="btn btn-primary btn-full" onclick="closeModal(); showToast('✅ Career updated! Profile visible to DIC alumni.')">Save Career Update</button>
  `);
}

function showSelfReportModal(name) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title"><i data-lucide="pen-line" class="ui-icon"></i> Confirm Career Info</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Confirming career info for <strong>${name}</strong>. Please review and update if needed.</p>
    <div class="input-group"><label class="input-label">Current Employer</label><input type="text" class="form-input" placeholder="Company name" /></div>
    <div class="input-group"><label class="input-label">Current Role</label><input type="text" class="form-input" placeholder="Job title" /></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary" onclick="closeModal(); showToast('✅ Career info confirmed for ${name}')"><i data-lucide="check" class="ui-icon"></i> Confirm & Save</button>
      <button class="btn btn-outline" onclick="closeModal(); showToast('⏭ Skipped — will prompt again in 30 days')">Skip for Now</button>
    </div>
  `);
}

function showCareerPrivacyModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title"><i data-lucide="lock" class="ui-icon"></i> Career Privacy Controls</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
  roles: ['Super Admin', 'School Owner', 'Alumni Dir.', 'Chapter Off.', 'Content Mod.', 'Event Mgr.', 'Alumni <i data-lucide="check" class="ui-icon"></i>', 'Alumni <i data-lucide="x" class="ui-icon"></i>', 'Student', 'Finance Aud.', 'API Dev.', 'System'],
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
        <button class="btn btn-primary btn-sm" onclick="showToast('🔄 Manual sync triggered — 6 items syncing…')"><i data-lucide="refresh-cw" class="ui-icon"></i> Sync Now</button>
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
        ? '<div style="text-align:center;padding:24px;color:var(--text-muted)"><i data-lucide="check" class="ui-icon"></i> No conflicts</div>'
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
    el.innerHTML = renderEmptyState('<i data-lucide="megaphone" class="ui-icon"></i>', 'No broadcasts sent yet', 'Announcements you send will be listed here with delivery counts.');
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
      <div class="api-app-icon">${emojiIcon(a.icon, 'app-window')}</div>
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
      <span class="webhook-status ${w.status}">${w.status === 'active' ? '<i data-lucide="circle-dot" class="ui-icon"></i> Active' : '<i data-lucide="circle" class="ui-icon"></i> Inactive'}</span>
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
      <div class="sis-integration-icon">${emojiIcon(s.icon, 'link')}</div>
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
      <div class="modal-title"><i data-lucide="file-text" class="ui-icon"></i> OpenAPI Documentation</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
    <button class="btn btn-outline btn-full" onclick="showToast('📄 Full OpenAPI spec downloading as YAML…')"><i data-lucide="download" class="ui-icon"></i> Download Full Spec</button>
  `);
}

function showCreateApiApp() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">+ New OAuth2 Application</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
          <div class="branding-editor-title"><i data-lucide="palette" class="ui-icon"></i> Branding</div>
          <div class="branding-color-grid">
            <div class="color-field">
              <div class="color-swatch" style="background:#0B3897" title="Primary color" onclick="showToast('🎨 Color picker for Primary')"></div>
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
        <div style="font-size:12px;color:var(--red);margin-top:6px"><i data-lucide="triangle-alert" class="ui-icon"></i> Subscription expired Jul 1, 2026 · 72 day grace period remaining</div>
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
    el.innerHTML = renderEmptyState('<i data-lucide="trophy" class="ui-icon"></i>', 'No donations yet', 'The top contributors will be listed here.');
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


async function renderEventROIAnalytics() {
  const table = document.getElementById('event-roi-table');
  const summary = document.getElementById('roi-summary');
  if (!table) return;

  // v5: real figures from the events API. This panel previously rendered a
  // hardcoded MOCK_EVENT_ROI array that looked like live reporting.
  table.innerHTML = renderSkeletonCards(2, 'analytics');
  const events = await API.getEvents({ scope: 'manage', status: 'all' });

  if (apiFailed(events)) {
    table.innerHTML = renderErrorState(events && events.error ? events.error : 'Could not load event data.',
      'renderEventROIAnalytics()');
    if (summary) summary.innerHTML = '';
    evRefreshIcons();
    return;
  }
  if (!events.length) {
    table.innerHTML = renderEmptyState('<i data-lucide="calendar" class="ui-icon"></i>',
      'No events yet', 'Attendance and revenue appear here once events exist.');
    if (summary) summary.innerHTML = '';
    evRefreshIcons();
    return;
  }

  const rows = events.map(function (e) {
    const reg = e.registered || 0;
    const cap = e.capacity || 0;
    return {
      name: e.title,
      registered: reg,
      capacity: cap,
      checkedIn: e.checked_in || 0,
      fill: cap ? Math.round((reg / cap) * 100) : 0,
      revenue: Number(e.revenue || 0)
    };
  });

  table.innerHTML =
    '<div class="table-scroll"><table class="rbac-table"><thead><tr>' +
      '<th>Event</th><th>Registered</th><th>Capacity</th><th>Fill rate</th>' +
      '<th>Checked in</th><th>Ticket revenue</th>' +
    '</tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr><td style="font-weight:700">' + escapeHtml(r.name) + '</td>' +
        '<td>' + r.registered.toLocaleString() + '</td>' +
        '<td>' + r.capacity.toLocaleString() + '</td>' +
        '<td><span class="card-badge ' + (r.fill >= 80 ? 'teal' : '') + '">' + r.fill + '%</span></td>' +
        '<td>' + r.checkedIn.toLocaleString() + '</td>' +
        '<td style="font-weight:700">' + evMoney(r.revenue) + '</td></tr>';
    }).join('') + '</tbody></table></div>';

  if (summary) {
    const totalReg = rows.reduce(function (a, r) { return a + r.registered; }, 0);
    const totalCap = rows.reduce(function (a, r) { return a + r.capacity; }, 0);
    const totalRev = rows.reduce(function (a, r) { return a + r.revenue; }, 0);
    const totalIn = rows.reduce(function (a, r) { return a + r.checkedIn; }, 0);
    const stat = function (label, value) {
      return '<div class="enrichment-stat-item"><span class="enrichment-stat-label">' + label +
             '</span><span class="enrichment-stat-val">' + value + '</span></div>';
    };
    summary.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px">' +
      stat('Events', rows.length) +
      stat('Total registered', totalReg.toLocaleString()) +
      stat('Overall fill rate', (totalCap ? Math.round((totalReg / totalCap) * 100) : 0) + '%') +
      stat('Total checked in', totalIn.toLocaleString()) +
      stat('Total ticket revenue', evMoney(totalRev)) +
      '</div>';
  }
  evRefreshIcons();
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
    ? `<div class="vault-banner ok"><i data-lucide="lock-keyhole" class="ui-icon"></i> AES-256-GCM encryption active. Values are decryptable only with a logged reason.</div>`
    : `<div class="vault-banner warn"><i data-lucide="triangle-alert" class="ui-icon"></i> ENCRYPTION_KEY is not configured — the vault is refusing to store identity data.</div>`;

  el.innerHTML = `
    ${banner}
    <div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="showStoreIdentityModal()"><i data-lucide="plus" class="ui-icon"></i> Encrypt a field</button>
      <button class="btn btn-ghost btn-sm" onclick="showVaultAccessLogs()"><i data-lucide="scroll-text" class="ui-icon"></i> Access log</button>
    </div>
    ${data.entries.length === 0
      ? renderEmptyState('<i data-lucide="lock-keyhole" class="ui-icon"></i>', 'No identity fields stored', 'Encrypted NID / BRC records will be listed here, masked.')
      : `<div style="display:flex;flex-direction:column;gap:8px">
          ${data.entries.map(v => `
            <div class="vault-row">
              <div class="vault-icon"><i data-lucide="id-card" class="ui-icon"></i></div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13px">${escapeHtml(v.owner_name)}</div>
                <div style="font-size:12px;color:var(--text-secondary)">
                  ${escapeHtml(v.field_type.toUpperCase())} · <span style="font-family:monospace">•••• •••• ${escapeHtml(v.last_four || '••••')}</span>
                </div>
              </div>
              <button class="btn btn-sm btn-outline" onclick="decryptVaultField(${v.id}, '${escapeHtml(v.owner_name).replace(/'/g, '&#39;')}')"><i data-lucide="unlock" class="ui-icon"></i> Decrypt</button>
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
  strategy: 'generated',
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
          <h3 class="card-title"><i data-lucide="download" class="ui-icon"></i> Bulk User Import &amp; Automatic Profile Generation</h3>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:2px">Upload CSV or Excel files to import hundreds of student/alumni records simultaneously with automated login accounts &amp; email notifications.</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="downloadSampleImportCSV()"><i data-lucide="file-text" class="ui-icon"></i> Download CSV Template</button>
      </div>

      <!-- WIZARD STEPS INDICATOR -->
      <div class="import-wizard-steps">
        <div class="wizard-step-item ${currentImportState.step === 1 ? 'active' : ''}">
          <span class="wizard-step-num">1</span> <i data-lucide="folder" class="ui-icon"></i> Upload File
        </div>
        <div class="wizard-step-item ${currentImportState.step === 2 ? 'active' : ''}">
          <span class="wizard-step-num">2</span> <i data-lucide="search" class="ui-icon"></i> Validation Engine
        </div>
        <div class="wizard-step-item ${currentImportState.step === 3 ? 'active' : ''}">
          <span class="wizard-step-num">3</span> <i data-lucide="zap" class="ui-icon"></i> Preview &amp; Duplicates
        </div>
        <div class="wizard-step-item ${currentImportState.step === 4 ? 'active' : ''}">
          <span class="wizard-step-num">4</span> <i data-lucide="party-popper" class="ui-icon"></i> Accounts Created
        </div>
      </div>

      <div id="wizard-step-container">
        ${renderWizardStepContent()}
      </div>
    </div>

    <!-- HISTORICAL IMPORT AUDIT LOG -->
    <div class="glass-card mt-16">
      <div class="card-header">
        <h3 class="card-title"><i data-lucide="scroll-text" class="ui-icon"></i> Import Activity History &amp; Audit Trail</h3>
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
                <td><i data-lucide="file-text" class="ui-icon"></i> ${escapeHtml(h.filename)}</td>
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
        <div class="dropzone-icon"><i data-lucide="file-text" class="ui-icon"></i></div>
        <div class="dropzone-title">Click to choose a CSV file</div>
        <div class="dropzone-sub">Headers are detected and mapped automatically. Timestamp and
          &ldquo;Commicate with&rdquo; are excluded by default.</div>
      </div>

      <div class="field-grid-2" style="margin-top:16px">
        <div class="input-group">
          <label class="input-label">Initial Password Policy</label>
          <select class="form-select" id="password-strategy-select" onchange="currentImportState.strategy = this.value">
            <option value="generated">Generate a temporary password for this batch</option>
          </select>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
            The password is created when you confirm the import and shown to you once,
            on the next screen. Stored only as a scrypt hash; every imported account is
            flagged to change it on first login.
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

      <button class="btn btn-outline btn-full mt-16" onclick="downloadSampleImportCSV()"><i data-lucide="download" class="ui-icon"></i> Download a sample template</button>
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
        <div style="font-weight:700;font-size:14px"><i data-lucide="file-text" class="ui-icon"></i> ${escapeHtml(filename)} — ${totalRows} rows, ${headers.length} columns</div>
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
              onclick="validateImportRows()"><i data-lucide="check" class="ui-icon"></i> Confirm mapping and validate ${totalRows} rows</button>
    `;
  }

  if (currentImportState.step === 2 || currentImportState.step === 3) {
    const validCount = currentImportState.validRecords.length;
    const invalidCount = currentImportState.invalidRecords.length;
    const dupCount = currentImportState.duplicateRecords.length;

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-weight:700;font-size:14px;color:var(--text-primary)">
          <i data-lucide="file-text" class="ui-icon"></i> Parsed File: <strong>"${currentImportState.filename}"</strong> (${currentImportState.totalRows} Total Records)
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
          <div style="font-weight:700;color:var(--amber);margin-bottom:6px"><i data-lucide="triangle-alert" class="ui-icon"></i> ${dupCount} Duplicate Records Detected (Priority: StudentID &gt; Roll &gt; Email &gt; Phone)</div>
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
                <td style="color:var(--teal);font-size:11px"><i data-lucide="check" class="ui-icon"></i> Ready for Account Creation</td>
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
                <td style="color:var(--amber);font-size:11px"><i data-lucide="triangle-alert" class="ui-icon"></i> Matches existing alumni ID ${r.studentId}</td>
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
                <td style="color:var(--red);font-size:11px"><i data-lucide="circle-x" class="ui-icon"></i> ${r.errorMsg}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
        ${invalidCount > 0 ? `
          <button class="btn btn-outline btn-sm" onclick="downloadImportErrorReportCSV()"><i data-lucide="download" class="ui-icon"></i> Download Error Report (${invalidCount} rows)</button>
        ` : '<div></div>'}
        <button class="btn btn-primary" onclick="executeBulkImportProcess()"><i data-lucide="rocket" class="ui-icon"></i> Confirm &amp; Create ${validCount} Accounts →</button>
      </div>
    `;
  }

  if (currentImportState.step === 4) {
    return `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:48px;margin-bottom:8px"><i data-lucide="party-popper" class="ui-icon"></i></div>
        <h2 style="color:var(--teal);font-size:22px;font-weight:800">Bulk Import &amp; Profile Generation Complete!</h2>
        <p style="color:var(--text-secondary);font-size:13px;max-width:500px;margin:8px auto 20px">
          Successfully created <strong>${currentImportState.validRecords.length} User Accounts &amp; Alumni Profiles</strong> in the database.
        </p>

        ${currentImportState.lastResult?.temporaryPassword ? `
          <div style="max-width:520px;margin:0 auto 20px;padding:14px 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface-2);text-align:left">
            <div style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;color:var(--text-primary)">
              <i data-lucide="key-round" class="ui-icon"></i> Temporary password for this batch
            </div>
            <div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:18px;font-weight:700;letter-spacing:1px;margin:10px 0;color:var(--teal);user-select:all">${esc(currentImportState.lastResult.temporaryPassword)}</div>
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">
              Every account created by this import signs in with this password once, then
              has to choose their own. It is shown here only — it is not stored anywhere
              you can read it back, and leaving this screen loses it. Copy it now.
            </div>
          </div>
        ` : ''}

        <div style="display:inline-flex;gap:12px;justify-content:center">
          <button class="btn btn-primary" onclick="showPage('directory')"><i data-lucide="users" class="ui-icon"></i> View Alumni Directory</button>
          <button class="btn btn-outline" onclick="resetImportWizard()"><i data-lucide="download" class="ui-icon"></i> Import Another File</button>
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
      <button type="submit" class="btn btn-primary btn-full"><i data-lucide="plus" class="ui-icon"></i> Add Custom Field</button>
    </form>
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px">
      ${fields.length ? fields.map(f => `
        <div class="custom-field-row">
          <div class="vault-icon"><i data-lucide="puzzle" class="ui-icon"></i></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">${escapeHtml(f.label)}${f.is_required ? ' <span style="color:var(--red)">*</span>' : ''}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(f.section)} · ${escapeHtml(f.field_type)} · <span style="font-family:monospace;font-size:11px">${escapeHtml(f.id)}</span></div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="deleteCustomField('${escapeHtml(f.id)}', '${escapeHtml(f.label).replace(/'/g, '&#39;')}')"><i data-lucide="trash-2" class="ui-icon"></i></button>
        </div>`).join('')
      : renderEmptyState('<i data-lucide="puzzle" class="ui-icon"></i>', 'No custom fields yet', 'Add schema fields without a code change.')}
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
          <div class="profile-section-title"><i data-lucide="user" class="ui-icon"></i> Section 1: Basic &amp; Academic Identity</div>
          <span class="privacy-badge public"><i data-lucide="globe" class="ui-icon"></i> Public</span>
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
          <div class="profile-section-title"><i data-lucide="smartphone" class="ui-icon"></i> Section 2: Contact &amp; Emergency Details</div>
          <span class="privacy-badge ${priv.mobile}">${priv.mobile === 'private' ? '<i data-lucide="lock" class="ui-icon"></i> Private' : '<i data-lucide="globe" class="ui-icon"></i> Public'}</span>
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
          <div class="profile-section-title"><i data-lucide="map-pin" class="ui-icon"></i> Section 3: Address &amp; Geographical Location</div>
          <span class="privacy-badge ${priv.address}">${priv.address === 'private' ? '<i data-lucide="lock" class="ui-icon"></i> Private' : '<i data-lucide="users" class="ui-icon"></i> Alumni Only'}</span>
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
          <div class="profile-section-title"><i data-lucide="graduation-cap" class="ui-icon"></i> Section 4: Academic Honors &amp; Publications</div>
          <span class="privacy-badge alumni"><i data-lucide="users" class="ui-icon"></i> Alumni Only</span>
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
          <div class="profile-section-title"><i data-lucide="briefcase" class="ui-icon"></i> Section 5: Professional Career &amp; Experience</div>
          <span class="privacy-badge public"><i data-lucide="globe" class="ui-icon"></i> Public</span>
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
          <div class="profile-section-title"><i data-lucide="handshake" class="ui-icon"></i> Section 6: Networking &amp; Mentorship Status</div>
          <span class="privacy-badge public"><i data-lucide="globe" class="ui-icon"></i> Public</span>
        </div>
        <div class="verification-badges-grid mb-16">
          <span class="verify-pill" style="background:rgba(0,168,89,0.2)"><i data-lucide="check" class="ui-icon"></i> Open for Mentoring Students</span>
          <span class="verify-pill" style="background:rgba(0,212,170,0.2)"><i data-lucide="check" class="ui-icon"></i> Actively Hiring at Brain Station 23</span>
          <span class="verify-pill"><i data-lucide="check" class="ui-icon"></i> Available for Startup Collaboration</span>
        </div>
      </div>
    `;
  }

  // 7. SOCIAL PROFILES
  if (filterSection === 'all' || filterSection === 'social') {
    html += `
      <div class="profile-section-card">
        <div class="profile-section-header">
          <div class="profile-section-title"><i data-lucide="globe" class="ui-icon"></i> Section 7: Social Profiles &amp; Portfolio</div>
          <span class="privacy-badge public"><i data-lucide="globe" class="ui-icon"></i> Public</span>
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
            <div class="profile-section-title"><i data-lucide="settings" class="ui-icon"></i> Section 8: Admin Custom Institution Fields</div>
            <span class="privacy-badge alumni"><i data-lucide="users" class="ui-icon"></i> DIC Portal Only</span>
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
      <div class="onboarding-title"><i data-lucide="pen-line" class="ui-icon"></i> Edit Comprehensive Profile</div>
      <div class="onboarding-sub">Update your 10-section profile details and field privacy settings</div>
    </div>

    <form onsubmit="handleSaveProfileV2(event)" style="display:flex;flex-direction:column;gap:14px;margin-top:14px;max-height:60vh;overflow-y:auto;padding-right:6px">
      <div class="input-group"><label class="input-label">Full Name</label><input type="text" id="edit-fullname" class="form-input" value="${p.fullName}" required /></div>
      <div class="input-group"><label class="input-label">Current Company &amp; Job Title</label><input type="text" id="edit-company" class="form-input" value="${p.currentCompany}" required /></div>
      <div class="input-group"><label class="input-label">Technical Skills (Comma separated)</label><input type="text" id="edit-skills" class="form-input" value="${p.skills}" required /></div>
      <div class="input-group"><label class="input-label">LinkedIn Profile URL</label><input type="url" id="edit-linkedin" class="form-input" value="${p.linkedin}" /></div>
      <div class="input-group"><label class="input-label">Mobile Number Privacy Level</label>
        <select class="form-select" id="edit-priv-mobile">
          <option value="public" ${PROFILE_PRIVACY_SETTINGS.mobile === 'public' ? 'selected' : ''}>Public (Everyone)</option>
          <option value="alumni" ${PROFILE_PRIVACY_SETTINGS.mobile === 'alumni' ? 'selected' : ''}>DIC Alumni Only</option>
          <option value="private" ${PROFILE_PRIVACY_SETTINGS.mobile === 'private' ? 'selected' : ''}>Private (Only Me)</option>
        </select>
      </div>
      <div class="input-group"><label class="input-label">Biography</label><textarea id="edit-bio" class="form-input" rows="3">${p.bio}</textarea></div>
      <button type="submit" class="btn btn-primary btn-full mt-16"><i data-lucide="save" class="ui-icon"></i> Save Profile &amp; Update ID Card</button>
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
        <h3 class="card-title"><i data-lucide="target" class="ui-icon"></i> Advanced Alumni Audience Segmentation</h3>
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
        <button class="btn btn-primary btn-sm" onclick="showBroadcastModal()"><i data-lucide="megaphone" class="ui-icon"></i> Broadcast to Segment</button>
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
    el.innerHTML = renderEmptyState('<i data-lucide="vote" class="ui-icon"></i>', 'No active poll');
    return;
  }

  el.innerHTML = `
    <div class="poll-header">
      <div class="poll-title"><i data-lucide="vote" class="ui-icon"></i> Institutional Alumni Poll</div>
      <div class="poll-meta"><i data-lucide="circle" class="ui-icon"></i> Live · ${poll.total} vote${poll.total === 1 ? '' : 's'}</div>
    </div>
    <div class="poll-question-text">${escapeHtml(poll.question)}</div>
    <div class="poll-options">
      ${poll.options.map((o, idx) => {
        const pct = poll.total ? Math.round((poll.counts[idx] / poll.total) * 100) : 0;
        const mine = poll.myVote === idx;
        return `
        <button class="poll-option-btn${mine ? ' voted' : ''}" onclick="votePoll(${poll.id}, ${idx})">
          <div class="poll-option-bar" style="width:${pct}%"></div>
          <span class="poll-option-text">${mine ? '<i data-lucide="check" class="ui-icon"></i> ' : ''}${escapeHtml(o)}</span>
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
        <div style="font-size:10px;color:var(--teal)"><i data-lucide="check" class="ui-icon"></i> 1-on-1 Matching won (64%)</div>
      </div>
      <div style="padding:6px 0">
        <div style="font-weight:700">Digital ID Card Design</div>
        <div style="font-size:10px;color:var(--teal)"><i data-lucide="check" class="ui-icon"></i> Glassmorphism Dark won (78%)</div>
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
      <div class="score-badge-circle"><i data-lucide="crown" class="ui-icon"></i></div>
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
          <div class="badge-icon">${emojiIcon(b.icon, 'award')}</div>
          <div class="badge-title">${b.title}</div>
          <div class="badge-desc">${b.desc}</div>
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
        <h3 class="card-title"><i data-lucide="school" class="ui-icon"></i> Pending Chapter Creation Approvals (${pendingChapters.length})</h3>
        <span class="card-badge ${pendingChapters.length > 0 ? 'amber' : 'teal'}">${pendingChapters.length} Pending Review</span>
      </div>
      ${pendingChapters.length === 0 ? `
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px"><i data-lucide="check" class="ui-icon"></i> No pending chapter review requests at this time.</div>
      ` : `
        <div class="table-scroll">
          <table class="rbac-table">
            <thead>
              <tr><th>Icon</th><th>Chapter Name</th><th>Type</th><th>Description</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${pendingChapters.map(c => `
                <tr>
                  <td style="font-size:20px">${emojiIcon(c.icon, 'hexagon')}</td>
                  <td><strong>${c.name}</strong></td>
                  <td><span class="card-badge teal">${c.type}</span></td>
                  <td style="font-size:12px;color:var(--text-secondary)">${c.description || 'No description provided'}</td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-sm btn-primary" onclick="handleModerateChapter(${c.id}, 'approve')">Approve <i data-lucide="check" class="ui-icon"></i></button>
                      <button class="btn btn-sm btn-danger" onclick="handleModerateChapter(${c.id}, 'reject')">Reject <i data-lucide="x" class="ui-icon"></i></button>
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
        <h3 class="card-title"><i data-lucide="pen-line" class="ui-icon"></i> Pending Story &amp; News Approvals (${pendingStories.length})</h3>
        <span class="card-badge ${pendingStories.length > 0 ? 'amber' : 'teal'}">${pendingStories.length} Pending Review</span>
      </div>
      ${pendingStories.length === 0 ? `
        <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px"><i data-lucide="check" class="ui-icon"></i> No pending story moderation requests at this time.</div>
      ` : `
        <div class="table-scroll">
          <table class="rbac-table">
            <thead>
              <tr><th>Emoji</th><th>Headline</th><th>Category</th><th>Author</th><th>Excerpt</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${pendingStories.map(s => `
                <tr>
                  <td style="font-size:20px">${s.emoji || '<i data-lucide="sparkle" class="ui-icon"></i>'}</td>
                  <td><strong>${s.title}</strong></td>
                  <td><span class="card-badge indigo">${s.category}</span></td>
                  <td>${s.author_name}</td>
                  <td style="font-size:12px;color:var(--text-secondary)">${s.excerpt}</td>
                  <td>
                    <div style="display:flex;gap:6px">
                      <button class="btn btn-sm btn-primary" onclick="handleModerateStory(${s.id}, 'approve')">Approve <i data-lucide="check" class="ui-icon"></i></button>
                      <button class="btn btn-sm btn-danger" onclick="handleModerateStory(${s.id}, 'reject')">Reject <i data-lucide="x" class="ui-icon"></i></button>
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
      <div class="modal-title"><i data-lucide="lock-keyhole" class="ui-icon"></i> Authorize Payment</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    <div class="payment-step">
      <div style="font-size:44px;margin-bottom:10px">${state.selectedGateway === 'bkash' ? '<i data-lucide="smartphone" class="ui-icon"></i>' : state.selectedGateway === 'nagad' ? '<i data-lucide="smartphone" class="ui-icon"></i>' : state.selectedGateway === 'rocket' ? '<i data-lucide="rocket" class="ui-icon"></i>' : '<i data-lucide="credit-card" class="ui-icon"></i>'}</div>
      <div style="font-size:17px;font-weight:800;margin-bottom:6px">Authorising via ${escapeHtml(gwName)}</div>
      <div style="color:var(--text-secondary);margin-bottom:6px">Amount: <strong style="color:var(--teal)">৳${Number(amount).toLocaleString()}</strong></div>
      <div style="font-family:monospace;font-size:11px;color:var(--text-muted);margin-bottom:18px">Ref ${escapeHtml(donation.transaction_reference)}</div>
      <div style="background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:16px;margin-bottom:18px">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">Enter your ${escapeHtml(gwName)} PIN</div>
        <div class="otp-inputs" style="justify-content:center">
          ${[0,1,2,3].map(() => '<input type="password" class="otp-box" maxlength="1" inputmode="numeric" />').join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-full" onclick="settleDonation(${donation.id}, true)"><i data-lucide="check" class="ui-icon"></i> Confirm Payment</button>
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
        <div class="modal-title"><i data-lucide="circle-x" class="ui-icon"></i> Payment Failed</div>
        <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
      </div>
      <div class="payment-step">
        <div style="font-size:44px;margin-bottom:10px"><i data-lucide="triangle-alert" class="ui-icon"></i></div>
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
      <div class="modal-title"><i data-lucide="party-popper" class="ui-icon"></i> Payment Successful</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    <div class="payment-step">
      <div class="payment-success"><i data-lucide="circle-check-big" class="ui-icon"></i></div>
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
        <button class="btn btn-outline" onclick="downloadReceipt(${d.id})"><i data-lucide="file-text" class="ui-icon"></i> Download Receipt</button>
        <button class="btn btn-outline" onclick="closeModal()"><i data-lucide="check" class="ui-icon"></i> Done</button>
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
      <div class="modal-title"><i data-lucide="file-text" class="ui-icon"></i> Apply — ${escapeHtml(title)}</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
      <div class="modal-title"><i data-lucide="users" class="ui-icon"></i> Applicants — ${escapeHtml(title)}</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
      : renderEmptyState('<i data-lucide="inbox" class="ui-icon"></i>', 'No applications yet')}
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
      <div class="modal-title"><i data-lucide="triangle-alert" class="ui-icon"></i> Delete Account</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    ${hasPending ? `
      <div class="state-panel" style="border-color:rgba(255,140,66,0.4);background:rgba(255,140,66,0.08)">
        <div class="state-icon"><i data-lucide="hourglass" class="ui-icon"></i></div>
        <div class="state-title">Deletion already scheduled</div>
        <div class="state-subtitle">Your account will be permanently purged on ${escapeHtml(formatDate(pending.purge_after))}. You can cancel until then.</div>
      </div>
      <button class="btn btn-primary btn-full mt-16" onclick="cancelAccountDeletion()"><i data-lucide="undo-2" class="ui-icon"></i> Cancel deletion request</button>
    ` : `
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
        Under PDPA 2026 your account enters a <strong>30-day grace period</strong> before permanent deletion.
        You can cancel at any point during that window. We recommend exporting your data first.
      </p>
      <button class="btn btn-outline btn-full" onclick="exportUserData('json')"><i data-lucide="package" class="ui-icon"></i> Export my data first</button>
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
      <div class="modal-title"><i data-lucide="unlock" class="ui-icon"></i> Decrypt Identity Field</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
      Decrypting ${escapeHtml(ownerName)}'s identity data is a privileged action. Your name, the reason
      and a timestamp are written to the immutable access log.
    </p>
    <div class="input-group">
      <label class="input-label">Reason for access (required)</label>
      <input type="text" id="vault-reason" class="form-input" placeholder="e.g. Scholarship eligibility verification" required />
    </div>
    <button class="btn btn-primary btn-full" onclick="performVaultReveal(${vaultId})"><i data-lucide="unlock" class="ui-icon"></i> Decrypt & Log Access</button>
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
      <div class="modal-title"><i data-lucide="plus" class="ui-icon"></i> Create Campaign</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
      <div class="modal-title"><i data-lucide="megaphone" class="ui-icon"></i> Send Broadcast</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
        ${[['push','<i data-lucide="bell" class="ui-icon"></i> Push'],['sms','<i data-lucide="message-circle" class="ui-icon"></i> SMS'],['email','<i data-lucide="mail" class="ui-icon"></i> Email']].map((c, i) =>
          `<button type="button" class="chip broadcast-channel${i === 0 ? ' active' : ''}" data-channel="${c[0]}" onclick="this.classList.toggle('active')">${c[1]}</button>`).join('')}
      </div></div>
    <button class="btn btn-primary btn-full" onclick="sendBroadcast()"><i data-lucide="megaphone" class="ui-icon"></i> Send Broadcast</button>
    <div style="font-size:11px;color:var(--text-muted);margin-top:10px;text-align:center">Recipients are resolved from the live audience and delivered as in-app notifications.</div>
  `);
}

function showStoreIdentityModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title"><i data-lucide="lock-keyhole" class="ui-icon"></i> Encrypt an Identity Field</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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
    <button class="btn btn-primary btn-full" onclick="storeIdentityField()"><i data-lucide="lock-keyhole" class="ui-icon"></i> Encrypt & Store</button>
  `);
}

async function showVaultAccessLogs() {
  const rows = await API.getVaultAccessLogs();
  if (apiFailed(rows)) { showToast(`⚠ ${rows?.error || 'Could not load access logs.'}`); return; }

  showModal(`
    <div class="modal-header">
      <div class="modal-title"><i data-lucide="scroll-text" class="ui-icon"></i> Vault Access Log</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto">
      ${rows.length ? rows.map(l => `
        <div class="glass-card" style="padding:12px">
          <div style="font-weight:700;font-size:13px">${escapeHtml(l.accessed_by_name || 'Unknown')} decrypted ${escapeHtml((l.field_type || '').toUpperCase())}</div>
          <div style="font-size:12px;color:var(--text-secondary)">Subject: ${escapeHtml(l.owner_name || '—')}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Reason: ${escapeHtml(l.reason)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${escapeHtml(formatRelativeTime(l.created_at))}</div>
        </div>`).join('')
      : renderEmptyState('<i data-lucide="scroll-text" class="ui-icon"></i>', 'No decryption events recorded')}
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
    icon: c.icon || '<i data-lucide="school" class="ui-icon"></i>',
    description: c.description || '',
    // members_count is the counter the join/leave endpoint maintains.
    members: c.members_count || 0,
    events: c.events_count || 0,
    parent: c.parent_id ?? null
  }));

  // Membership comes from PostgreSQL for the signed-in user.
  USER_CHAPTER_MEMBERSHIPS = new Set(rows.filter(c => c.is_member).map(c => c.id));

  if (chaptersCache.length === 0) {
    tree.innerHTML = renderEmptyState('<i data-lucide="hexagon" class="ui-icon"></i>', 'No chapters yet', 'Create the first regional, batch or interest chapter.');
    const detail = document.getElementById('chapter-detail');
    if (detail) detail.innerHTML = '';
    return;
  }

  const roots = chaptersCache.filter(c => c.parent === null);
  const children = (parentId) => chaptersCache.filter(c => c.parent === parentId);

  tree.innerHTML = roots.map(c => `
    <div class="chapter-node" onclick="selectChapter(${c.id})">
      <span class="chapter-icon">${emojiIcon(c.icon, 'hexagon')}</span>
      <span class="chapter-name">${escapeHtml(c.name)}</span>
      <span class="chapter-type ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>
      <span class="chapter-count">${c.members.toLocaleString()}</span>
    </div>
    ${children(c.id).map(sub => `
      <div class="chapter-node chapter-indent" onclick="selectChapter(${sub.id})">
        <span class="chapter-icon">${emojiIcon(sub.icon, 'hexagon')}</span>
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


// ─── PLANNER: VENDORS / TIMELINE / LOGISTICS TABS (new in Phase 6) ───

/* Planner analytics moved into the event Reports tab (evTabReports). */

const PLANNER_FIELDS = {
  vendors:    { label: 'Vendor', fields: [['name','Vendor name','text',true],['category','Category','text'],['contactPerson','Contact person','text'],['phone','Phone','tel'],['email','Email','email'],['contractValue','Contract value (৳)','number'],['rating','Rating (0-5)','number'],['status','Status','select',false,['shortlisted','contracted','paid','rejected']]] },
  timeline:   { label: 'Milestone', fields: [['title','Milestone title','text',true],['description','Description','textarea'],['phase','Phase','text'],['startsAt','Start date','date'],['endsAt','End date','date'],['owner','Owner','text'],['progress','Progress %','number'],['status','Status','select',false,['pending','in_progress','done','delayed']]] },
  logistics:  { label: 'Logistics item', fields: [['item','Item','text',true],['category','Category','text'],['quantity','Quantity','number'],['location','Location','text'],['responsible','Responsible','text'],['status','Status','select',false,['planned','arranged','on_site','returned']]] },
  marketing:  { label: 'Campaign', fields: [['channel','Channel','text',true],['campaignName','Campaign name','text',true],['audience','Audience','text'],['budget','Budget (৳)','number'],['reach','Reach','number'],['conversions','Conversions','number'],['scheduledFor','Scheduled for','date'],['status','Status','select',false,['planned','live','completed','paused']]] },
  meetings:   { label: 'Meeting', fields: [['title','Meeting title','text',true],['agenda','Agenda','textarea'],['meetingDate','Date','date'],['meetingTime','Time','text'],['location','Location','text'],['attendees','Attendees','text'],['status','Status','select',false,['scheduled','held','cancelled']]] },
  committees: { label: 'Committee', fields: [['name','Committee name','text',true],['leaderName','Leader','text',true],['membersCount','Members','number'],['budgetAllocated','Budget (৳)','number']] },
  volunteers: { label: 'Volunteer', fields: [['volunteerName','Volunteer name','text',true],['shiftTime','Shift','text'],['assignedCommittee','Committee','text'],['attendanceStatus','Attendance','select',false,['assigned','checked_in','absent']]] },
  risks:      { label: 'Risk', fields: [['riskTitle','Risk','text',true],['category','Category','text'],['severity','Severity','select',false,['high','medium','low']],['contingencyPlan','Contingency plan','textarea',true]] },
  budgets:    { label: 'Budget line', fields: [['category','Category','text',true],['estimatedCost','Estimated cost','number'],['actualCost','Actual cost','number'],['vendorName','Vendor','text'],['paymentStatus','Payment','select',false,['unpaid','partial','paid']]] },
  sponsors:   { label: 'Sponsor', fields: [['company','Company','text',true],['contactPerson','Contact person','text'],['email','Email','email'],['phone','Phone','tel'],['packageTier','Tier','select',false,['title','gold','silver','bronze','partner']],['contributionAmount','Amount','number'],['pipelineStatus','Status','select',false,['proposed','agreed','received','rejected']],['deliverables','Deliverables','textarea']] },
  procurement:{ label: 'Item', fields: [['itemName','Item','text',true],['category','Category','text'],['quantity','Quantity','number'],['estimatedPrice','Estimated price','number'],['actualPrice','Actual price','number'],['vendorName','Vendor','text'],['deliveryStatus','Delivery','select',false,['requested','ordered','delivered']]] }
};

function showPlannerItemModal(kind) {
  const spec = PLANNER_FIELDS[kind];
  if (!spec) return;

  // Every label is tied to its field with `for`, and the close button carries an
  // accessible name — this form is reached from the event workspace, so it holds
  // to the same bar as the rest of the module.
  showModal(`
    <div class="modal-header">
      <h2 class="modal-title"><i data-lucide="plus" class="ui-icon" aria-hidden="true"></i> Add ${escapeHtml(spec.label)}</h2>
      <button type="button" class="modal-close" aria-label="Close">
        <i data-lucide="x" class="ui-icon" aria-hidden="true"></i></button>
    </div>
    <form onsubmit="submitPlannerItem(event, '${kind}')">
      ${spec.fields.map(([key, label, type, required, options]) => {
        const id = `pf-${key}`;
        const req = required ? ' <span class="req">*</span>' : '';
        const lab = `<label class="input-label" for="${id}">${escapeHtml(label)}${req}</label>`;
        if (type === 'textarea') {
          return `<div class="input-group">${lab}
            <textarea id="${id}" class="form-input" rows="3" ${required ? 'required' : ''}></textarea></div>`;
        }
        if (type === 'select') {
          return `<div class="input-group">${lab}
            <select id="${id}" class="form-select">${options.map(o => `<option value="${o}">${o.replace('_', ' ')}</option>`).join('')}</select></div>`;
        }
        return `<div class="input-group">${lab}
          <input type="${type}" id="${id}" class="form-input" ${required ? 'required' : ''} /></div>`;
      }).join('')}
      <div class="ev-modal-footer">
        <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save ${escapeHtml(spec.label)}</button>
      </div>
    </form>
  `);
}

async function submitPlannerItem(e, kind) {
  if (e) e.preventDefault();
  const spec = PLANNER_FIELDS[kind];
  const payload = { eventId: EV.event ? EV.event.id : null };
  if (!payload.eventId) { showToast('Open an event first.', 'triangle-alert'); return; }
  spec.fields.forEach(([key]) => {
    const el = document.getElementById('pf-' + key);
    if (el && el.value !== '') payload[key] = el.value;
  });

  const res = await API.createPlannerItem(kind, payload);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not save.'}`); return; }

  closeModal();
  showToast(`${spec.label} added.`, 'circle-check-big');
  EV.tab = 'advanced';
  renderEventTabs();
  await evTabAdvanced();
}

async function deletePlannerItem(kind, id) {
  if (!confirm('Delete this entry?')) return;
  const res = await API.deletePlannerItem(kind, id);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not delete.'}`); return; }
  showToast('Deleted.', 'trash-2');
  EV.tab = 'advanced';
  renderEventTabs();
  await evTabAdvanced();
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

// Prompts users still on an issued temporary password to replace it.
function showChangePasswordModal(forced = false) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title"><i data-lucide="key" class="ui-icon"></i> ${forced ? 'Set a New Password' : 'Change Password'}</div>
      ${forced ? '' : '<button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>'}
    </div>
    ${forced ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
      Your account still uses the temporary password it was issued.
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
      <div class="modal-title"><i data-lucide="pen-line" class="ui-icon"></i> Edit My Profile</div>
      <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x" class="ui-icon"></i></button>
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

/* ============================================================
   EVENTS & TICKETS — v5
   One list, one workspace, one creation wizard. Light UI, Lucide icons,
   no emoji, no mock panels. Staff see management; alumni see discovery.
   ============================================================ */

const EV_TYPES = ['Reunion', 'Seminar', 'Workshop', 'Career', 'Sports', 'Gala',
                  'Conference', 'Cultural', 'Ceremony', 'Meetup', 'Other'];

const EV_TYPE_ICON = {
  Reunion: 'users', Seminar: 'presentation', Workshop: 'wrench', Career: 'briefcase',
  Sports: 'trophy', Gala: 'sparkles', Conference: 'mic', Cultural: 'music',
  Ceremony: 'award', Meetup: 'coffee', Other: 'calendar'
};

const EV_STATUS_LABEL = { upcoming: 'Upcoming', ongoing: 'Ongoing', past: 'Past', cancelled: 'Cancelled' };

const EV_TASK_STATUS = [
  { key: 'todo',        label: 'Not Started', icon: 'circle-dashed',    tone: 'muted' },
  { key: 'in_progress', label: 'In Progress', icon: 'circle-dot',       tone: 'info' },
  { key: 'blocked',     label: 'Blocked',     icon: 'octagon-alert',    tone: 'danger' },
  { key: 'completed',   label: 'Done',        icon: 'circle-check-big', tone: 'success' }
];
const EV_TASK_CATEGORIES = ['Venue', 'Catering', 'Invitations', 'Budget',
                            'Volunteers', 'Marketing', 'Logistics', 'General'];
const EV_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const EV_PEOPLE_ROLES = [
  { key: 'coordinator',    label: 'Coordinator' },
  { key: 'committee_lead', label: 'Committee lead' },
  { key: 'member',         label: 'Committee member' },
  { key: 'volunteer',      label: 'Volunteer' }
];

const EV = {
  list: [], filter: 'upcoming', search: '', publicView: false,
  event: null, overview: null, tab: 'overview',
  tasks: [], taskFilter: 'all', people: [], attendees: [], advancedTab: 'budget',
  wizard: null, picker: null, task: null, _searchTimer: null
};

/* ─── helpers ─── */
/* "Super Admin · Super Admin" happened because the account name and its role
   label are often the same string on staff accounts. Show the name once, and
   append the role only when it genuinely adds something. */
function evCreditLine(name, roleLabel) {
  const n = String(name || '').trim();
  if (!n) return 'Not recorded';
  const r = String(roleLabel || '').trim();
  if (!r || r.toLowerCase() === n.toLowerCase()) return escapeHtml(n);
  return escapeHtml(n) + ' · ' + escapeHtml(r);
}

function evCanManage() {
  return !!state.currentUser &&
    ['super_admin', 'univ_admin', 'dept_admin', 'moderator'].includes(state.currentUser.role);
}
function evIsAdmin() {
  return !!state.currentUser && ['super_admin', 'univ_admin'].includes(state.currentUser.role);
}
function evTypeIcon(t) { return EV_TYPE_ICON[t] || 'calendar'; }

const EV_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Date-only values arrive as 'YYYY-MM-DD' and are formatted from their parts.
// Running them through `new Date()` would re-interpret them as UTC midnight and
// shift the day for any viewer west of Greenwich.
function evDate(v) {
  if (!v) return 'Date to be confirmed';
  const s = String(v);
  const plain = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plain) {
    return Number(plain[3]) + ' ' + EV_MONTHS[Number(plain[2]) - 1] + ' ' + plain[1];
  }
  const d = new Date(v);            // a real instant (created_at, approved_at…)
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Value for <input type="date">, which wants a bare 'YYYY-MM-DD'.
function evDateInput(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(v);
  if (isNaN(d)) return '';
  // Local parts, not toISOString(), so the day does not slip a zone.
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
}
function evTime(v) {
  if (!v) return '';
  const parts = String(v).split(':');
  if (parts.length < 2) return String(v);
  const hh = parseInt(parts[0], 10);
  if (isNaN(hh)) return String(v);
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return h12 + ':' + parts[1] + ' ' + suffix;
}
function evTimeInput(v) { return v ? String(v).slice(0, 5) : ''; }
function evTimeRange(e) {
  const a = evTime(e.start_time), b = evTime(e.end_time);
  return a && b ? (a + ' – ' + b) : (a || '');
}
function evMoney(n) { return '৳' + Number(n || 0).toLocaleString('en-IN'); }
function evIcon(name, cls) {
  return '<i data-lucide="' + name + '" class="ui-icon ' + (cls || '') + '" aria-hidden="true"></i>';
}
function evRefreshIcons() {
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

// Digits-only phone for tel: and wa.me. Bangladeshi local numbers get +880.
function evPhoneDigits(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d]/g, '');
  if (!d) return null;
  if (d.startsWith('880')) return d;
  if (d.startsWith('0')) return '880' + d.slice(1);
  return d;
}

// Call / WhatsApp / Profile. A button is omitted when its number is missing.
function evContactButtons(p, compact) {
  const cls = 'ev-contact-btn' + (compact ? ' sm' : '');
  const phone = evPhoneDigits(p.phone);
  const wa = evPhoneDigits(p.whatsapp);
  const name = escapeHtml(p.name || 'this person');
  const out = [];
  if (phone) {
    out.push('<a class="' + cls + '" href="tel:+' + phone + '" aria-label="Call ' + name + '">' +
             evIcon('phone') + '<span>Call</span></a>');
  }
  if (wa) {
    out.push('<a class="' + cls + ' wa" href="https://wa.me/' + wa + '" target="_blank" rel="noopener" ' +
             'aria-label="Message ' + name + ' on WhatsApp">' + evIcon('message-circle') + '<span>WhatsApp</span></a>');
  }
  /* Only a DIC account has a profile to open. An external contact's id is an
     event_people row, not a user — linking it would open a stranger. */
  const uid = p.person_type === 'external' ? null : (p.user_id || p.id);
  if (uid && typeof viewAlumniProfile === 'function') {
    out.push('<button type="button" class="' + cls + '" onclick="viewAlumniProfile(' + uid + ')" ' +
             'aria-label="Open profile for ' + name + '">' + evIcon('user') + '<span>Profile</span></button>');
  }
  return out.join('');
}

function evAvatar(p, size) {
  const s = size || 34;
  if (p.photo_url) {
    return '<img class="ev-avatar" style="width:' + s + 'px;height:' + s + 'px" src="' +
           escapeHtml(p.photo_url) + '" alt="" loading="lazy" />';
  }
  const initials = p.initials || String(p.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('');
  return '<span class="ev-avatar ev-avatar-initials" aria-hidden="true" style="width:' + s +
         'px;height:' + s + 'px;font-size:' + Math.round(s / 2.8) + 'px">' + escapeHtml(initials) + '</span>';
}

function evPersonMeta(p) {
  return [p.dept, p.section ? 'Sec ' + p.section : null, p.student_id,
          p.batch ? 'Batch ' + p.batch : null]
    .filter(Boolean).map(escapeHtml).join(' · ') || '—';
}

/* ══════════════════════════════════════════════════════════
   EVENT LIST
   ══════════════════════════════════════════════════════════ */

/* Entering the Events page always starts in Manage for staff.
   EV.publicView used to persist for the life of the page, so an admin who
   peeked at Public view and navigated away came back to the public screen —
   which is the "wrong view on first entry, correct after refresh" report.
   Public view is a look, not a saved preference. */
async function renderEventsPage() {
  const listView = document.getElementById('ev-list-view');
  const wsView = document.getElementById('ev-workspace-view');
  if (listView) listView.classList.remove('hidden');
  if (wsView) wsView.classList.add('hidden');
  EV.event = null;

  // Identity must be settled before deciding which Events screen to draw.
  // Without this the module would fall through to its non-staff branch and
  // flash the public list at an admin.
  if (!(await evEnsureIdentity())) return;

  EV.publicView = false;
  renderEventListChrome();
  evRunMaintenanceSweep();
  await loadEventList();
}

/* Resolves the signed-in user before anything role-dependent renders.
   Shows a neutral skeleton while it waits, never the wrong view. */
async function evEnsureIdentity() {
  if (state.currentUser && state.currentUser.role) return true;

  const actions = document.getElementById('ev-list-actions');
  const filters = document.getElementById('ev-filters');
  const list = document.getElementById('ev-list');
  const sub = document.getElementById('ev-list-subtitle');
  if (actions) actions.innerHTML = '<span class="ev-chrome-skeleton" aria-hidden="true"></span>';
  if (filters) filters.innerHTML = '';
  if (sub) sub.textContent = 'Loading your events…';
  if (list) list.innerHTML = renderSkeletonCards(3, 'event');

  const me = await API.me();
  if (me && me.role) {
    state.currentUser = me;
    return true;
  }
  if (list) {
    list.innerHTML = renderErrorState(
      'Your session could not be confirmed. Please sign in again.', 'renderEventsPage()');
  }
  if (sub) sub.textContent = '';
  evRefreshIcons();
  return false;
}

/* There is no scheduler in this deployment (single Express app, also deployed
   serverless), so the calendar-driven event status roll-forward and the task
   deadline/overdue reminders run once per session when a staff member opens
   the Events page. Nothing else performs this maintenance.

   Fire-and-forget: a failure here must never block the page. The definition
   was lost in an earlier edit while its call site survived, which threw a
   ReferenceError that aborted renderEventsPage() before the list loaded. */
let _evSweptThisSession = false;

function evRunMaintenanceSweep() {
  if (_evSweptThisSession || !evCanManage()) return;
  _evSweptThisSession = true;
  Promise.resolve()
    .then(() => API.runReminderSweep())
    .then(res => {
      if (!apiFailed(res) && res.sent > 0 && typeof renderNotifications === 'function') {
        renderNotifications();
      }
    })
    .catch(() => { /* best effort — never surfaces to the user */ });
}

function renderEventListChrome() {
  const manage = evCanManage() && !EV.publicView;
  const sub = document.getElementById('ev-list-subtitle');
  if (sub) {
    sub.textContent = evCanManage()
      ? (manage ? 'Create, approve and run college events'
                : 'This is what alumni see')
      : 'Browse and register for college events';
  }

  const actions = document.getElementById('ev-list-actions');
  if (actions) {
    actions.innerHTML = evCanManage() ? (
      '<div class="ev-viewswitch" role="group" aria-label="Event view">' +
        '<button type="button" class="ev-viewswitch-btn ' + (EV.publicView ? '' : 'active') + '" ' +
          'aria-pressed="' + (!EV.publicView) + '" onclick="setEventListView(false)">' +
          evIcon('settings-2') + '<span>Manage</span></button>' +
        '<button type="button" class="ev-viewswitch-btn ' + (EV.publicView ? 'active' : '') + '" ' +
          'aria-pressed="' + EV.publicView + '" onclick="setEventListView(true)">' +
          evIcon('eye') + '<span>Public view</span></button>' +
      '</div>' +
      '<button type="button" class="btn btn-primary" onclick="openEventWizard()">' +
        evIcon('plus') + ' New Event</button>'
    ) : '';
  }

  const filters = document.getElementById('ev-filters');
  if (filters) {
    const opts = [['upcoming', 'Upcoming'], ['ongoing', 'Ongoing'], ['past', 'Past'],
                  ['cancelled', 'Cancelled'], ['all', 'All']];
    filters.innerHTML = opts.map(function (o) {
      const on = EV.filter === o[0];
      return '<button type="button" class="ev-chip ' + (on ? 'active' : '') + '" role="tab" ' +
             'aria-selected="' + on + '" onclick="setEventFilter(\'' + o[0] + '\')">' + o[1] + '</button>';
    }).join('');
  }
  evRefreshIcons();
}

function setEventListView(isPublic) {
  EV.publicView = isPublic;
  renderEventListChrome();
  loadEventList();
}
function setEventFilter(f) {
  EV.filter = f;
  renderEventListChrome();
  loadEventList();
}
function onEventSearch(v) {
  EV.search = v;
  clearTimeout(EV._searchTimer);
  EV._searchTimer = setTimeout(loadEventList, 250);
}

/* Boot fires one render and a click can fire another, so two responses race.
   Only the newest is allowed to paint — otherwise a slower earlier request
   lands last and overwrites the list the user actually asked for. */
let _evListRequest = 0;

async function loadEventList() {
  const el = document.getElementById('ev-list');
  if (!el) return;
  const ticket = ++_evListRequest;
  el.innerHTML = renderSkeletonCards(3, 'event');

  const params = {};
  if (EV.search) params.search = EV.search;
  if (EV.filter !== 'all') params.status = EV.filter;
  if (evCanManage() && !EV.publicView) params.scope = 'manage';

  const rows = await API.getEvents(params);
  if (ticket !== _evListRequest) return;   // a newer request has taken over
  if (apiFailed(rows)) {
    el.innerHTML = renderErrorState(rows && rows.error ? rows.error : 'Could not load events.', 'loadEventList()');
    evRefreshIcons();
    return;
  }
  EV.list = rows;

  if (!rows.length) {
    // Say why it is empty. "Nothing here yet" is wrong when the college has
    // plenty of events and the Upcoming filter simply matches none of them.
    const labels = { upcoming: 'upcoming', ongoing: 'ongoing', past: 'past', cancelled: 'cancelled' };
    let title, hint;
    if (EV.search) {
      title = 'No events match "' + EV.search.trim() + '"';
      hint = 'Try a different name or venue, or clear the search.';
    } else if (EV.filter !== 'all') {
      title = 'No ' + (labels[EV.filter] || EV.filter) + ' events';
      hint = 'Choose "All" to see every event.';
    } else {
      title = 'No events yet';
      hint = evCanManage() && !EV.publicView
        ? 'Use "New Event" to create the first one.'
        : 'New events will appear here once published.';
    }
    el.innerHTML = renderEmptyState(evIcon('calendar'), title, hint);
    evRefreshIcons();
    return;
  }

  const manage = evCanManage() && !EV.publicView;
  el.innerHTML = rows.map(function (e) { return manage ? evManageCard(e) : evPublicCard(e); }).join('');
  evRefreshIcons();
}

function evStatusPill(e) {
  if (e.status === 'cancelled') return '<span class="ev-pill danger">' + evIcon('calendar-x') + ' Cancelled</span>';
  if (e.approval_status === 'pending_approval') return '<span class="ev-pill warn">' + evIcon('clock') + ' Awaiting approval</span>';
  if (e.approval_status === 'rejected') return '<span class="ev-pill danger">' + evIcon('undo-2') + ' Sent back</span>';
  if (e.approval_status === 'draft') return '<span class="ev-pill muted">' + evIcon('file-pen') + ' Draft</span>';
  const label = EV_STATUS_LABEL[e.status] || e.status;
  return '<span class="ev-pill ' + (e.status === 'past' ? 'muted' : 'success') + '">' +
         evIcon('circle-check-big') + ' ' + escapeHtml(label) + '</span>';
}

function evCapacityBar(e) {
  const reg = e.registered != null ? e.registered : 0;
  const cap = e.capacity || 0;
  const pct = cap ? Math.min(100, Math.round((reg / cap) * 100)) : 0;
  return '<div class="ev-capacity">' +
    '<div class="ev-capacity-track" role="img" aria-label="' + reg + ' of ' + cap + ' places taken">' +
      '<div class="ev-capacity-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="ev-capacity-meta"><span>' + reg.toLocaleString() + ' of ' + cap.toLocaleString() +
      ' registered</span><span>' + pct + '%</span></div></div>';
}

function evManageCard(e) {
  return '<article class="ev-card">' +
    '<div class="ev-card-top">' +
      '<span class="ev-card-icon">' + evIcon(evTypeIcon(e.event_type)) + '</span>' +
      '<div class="ev-card-headings">' +
        '<h3 class="ev-card-title">' + escapeHtml(e.title) + '</h3>' +
        '<p class="ev-card-type">' + escapeHtml(e.event_type || 'Event') + '</p>' +
      '</div>' + evStatusPill(e) +
    '</div>' +
    '<dl class="ev-card-meta">' +
      '<div><dt>' + evIcon('calendar') + '<span class="sr-only">Date</span></dt><dd>' +
        escapeHtml(evDate(e.starts_on)) + (evTimeRange(e) ? ' · ' + escapeHtml(evTimeRange(e)) : '') + '</dd></div>' +
      '<div><dt>' + evIcon('map-pin') + '<span class="sr-only">Venue</span></dt><dd>' +
        escapeHtml(e.venue) + '</dd></div>' +
      '<div><dt>' + evIcon('user-round-pen') + '<span class="sr-only">Created by</span></dt><dd>' +
        evCreditLine(e.created_by_name, e.created_by_role) + '</dd></div>' +
    '</dl>' +
    evCapacityBar(e) +
    '<div class="ev-card-actions">' +
      '<button class="btn btn-primary btn-sm" onclick="openEventWorkspace(' + e.id + ')">' +
        evIcon('settings-2') + ' Manage</button>' +
      (e.approval_status === 'pending_approval' && evIsAdmin()
        ? '<button class="btn btn-outline btn-sm" onclick="evApprove(' + e.id + ')">' + evIcon('check') + ' Approve</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="evReject(' + e.id + ')">' + evIcon('undo-2') + ' Send back</button>'
        : '') +
    '</div></article>';
}

function evPublicCard(e) {
  const reg = e.registered != null ? e.registered : 0;
  const full = e.capacity ? reg >= e.capacity : false;
  return '<article class="ev-card">' +
    '<div class="ev-card-top">' +
      '<span class="ev-card-icon">' + evIcon(evTypeIcon(e.event_type)) + '</span>' +
      '<div class="ev-card-headings">' +
        '<h3 class="ev-card-title">' + escapeHtml(e.title) + '</h3>' +
        '<p class="ev-card-type">' + escapeHtml(e.event_type || 'Event') + ' · ' +
          (e.is_paid ? 'Paid' : 'Free') + '</p>' +
      '</div>' +
      (full ? '<span class="ev-pill warn">' + evIcon('hourglass') + ' Full</span>'
            : '<span class="ev-pill success">' + evIcon('circle-check-big') + ' Open</span>') +
    '</div>' +
    (e.description ? '<p class="ev-card-desc">' + escapeHtml(e.description) + '</p>' : '') +
    '<dl class="ev-card-meta">' +
      '<div><dt>' + evIcon('calendar') + '<span class="sr-only">Date</span></dt><dd>' +
        escapeHtml(evDate(e.starts_on)) + (evTimeRange(e) ? ' · ' + escapeHtml(evTimeRange(e)) : '') + '</dd></div>' +
      '<div><dt>' + evIcon('map-pin') + '<span class="sr-only">Venue</span></dt><dd>' +
        escapeHtml(e.venue) + '</dd></div>' +
    '</dl>' +
    evCapacityBar(e) +
    '<div class="ev-card-actions">' +
      (e.is_registered
        ? '<button class="btn btn-outline btn-sm" onclick="evViewTicket(' + e.id + ')">' + evIcon('ticket') + ' View ticket</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="evCancelTicket(' + e.id + ')">Cancel</button>'
        : '<button class="btn btn-primary btn-sm" onclick="evRegister(' + e.id + ')">' +
            evIcon(full ? 'hourglass' : 'ticket') + ' ' + (full ? 'Join waitlist' : 'Get ticket') + '</button>') +
    '</div></article>';
}

/* ══════════════════════════════════════════════════════════
   EVENT WORKSPACE SHELL
   ══════════════════════════════════════════════════════════ */

const EV_TABS = [
  { key: 'overview', label: 'Overview',            icon: 'layout-dashboard' },
  { key: 'tasks',    label: 'Tasks',               icon: 'clipboard-list' },
  { key: 'tickets',  label: 'Tickets & Attendees', icon: 'ticket' },
  { key: 'people',   label: 'People',              icon: 'users' },
  { key: 'reports',  label: 'Reports',             icon: 'chart-no-axes-column' },
  { key: 'advanced', label: 'Advanced',            icon: 'sliders-horizontal' }
];

async function openEventWorkspace(id, tab) {
  if (!evCanManage()) { showToast('Only organisers can open the event workspace.', 'lock'); return; }
  const listView = document.getElementById('ev-list-view');
  const wsView = document.getElementById('ev-workspace-view');
  if (listView) listView.classList.add('hidden');
  if (wsView) wsView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  EV.tab = tab || 'overview';
  const header = document.getElementById('ev-context-header');
  const content = document.getElementById('ev-tab-content');
  if (header) header.innerHTML = renderSkeletonCards(1, 'event');
  if (content) content.innerHTML = renderSkeletonCards(2, 'planner');

  const data = await API.getEventOverview(id);
  if (apiFailed(data)) {
    if (content) content.innerHTML = renderErrorState(
      data && data.error ? data.error : 'Could not open this event.', 'openEventWorkspace(' + id + ')');
    if (header) header.innerHTML = '';
    evRefreshIcons();
    return;
  }
  EV.event = data.event;
  EV.overview = data;
  renderEventContextHeader();
  renderEventTabs();
  renderEventTab(EV.tab);
}

function closeEventWorkspace() { renderEventsPage(); }

async function evReloadWorkspace(tab) {
  if (!EV.event) return;
  await openEventWorkspace(EV.event.id, tab || EV.tab);
}

function renderEventContextHeader() {
  const el = document.getElementById('ev-context-header');
  const e = EV.event;
  if (!el || !e) return;

  const created = e.created_by_name
    ? evCreditLine(e.created_by_name, e.created_by_role) + ' · ' + escapeHtml(evDate(e.created_at))
    : 'Not recorded';

  el.innerHTML =
    '<section class="ev-context" aria-label="Event summary">' +
      '<div class="ev-context-main">' +
        '<span class="ev-context-icon">' + evIcon(evTypeIcon(e.event_type)) + '</span>' +
        '<div class="ev-context-text">' +
          '<h1 class="ev-context-title">' + escapeHtml(e.title) + '</h1>' +
          '<p class="ev-context-line">' + evIcon('calendar') + ' ' + escapeHtml(evDate(e.starts_on)) +
            (evTimeRange(e) ? ' · ' + escapeHtml(evTimeRange(e)) : '') + '</p>' +
          '<p class="ev-context-line">' + evIcon('map-pin') + ' ' + escapeHtml(e.venue) + '</p>' +
          '<p class="ev-context-line">' + evIcon('user-round-pen') + ' Created by ' + created + '</p>' +
        '</div>' +
        '<div class="ev-context-status">' + evStatusPill(e) +
          '<span class="ev-context-count">' + (e.registered != null ? e.registered : 0).toLocaleString() +
            ' / ' + (e.capacity || 0).toLocaleString() + ' registered</span>' +
          (e.approved_by_name ? '<span class="ev-context-sub">Approved by ' + escapeHtml(e.approved_by_name) + '</span>' : '') +
        '</div>' +
      '</div>' +
      (e.cancellation_reason ? '<p class="ev-banner danger">' + evIcon('triangle-alert') +
        ' Cancelled — ' + escapeHtml(e.cancellation_reason) + '</p>' : '') +
      (e.rejection_reason ? '<p class="ev-banner warn">' + evIcon('undo-2') +
        ' Sent back — ' + escapeHtml(e.rejection_reason) + '</p>' : '') +
      '<div class="ev-context-actions">' +
        '<button class="btn btn-outline btn-sm" onclick="evEditEvent()">' + evIcon('pencil') + ' Edit event</button>' +
        '<button class="btn btn-outline btn-sm" onclick="evPreviewPublic()">' + evIcon('eye') + ' Preview</button>' +
        (evIsAdmin() && e.status !== 'cancelled'
          ? '<button class="btn btn-ghost btn-sm ev-danger" onclick="evCancelEvent()">' + evIcon('calendar-x') + ' Cancel event</button>' : '') +
        (evIsAdmin() && e.approval_status === 'pending_approval'
          ? '<button class="btn btn-primary btn-sm" onclick="evApprove(' + e.id + ')">' + evIcon('check') + ' Approve</button>' +
            '<button class="btn btn-ghost btn-sm" onclick="evReject(' + e.id + ')">' + evIcon('undo-2') + ' Send back</button>' : '') +
      '</div>' +
    '</section>';
  evRefreshIcons();
}

function renderEventTabs() {
  const nav = document.getElementById('ev-tabs');
  if (!nav) return;
  nav.innerHTML = EV_TABS.map(function (t) {
    const on = EV.tab === t.key;
    return '<button type="button" class="ev-tab ' + (on ? 'active' : '') + '" role="tab" ' +
           'id="ev-tab-' + t.key + '" aria-selected="' + on + '" ' +
           'onclick="switchEventTab(\'' + t.key + '\')">' + evIcon(t.icon) + '<span>' + t.label + '</span></button>';
  }).join('');
  evRefreshIcons();
  const active = nav.querySelector('.ev-tab.active');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function switchEventTab(tab) {
  EV.tab = tab;
  renderEventTabs();
  renderEventTab(tab);
}

function renderEventTab(tab) {
  const el = document.getElementById('ev-tab-content');
  if (!el) return;
  el.setAttribute('aria-labelledby', 'ev-tab-' + tab);
  if (tab === 'overview') return evTabOverview();
  if (tab === 'tasks')    return evTabTasks();
  if (tab === 'tickets')  return evTabTickets();
  if (tab === 'people')   return evTabPeople();
  if (tab === 'reports')  return evTabReports();
  if (tab === 'advanced') return evTabAdvanced();
}

/* ══════════════════════════════════════════════════════════
   TAB — OVERVIEW
   ══════════════════════════════════════════════════════════ */

function evStat(icon, value, label, tone) {
  return '<div class="ev-stat">' +
    '<span class="ev-stat-icon ' + (tone || '') + '">' + evIcon(icon) + '</span>' +
    '<div><div class="ev-stat-value">' + value + '</div>' +
    '<div class="ev-stat-label">' + label + '</div></div></div>';
}

function evTabOverview() {
  const el = document.getElementById('ev-tab-content');
  const e = EV.event, o = EV.overview;
  if (!el || !e || !o) return;

  const available = Math.max(0, (e.capacity || 0) - (e.registered || 0));
  const hasTasks = o.tasks.total > 0;

  el.innerHTML =
    '<div class="ev-stats">' +
      evStat('users', (e.registered || 0).toLocaleString(), 'Registered', 'info') +
      evStat('armchair', available.toLocaleString(), 'Seats available') +
      evStat('clipboard-list', o.tasks.total, 'Tasks') +
      evStat('circle-check-big', o.tasks.completionRate + '%', 'Tasks complete', 'success') +
      (e.is_paid ? evStat('banknote', evMoney(o.revenue), 'Ticket revenue', 'success') : '') +
      (o.tasks.overdue ? evStat('triangle-alert', o.tasks.overdue, 'Overdue', 'danger') : '') +
    '</div>' +

    (e.description
      ? '<section class="ev-panel"><h2 class="ev-panel-title">About this event</h2>' +
        '<p class="ev-prose">' + escapeHtml(e.description) + '</p>' +
        '<dl class="ev-deflist">' +
          '<div><dt>Organiser</dt><dd>' +
            (e.organizer_department ? escapeHtml(e.organizer_department)
                                    : '<span class="ev-notset">Not set</span>') + '</dd></div>' +
          '<div><dt>Visibility</dt><dd>' + escapeHtml(
              e.visibility === 'public' ? 'Public' : e.visibility === 'invite' ? 'Invite only' : 'Alumni only') + '</dd></div>' +
          '<div><dt>Registration</dt><dd>' + escapeHtml(evRegWindowText(e)) + '</dd></div>' +
          '<div><dt>Waitlist</dt><dd>' + (e.waitlist_enabled ? 'Enabled' : 'Off') + '</dd></div>' +
        '</dl></section>'
      : '') +

    '<section class="ev-panel">' +
      '<h2 class="ev-panel-title">Next steps</h2>' +
      '<div class="ev-starters">' +
        '<button type="button" class="ev-starter" onclick="switchEventTab(\'tasks\')">' +
          '<span class="ev-starter-icon">' + evIcon('clipboard-list') + '</span>' +
          '<span class="ev-starter-text"><strong>Add tasks</strong>' +
          '<span>Break the work down and give it deadlines</span></span>' +
          evIcon('chevron-right', 'ev-starter-chevron') + '</button>' +
        '<button type="button" class="ev-starter" onclick="switchEventTab(\'people\')">' +
          '<span class="ev-starter-icon">' + evIcon('users') + '</span>' +
          '<span class="ev-starter-text"><strong>Add people</strong>' +
          '<span>Build the committee and volunteer team</span></span>' +
          evIcon('chevron-right', 'ev-starter-chevron') + '</button>' +
        '<button type="button" class="ev-starter" onclick="evPreviewPublic()">' +
          '<span class="ev-starter-icon">' + evIcon('eye') + '</span>' +
          '<span class="ev-starter-text"><strong>Preview public event</strong>' +
          '<span>See what alumni will see</span></span>' +
          evIcon('chevron-right', 'ev-starter-chevron') + '</button>' +
      '</div>' +
      (hasTasks ? '' :
        '<div class="ev-callout">' + evIcon('list-checks') +
          '<div><strong>No tasks yet</strong>' +
          '<p>Add a ready-made checklist of the usual jobs — confirm venue, catering, ' +
          'invitations, volunteers — with deadlines worked back from the event date.</p></div>' +
          '<button class="btn btn-primary btn-sm" onclick="evAddStandardChecklist()">Add standard checklist</button>' +
        '</div>') +
    '</section>';
  evRefreshIcons();
}

function evRegWindowText(e) {
  const o = e.registration_opens_at ? evDate(e.registration_opens_at) : null;
  const c = e.registration_closes_at ? evDate(e.registration_closes_at) : null;
  if (o && c) return 'Open ' + o + ' to ' + c;
  if (o) return 'Opens ' + o;
  if (c) return 'Closes ' + c;
  return 'Open now';
}

async function evAddStandardChecklist() {
  if (!EV.event) return;
  const res = await API.addStandardChecklist(EV.event.id);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not add the checklist.', 'triangle-alert'); return; }
  showToast(res.created + ' task' + (res.created === 1 ? '' : 's') + ' added.', 'circle-check-big');
  await evReloadWorkspace('tasks');
}

/* ══════════════════════════════════════════════════════════
   TAB — TASKS  (filterable list; no Kanban at any width)
   ══════════════════════════════════════════════════════════ */

async function evTabTasks() {
  const el = document.getElementById('ev-tab-content');
  if (!el || !EV.event) return;
  el.innerHTML = renderSkeletonCards(3, 'planner');

  const tasks = await API.getEventTasks(EV.event.id);
  if (apiFailed(tasks)) {
    el.innerHTML = renderErrorState(tasks && tasks.error ? tasks.error : 'Could not load tasks.', 'evTabTasks()');
    evRefreshIcons();
    return;
  }
  EV.tasks = tasks;
  evRenderTaskList();
}

function evRenderTaskList() {
  const el = document.getElementById('ev-tab-content');
  if (!el) return;

  const counts = { all: EV.tasks.length, overdue: EV.tasks.filter(function (t) { return t.is_overdue; }).length };
  EV_TASK_STATUS.forEach(function (s) {
    counts[s.key] = EV.tasks.filter(function (t) { return t.status === s.key; }).length;
  });

  const chips = [{ key: 'all', label: 'All' }]
    .concat(EV_TASK_STATUS.map(function (s) { return { key: s.key, label: s.label }; }))
    .concat(counts.overdue ? [{ key: 'overdue', label: 'Overdue' }] : []);

  const filtered = EV.tasks.filter(function (t) {
    if (EV.taskFilter === 'all') return true;
    if (EV.taskFilter === 'overdue') return t.is_overdue;
    return t.status === EV.taskFilter;
  });

  el.innerHTML =
    '<section class="ev-panel">' +
      '<div class="ev-panel-head">' +
        '<h2 class="ev-panel-title">Tasks</h2>' +
        '<div class="ev-panel-actions">' +
          (EV.tasks.length ? '' :
            '<button class="btn btn-outline btn-sm" onclick="evAddStandardChecklist()">' +
            evIcon('list-checks') + ' Standard checklist</button>') +
          '<button class="btn btn-primary btn-sm" onclick="evNewTask()">' + evIcon('plus') + ' New task</button>' +
        '</div>' +
      '</div>' +
      '<div class="ev-filters" role="tablist" aria-label="Filter tasks">' +
        chips.map(function (c) {
          const on = EV.taskFilter === c.key;
          return '<button type="button" class="ev-chip ' + (on ? 'active' : '') + '" role="tab" ' +
                 'aria-selected="' + on + '" onclick="evSetTaskFilter(\'' + c.key + '\')">' +
                 c.label + '<span class="ev-chip-count">' + (counts[c.key] || 0) + '</span></button>';
        }).join('') +
      '</div>' +
      (filtered.length
        ? '<ul class="ev-tasklist">' + filtered.map(evTaskRow).join('') + '</ul>'
        : renderEmptyState(evIcon('clipboard-list'), 'No tasks here',
            EV.taskFilter === 'all' ? 'Add the first task to get started.' : 'Try another filter.')) +
    '</section>';
  evRefreshIcons();
}

function evSetTaskFilter(f) { EV.taskFilter = f; evRenderTaskList(); }

function evTaskStatusMeta(key) {
  return EV_TASK_STATUS.find(function (s) { return s.key === key; }) || EV_TASK_STATUS[0];
}

function evTaskRow(t) {
  const meta = evTaskStatusMeta(t.status);
  const assignees = t.assignees || [];
  const shown = assignees.slice(0, 3);
  const extra = assignees.length - shown.length;

  return '<li class="ev-task ' + (t.is_overdue ? 'overdue' : '') + '">' +
    '<button type="button" class="ev-task-main" onclick="evOpenTask(' + t.id + ')" ' +
            'aria-label="Open task ' + escapeHtml(t.title) + '">' +
      '<span class="ev-task-status ' + meta.tone + '">' + evIcon(meta.icon) +
        '<span class="ev-task-status-label">' + meta.label + '</span></span>' +
      '<span class="ev-task-body">' +
        '<span class="ev-task-title">' + escapeHtml(t.title) + '</span>' +
        '<span class="ev-task-meta">' +
          (t.category ? '<span class="ev-tag">' + escapeHtml(t.category) + '</span>' : '') +
          '<span class="ev-tag prio-' + escapeHtml(t.priority) + '">' + escapeHtml(t.priority) + '</span>' +
          (t.due_on
            ? '<span class="ev-task-due ' + (t.is_overdue ? 'danger' : '') + '">' + evIcon('calendar') + ' ' +
              escapeHtml(evDate(t.due_on)) + (t.is_overdue ? ' · overdue' : '') + '</span>'
            : '') +
          (t.verified_at ? '<span class="ev-task-due success">' + evIcon('badge-check') + ' Verified</span>' : '') +
        '</span>' +
        (t.status === 'blocked' && t.blocked_reason
          ? '<span class="ev-task-blocked">' + evIcon('octagon-alert') + ' ' + escapeHtml(t.blocked_reason) + '</span>'
          : '') +
      '</span>' +
      '<span class="ev-task-right">' +
        '<span class="ev-progress" role="img" aria-label="' + t.progress + ' percent complete">' +
          '<span class="ev-progress-track"><span class="ev-progress-fill" style="width:' + t.progress + '%"></span></span>' +
          '<span class="ev-progress-num">' + t.progress + '%</span>' +
        '</span>' +
        '<span class="ev-task-avatars">' +
          shown.map(function (a) {
            return '<span class="ev-stackav ' + (a.person_type === 'external' ? 'external' : '') + '" ' +
              'title="' + escapeHtml(a.name) + (a.person_type === 'external' ? ' (external)' : '') + '">' +
              evAvatar(a, 26) + '</span>'; }).join('') +
          (extra > 0 ? '<span class="ev-avatar ev-avatar-more" style="width:26px;height:26px">+' + extra + '</span>' : '') +
          (assignees.length === 0 ? '<span class="ev-unassigned">Unassigned</span>' : '') +
        '</span>' +
      '</span>' +
    '</button></li>';
}

/* ─── Task detail ─── */

async function evOpenTask(taskId) {
  const t = await API.getTask(taskId);
  if (apiFailed(t)) { showToast(t && t.error ? t.error : 'Could not open this task.', 'triangle-alert'); return; }
  EV.task = t;
  evRenderTaskModal();
}

function evRenderTaskModal() {
  const t = EV.task;
  if (!t) return;
  const canManage = t.access && t.access.canManage;
  const meta = evTaskStatusMeta(t.status);

  const statusButtons = EV_TASK_STATUS.map(function (s) {
    const on = t.status === s.key;
    return '<button type="button" class="ev-seg ' + (on ? 'active ' + s.tone : '') + '" ' +
      'aria-pressed="' + on + '" onclick="evSetTaskStatus(\'' + s.key + '\')">' +
      evIcon(s.icon) + '<span>' + s.label + '</span></button>';
  }).join('');

  const steps = [0, 25, 50, 75, 100].map(function (p) {
    return '<button type="button" class="ev-progress-step ' + (t.progress === p ? 'active' : '') + '" ' +
      'aria-pressed="' + (t.progress === p) + '" onclick="evSetTaskProgress(' + p + ')">' + p + '%</button>';
  }).join('');

  showModal(
    '<div class="modal-header">' +
      '<h2 class="modal-title">' + evIcon('clipboard-list') + ' ' + escapeHtml(t.title) + '</h2>' +
      '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button>' +
    '</div>' +
    '<div class="ev-taskmodal">' +

      (t.is_overdue ? '<p class="ev-banner danger">' + evIcon('triangle-alert') + ' This task is overdue.</p>' : '') +
      (t.status === 'blocked' && t.blocked_reason
        ? '<p class="ev-banner warn">' + evIcon('octagon-alert') + ' Blocked — ' + escapeHtml(t.blocked_reason) + '</p>' : '') +
      (t.verified_at
        ? '<p class="ev-banner success">' + evIcon('badge-check') + ' Verified by ' +
          escapeHtml(t.verified_by_name || 'an organiser') + ' on ' + escapeHtml(evDate(t.verified_at)) + '</p>' : '') +

      (t.description ? '<p class="ev-prose">' + escapeHtml(t.description) + '</p>' : '') +

      '<dl class="ev-deflist compact">' +
        '<div><dt>Category</dt><dd>' + escapeHtml(t.category || 'General') + '</dd></div>' +
        '<div><dt>Priority</dt><dd>' + escapeHtml(t.priority) + '</dd></div>' +
        '<div><dt>Deadline</dt><dd>' + (t.due_on ? escapeHtml(evDate(t.due_on)) : 'None') + '</dd></div>' +
        '<div><dt>Created by</dt><dd>' +
          (t.created_by_name ? escapeHtml(t.created_by_name) : '<span class="ev-notset">Not recorded</span>') +
          '</dd></div>' +
        (t.updated_by_name ? '<div><dt>Last updated by</dt><dd>' + escapeHtml(t.updated_by_name) +
          ' · ' + escapeHtml(evDate(t.updated_at)) + '</dd></div>' : '') +
        (t.completed_at ? '<div><dt>Completed</dt><dd>' + escapeHtml(evDate(t.completed_at)) + '</dd></div>' : '') +
      '</dl>' +

      '<div class="ev-field">' +
        '<span class="ev-label">Status</span>' +
        '<div class="ev-segrow" role="group" aria-label="Task status">' + statusButtons + '</div>' +
      '</div>' +

      '<div class="ev-field">' +
        '<span class="ev-label">Progress <strong>' + t.progress + '%</strong></span>' +
        '<div class="ev-progress-steps" role="group" aria-label="Task progress">' + steps + '</div>' +
      '</div>' +

      '<div class="ev-field">' +
        '<div class="ev-field-head">' +
          '<span class="ev-label">Assigned to</span>' +
          (canManage ? '<button class="btn btn-outline btn-sm" onclick="evOpenPicker(\'task\')">' +
            evIcon('user-plus') + ' Add people</button>' : '') +
        '</div>' +
        (t.assignees && t.assignees.length
          ? '<ul class="ev-people">' + t.assignees.map(function (a) {
              const isExternal = a.person_type === 'external';
              const meta = isExternal
                ? [a.role_label, a.organization].filter(Boolean).map(escapeHtml).join(' · ')
                : evPersonMeta(a);
              const remove = isExternal
                ? 'evRemoveAssigneePerson(' + a.event_person_id + ')'
                : 'evRemoveAssignee(' + a.user_id + ')';
              return '<li class="ev-person">' + evAvatar(a, 38) +
                '<div class="ev-person-text">' +
                  '<div class="ev-person-name"><strong>' + escapeHtml(a.name) + '</strong>' +
                    evPersonBadge(a.person_type) + '</div>' +
                  (meta ? '<span>' + meta + '</span>' : '') +
                  (isExternal
                    ? '<span class="ev-muted small">' + evIcon('info') +
                      ' External contact · No in-app account</span>' : '') +
                '</div>' +
                '<div class="ev-person-actions">' + evContactButtons(a, true) +
                  (canManage ? '<button type="button" class="ev-contact-btn sm danger" ' +
                    'onclick="' + remove + '" aria-label="Remove ' + escapeHtml(a.name) + '">' +
                    evIcon('user-minus') + '<span>Remove</span></button>' : '') +
                '</div></li>'; }).join('') + '</ul>'
          : '<p class="ev-muted">Nobody assigned yet.</p>') +
        (t.assigned_to && (!t.assignees || !t.assignees.length)
          ? '<p class="ev-muted small">Previously recorded as “' + escapeHtml(t.assigned_to) +
            '” before people were linked to accounts.</p>' : '') +
      '</div>' +

      '<div class="ev-field">' +
        '<div class="ev-field-head"><span class="ev-label">Checklist</span>' +
        (canManage ? '<button class="btn btn-ghost btn-sm" onclick="evAddChecklistItem()">' +
          evIcon('plus') + ' Add item</button>' : '') + '</div>' +
        (t.checklist && t.checklist.length
          ? '<ul class="ev-checklist">' + t.checklist.map(function (c) {
              return '<li><label class="ev-check"><input type="checkbox" ' + (c.is_done ? 'checked' : '') +
                ' onchange="evToggleChecklist(' + c.id + ', this.checked)" />' +
                '<span>' + escapeHtml(c.label) + '</span></label>' +
                (canManage ? '<button type="button" class="ev-icon-btn" onclick="evDeleteChecklistItem(' + c.id + ')" ' +
                  'aria-label="Remove checklist item">' + evIcon('x') + '</button>' : '') + '</li>'; }).join('') + '</ul>'
          : '<p class="ev-muted">No checklist items.</p>') +
      '</div>' +

      '<div class="ev-field">' +
        '<span class="ev-label">Notes</span>' +
        (t.notes && t.notes.length
          ? '<ul class="ev-notes">' + t.notes.map(function (n) {
              return '<li><div class="ev-note-head"><strong>' + escapeHtml(n.author || 'Someone') + '</strong>' +
                '<span>' + escapeHtml(formatRelativeTime(n.created_at)) + '</span></div>' +
                '<p>' + escapeHtml(n.body) + '</p></li>'; }).join('') + '</ul>'
          : '<p class="ev-muted">No notes yet.</p>') +
        '<form class="ev-note-form" onsubmit="evAddNote(event)">' +
          '<label class="sr-only" for="ev-note-input">Add a note</label>' +
          '<input type="text" id="ev-note-input" class="form-input" placeholder="Add a note…" maxlength="500" />' +
          '<button type="submit" class="btn btn-outline btn-sm">' + evIcon('send') + ' Post</button>' +
        '</form>' +
      '</div>' +

      '<div class="ev-modal-footer">' +
        (canManage
          ? '<button class="btn btn-outline btn-sm" onclick="evEditTask()">' + evIcon('pencil') + ' Edit details</button>' +
            (t.status === 'completed' && !t.verified_at
              ? '<button class="btn btn-primary btn-sm" onclick="evVerifyTask()">' + evIcon('badge-check') + ' Verify</button>' : '') +
            '<button class="btn btn-ghost btn-sm ev-danger" onclick="evDeleteTask()">' + evIcon('trash-2') + ' Delete</button>'
          : '') +
      '</div>' +
    '</div>');
  evRefreshIcons();
}

async function evReloadTask() {
  if (!EV.task) return;
  const t = await API.getTask(EV.task.id);
  if (!apiFailed(t)) { EV.task = t; evRenderTaskModal(); }

  // An assignee can reach a task straight from a notification without ever
  // opening the event workspace, so there may be no event list to refresh.
  if (!EV.event) return;
  const tasks = await API.getEventTasks(EV.event.id);
  if (!apiFailed(tasks)) { EV.tasks = tasks; if (EV.tab === 'tasks') evRenderTaskList(); }
}

async function evSetTaskStatus(status) {
  if (!EV.task) return;
  let payload = { status: status };
  if (status === 'blocked') {
    const reason = prompt('What is blocking this task?', EV.task.blocked_reason || '');
    if (reason === null) return;
    if (!reason.trim()) { showToast('A reason is required to mark a task blocked.', 'triangle-alert'); return; }
    payload.blockedReason = reason.trim();
  }
  const res = await API.updateTask(EV.task.id, payload);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not update the task.', 'triangle-alert'); return; }
  showToast('Task set to ' + evTaskStatusMeta(status).label + '.', 'circle-check-big');
  await evReloadTask();
}

async function evSetTaskProgress(p) {
  if (!EV.task) return;
  const payload = { progress: p };
  if (p > 0 && p < 100 && EV.task.status === 'todo') payload.status = 'in_progress';
  const res = await API.updateTask(EV.task.id, payload);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not update progress.', 'triangle-alert'); return; }
  showToast('Progress set to ' + p + '%.', 'circle-check-big');
  await evReloadTask();
}

async function evVerifyTask() {
  const res = await API.verifyTask(EV.task.id);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not verify.', 'triangle-alert'); return; }
  showToast('Task verified.', 'badge-check');
  await evReloadTask();
}

async function evDeleteTask() {
  if (!confirm('Delete this task? This cannot be undone.')) return;
  const res = await API.deleteTask(EV.task.id);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not delete.', 'triangle-alert'); return; }
  closeModal();
  showToast('Task deleted.', 'trash-2');
  EV.task = null;
  if (EV.event) evTabTasks();
}

async function evAddNote(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('ev-note-input');
  const body = input ? input.value.trim() : '';
  if (!body) return;
  const res = await API.addTaskNote(EV.task.id, body);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not post the note.', 'triangle-alert'); return; }
  await evReloadTask();
}

async function evAddChecklistItem() {
  const label = prompt('Checklist item');
  if (!label || !label.trim()) return;
  const res = await API.addChecklistItem(EV.task.id, label.trim());
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not add the item.', 'triangle-alert'); return; }
  await evReloadTask();
}
async function evToggleChecklist(id, isDone) {
  await API.setChecklistItem(id, isDone);
  await evReloadTask();
}
async function evDeleteChecklistItem(id) {
  await API.deleteChecklistItem(id);
  await evReloadTask();
}
async function evRemoveAssignee(userId) {
  const res = await API.removeTaskAssignee(EV.task.id, userId);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not remove.', 'triangle-alert'); return; }
  await evReloadTask();
}

// An external contact is keyed by its event_people row, not a user id.
async function evRemoveAssigneePerson(personId) {
  const res = await API.removeTaskPerson(EV.task.id, personId);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not remove.', 'triangle-alert'); return; }
  await evReloadTask();
}

/* ─── Create / edit a task ─── */

function evTaskForm(t) {
  const isEdit = !!t;
  return '<form onsubmit="evSubmitTask(event, ' + (isEdit ? t.id : 'null') + ')" class="ev-form">' +
    '<div class="ev-field"><label class="ev-label" for="ev-t-title">Task title <span class="req">*</span></label>' +
      '<input type="text" id="ev-t-title" class="form-input" required maxlength="200" ' +
      'value="' + (isEdit ? escapeHtml(t.title) : '') + '" placeholder="Confirm venue booking" />' +
      '<span class="ev-help">What needs to be done, in a few words.</span></div>' +

    '<div class="ev-field"><label class="ev-label" for="ev-t-desc">Details</label>' +
      '<textarea id="ev-t-desc" class="form-input" rows="3" maxlength="1000" ' +
      'placeholder="Anything the person doing this needs to know">' + (isEdit ? escapeHtml(t.description || '') : '') + '</textarea></div>' +

    '<div class="ev-grid2">' +
      '<div class="ev-field"><label class="ev-label" for="ev-t-cat">Category</label>' +
        '<select id="ev-t-cat" class="form-select">' +
        EV_TASK_CATEGORIES.map(function (c) {
          return '<option value="' + c + '"' + (isEdit && t.category === c ? ' selected' : '') + '>' + c + '</option>';
        }).join('') + '</select></div>' +
      '<div class="ev-field"><label class="ev-label" for="ev-t-prio">Priority</label>' +
        '<select id="ev-t-prio" class="form-select">' +
        EV_PRIORITIES.map(function (p) {
          const sel = isEdit ? t.priority === p : p === 'medium';
          return '<option value="' + p + '"' + (sel ? ' selected' : '') + '>' +
                 p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
        }).join('') + '</select></div>' +
    '</div>' +

    '<div class="ev-field"><label class="ev-label" for="ev-t-due">Deadline</label>' +
      '<input type="date" id="ev-t-due" class="form-input" value="' + (isEdit ? evDateInput(t.due_on) : '') + '" />' +
      '<span class="ev-help">Optional. Overdue tasks are flagged automatically.</span></div>' +

    '<div class="ev-modal-footer">' +
      '<button type="button" class="btn btn-outline" onclick="' + (isEdit ? 'evRenderTaskModal()' : 'closeModal()') + '">' +
        (isEdit ? 'Back' : 'Cancel') + '</button>' +
      '<button type="submit" class="btn btn-primary">' + (isEdit ? 'Save changes' : 'Create task') + '</button>' +
    '</div></form>';
}

function evNewTask() {
  showModal('<div class="modal-header"><h2 class="modal-title">' + evIcon('plus') + ' New task</h2>' +
    '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button></div>' +
    evTaskForm(null));
  evRefreshIcons();
}

function evEditTask() {
  showModal('<div class="modal-header"><h2 class="modal-title">' + evIcon('pencil') + ' Edit task</h2>' +
    '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button></div>' +
    evTaskForm(EV.task));
  evRefreshIcons();
}

async function evSubmitTask(e, taskId) {
  if (e) e.preventDefault();
  const payload = {
    title: document.getElementById('ev-t-title').value.trim(),
    description: document.getElementById('ev-t-desc').value.trim(),
    category: document.getElementById('ev-t-cat').value,
    priority: document.getElementById('ev-t-prio').value,
    dueOn: document.getElementById('ev-t-due').value || null
  };
  if (!payload.title) { showToast('A task title is required.', 'triangle-alert'); return; }

  const res = taskId ? await API.updateTask(taskId, payload) : await API.createTask(EV.event.id, payload);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not save the task.', 'triangle-alert'); return; }

  if (taskId) { EV.task = res; showToast('Task updated.', 'circle-check-big'); await evReloadTask(); }
  else { closeModal(); showToast('Task created.', 'circle-check-big'); await evTabTasks(); }
}

/* ══════════════════════════════════════════════════════════
   DIRECTORY PICKER  (desktop popover / mobile full-screen sheet)
   ══════════════════════════════════════════════════════════ */

function evOpenPicker(mode) {
  EV.picker = { mode: mode, selected: [], results: [], query: '', timer: null,
                role: 'member', source: 'directory', external: [] };
  evRenderPicker();
  evPickerSearch('');
  // Assigning a task can also draw on the external contacts already on this
  // event, so they are fetched alongside the directory search.
  if (mode === 'task' && EV.event) {
    API.getEventPeople(EV.event.id).then(function (rows) {
      if (!apiFailed(rows) && EV.picker) {
        EV.picker.external = rows.filter(function (r) { return r.person_type === 'external'; });
        if (EV.picker.source === 'external') evRenderPickerResults();
        evRenderPickerTabs();
      }
    });
  }
}

function evSetPickerSource(src) {
  if (!EV.picker) return;
  EV.picker.source = src;
  evRenderPickerTabs();
  evRenderPickerResults();
}

function evRenderPickerTabs() {
  const p = EV.picker;
  const box = document.getElementById('ev-picker-tabs');
  if (!p || !box) return;
  if (p.mode !== 'task') { box.innerHTML = ''; return; }
  const n = (p.external || []).length;
  box.innerHTML =
    '<div class="ev-filters" role="tablist" aria-label="Where the person comes from">' +
      '<button type="button" class="ev-chip ' + (p.source === 'directory' ? 'active' : '') + '" role="tab" ' +
        'aria-selected="' + (p.source === 'directory') + '" onclick="evSetPickerSource(\'directory\')">' +
        evIcon('graduation-cap') + ' DIC directory</button>' +
      '<button type="button" class="ev-chip ' + (p.source === 'external' ? 'active' : '') + '" role="tab" ' +
        'aria-selected="' + (p.source === 'external') + '" onclick="evSetPickerSource(\'external\')">' +
        evIcon('user-round') + ' External contacts<span class="ev-chip-count">' + n + '</span></button>' +
    '</div>';
  const search = document.getElementById('ev-picker-searchbox');
  if (search) search.classList.toggle('hidden', p.source === 'external');
  evRefreshIcons();
}

function evRenderPicker() {
  const p = EV.picker;
  if (!p) return;
  const isPeople = p.mode === 'people';

  showModal(
    '<div class="modal-header">' +
      '<h2 class="modal-title">' + evIcon('user-plus') + ' ' +
        (isPeople ? 'Add people to this event' : 'Assign people to this task') + '</h2>' +
      '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button>' +
    '</div>' +
    '<div class="ev-picker">' +
      (isPeople
        ? '<div class="ev-field"><label class="ev-label" for="ev-pk-role">Role on this event</label>' +
          '<select id="ev-pk-role" class="form-select" onchange="EV.picker.role=this.value">' +
          EV_PEOPLE_ROLES.map(function (r) {
            return '<option value="' + r.key + '"' + (p.role === r.key ? ' selected' : '') + '>' + r.label + '</option>';
          }).join('') + '</select></div>'
        : '') +

      '<div id="ev-picker-tabs"></div>' +

      '<div class="ev-field" id="ev-picker-searchbox">' +
        '<label class="ev-label" for="ev-pk-q">Search the directory</label>' +
        '<div class="ev-search boxed">' + evIcon('search', 'ev-search-icon') +
          '<input type="search" id="ev-pk-q" class="ev-search-input" autocomplete="off" ' +
          'placeholder="Name, ID, phone, department or section" ' +
          'oninput="evPickerSearch(this.value)" />' +
        '</div>' +
        '<span class="ev-help">Search by name, alumni/student ID, phone number, department or section.</span>' +
      '</div>' +

      '<div class="ev-picker-selected" id="ev-picker-selected"></div>' +
      '<div class="ev-picker-results" id="ev-picker-results" role="listbox" aria-label="Search results"></div>' +

      '<div class="ev-modal-footer sticky">' +
        '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
        '<button type="button" class="btn btn-primary" id="ev-picker-confirm" onclick="evPickerConfirm()" disabled>' +
          'Add people</button>' +
      '</div>' +
    '</div>');
  evRefreshIcons();
  evRenderPickerTabs();
  evRenderPickerSelected();
}

function evPickerSearch(q) {
  const p = EV.picker;
  if (!p) return;
  p.query = q;
  clearTimeout(p.timer);
  p.timer = setTimeout(async function () {
    const box = document.getElementById('ev-picker-results');
    if (box) box.innerHTML = '<p class="ev-muted">Searching…</p>';
    const res = await API.searchDirectory({ q: q, limit: 25 });
    if (apiFailed(res)) {
      if (box) box.innerHTML = '<p class="ev-muted">' + escapeHtml(res && res.error ? res.error : 'Search failed.') + '</p>';
      return;
    }
    p.results = res.results || [];
    evRenderPickerResults();
  }, 220);
}

function evRenderPickerResults() {
  const p = EV.picker;
  const box = document.getElementById('ev-picker-results');
  if (!p || !box) return;

  // External contacts are attached to this event, so the list is local rather
  // than a search; DIC people come from the directory query.
  const externalMode = p.mode === 'task' && p.source === 'external';
  const rows = externalMode ? (p.external || []) : p.results;

  const already = p.mode === 'task' && EV.task
    ? (EV.task.assignees || []).map(function (a) {
        return a.person_type === 'external' ? 'x' + a.event_person_id : 'u' + a.user_id; })
    : (EV.people || []).map(function (x) { return 'u' + x.user_id; });

  if (!rows.length) {
    box.innerHTML = externalMode
      ? '<div class="ev-picker-empty">' + evIcon('user-round') +
        '<p>No external contacts on this event yet.</p>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="evOpenExternalForm()">' +
        evIcon('plus') + ' Add external person</button></div>'
      : '<p class="ev-muted">No matching people.</p>';
    evRefreshIcons();
    return;
  }

  box.innerHTML = rows.map(function (r) {
    const key = externalMode ? 'x' + r.id : 'u' + r.id;
    const isSel = p.selected.some(function (s) { return s.key === key; });
    const isOn = already.indexOf(key) !== -1;
    const meta = externalMode
      ? [r.role_title || r.role_label, r.organization].filter(Boolean).map(escapeHtml).join(' · ')
      : evPersonMeta(r);
    return '<button type="button" role="option" aria-selected="' + isSel + '" ' +
      'class="ev-picker-row ' + (isSel ? 'selected' : '') + (isOn ? ' disabled' : '') + '" ' +
      (isOn ? 'disabled ' : '') + 'onclick="evPickerToggle(\'' + key + '\')">' +
      evAvatar(r, 40) +
      '<span class="ev-picker-text">' +
        '<span class="ev-person-name"><strong>' + escapeHtml(r.name) + '</strong>' +
          evPersonBadge(externalMode ? 'external' : 'directory') + '</span>' +
        '<span>' + (meta || '—') + '</span>' +
        '<span class="ev-picker-contact">' +
          (r.phone ? '<span>' + evIcon('phone') + escapeHtml(r.phone) + '</span>' : '') +
          (r.whatsapp ? '<span>' + evIcon('message-circle') + escapeHtml(r.whatsapp) + '</span>' : '') +
        '</span>' +
      '</span>' +
      '<span class="ev-picker-mark">' +
        (isOn ? evIcon('check') + ' Added' : (isSel ? evIcon('circle-check-big') : evIcon('circle-plus'))) +
      '</span></button>';
  }).join('') +
    (externalMode
      ? '<button type="button" class="ev-picker-addnew" onclick="evOpenExternalForm()">' +
        evIcon('plus') + ' Add another external person</button>'
      : '');
  evRefreshIcons();
}

function evPickerToggle(key) {
  const p = EV.picker;
  if (!p) return;
  const idx = p.selected.findIndex(function (s) { return s.key === key; });
  if (idx >= 0) {
    p.selected.splice(idx, 1);
  } else {
    const isExternal = String(key).charAt(0) === 'x';
    const id = parseInt(String(key).slice(1), 10);
    const src = isExternal ? (p.external || []) : p.results;
    const r = src.find(function (x) { return x.id === id; });
    if (r) p.selected.push({ key: key, id: id, name: r.name, initials: r.initials,
                             photo_url: r.photo_url, external: isExternal });
  }
  evRenderPickerResults();
  evRenderPickerSelected();
}

function evRenderPickerSelected() {
  const p = EV.picker;
  const box = document.getElementById('ev-picker-selected');
  const btn = document.getElementById('ev-picker-confirm');
  if (!p || !box) return;

  if (!p.selected.length) {
    box.innerHTML = '<p class="ev-muted small">Nobody selected yet.</p>';
  } else {
    const externals = p.selected.filter(function (s) { return s.external; }).length;
    box.innerHTML = '<div class="ev-chips">' + p.selected.map(function (s) {
      return '<span class="ev-selchip ' + (s.external ? 'external' : '') + '">' +
        evAvatar(s, 22) + escapeHtml(s.name) +
        '<button type="button" onclick="evPickerToggle(\'' + s.key + '\')" ' +
        'aria-label="Remove ' + escapeHtml(s.name) + '">' + evIcon('x') + '</button></span>';
    }).join('') + '</div>' +
    (externals
      ? '<p class="ev-muted small">' + evIcon('info') + ' ' + externals +
        ' external contact' + (externals === 1 ? '' : 's') +
        ' selected — they have no in-app account and will not be notified.</p>'
      : '');
  }
  if (btn) {
    btn.disabled = p.selected.length === 0;
    btn.textContent = p.selected.length
      ? 'Add ' + p.selected.length + ' ' + (p.selected.length === 1 ? 'person' : 'people')
      : 'Add people';
  }
  evRefreshIcons();
}

async function evPickerConfirm() {
  const p = EV.picker;
  if (!p || !p.selected.length) return;

  if (p.mode === 'task') {
    const userIds = p.selected.filter(function (s) { return !s.external; }).map(function (s) { return s.id; });
    const eventPersonIds = p.selected.filter(function (s) { return s.external; }).map(function (s) { return s.id; });
    const res = await API.addTaskAssignees(EV.task.id, { userIds: userIds, eventPersonIds: eventPersonIds });
    if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not assign.', 'triangle-alert'); return; }
    showToast(res.added + ' assigned' +
      (res.notified ? ' · ' + res.notified + ' notified' : '') +
      (res.externalAdded ? ' · ' + res.externalAdded + ' external (no notification)' : '') + '.',
      'user-plus');
    EV.picker = null;
    await evReloadTask();
  } else {
    const ids = p.selected.filter(function (s) { return !s.external; }).map(function (s) { return s.id; });
    const res = await API.addEventPeople(EV.event.id, { userIds: ids, roleInEvent: p.role });
    if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not add people.', 'triangle-alert'); return; }
    closeModal();
    showToast(res.added + ' person' + (res.added === 1 ? '' : 's') + ' added to the team.', 'users');
    EV.picker = null;
    await evTabPeople();
  }
}

/* ══════════════════════════════════════════════════════════
   TAB — TICKETS & ATTENDEES
   ══════════════════════════════════════════════════════════ */

async function evTabTickets() {
  const el = document.getElementById('ev-tab-content');
  if (!el || !EV.event) return;
  el.innerHTML = renderSkeletonCards(2, 'planner');

  const results = await Promise.all([
    API.getTicketTypes(EV.event.id),
    API.getAttendees(EV.event.id)
  ]);
  const types = results[0], attendees = results[1];

  if (apiFailed(types) || apiFailed(attendees)) {
    el.innerHTML = renderErrorState('Could not load tickets and attendees.', 'evTabTickets()');
    evRefreshIcons();
    return;
  }
  EV.ticketTypes = types;
  EV.attendees = attendees;
  evRenderTickets();
}

function evRenderTickets() {
  const el = document.getElementById('ev-tab-content');
  const e = EV.event;
  if (!el || !e) return;

  const rows = EV.attendees;
  const confirmed = rows.filter(function (r) { return r.status === 'confirmed'; });
  const waitlisted = rows.filter(function (r) { return r.status === 'waitlisted'; });
  const cancelled = rows.filter(function (r) { return r.status === 'cancelled'; });
  const checkedIn = rows.filter(function (r) { return r.checked_in; });
  const available = Math.max(0, (e.capacity || 0) - confirmed.length);

  el.innerHTML =
    '<div class="ev-stats">' +
      evStat('users', confirmed.length, 'Confirmed', 'info') +
      evStat('hourglass', waitlisted.length, 'Waitlisted', waitlisted.length ? 'warn' : '') +
      evStat('circle-check-big', checkedIn.length, 'Checked in', 'success') +
      evStat('armchair', available, 'Available') +
    '</div>' +

    /* ── Ticket types ── */
    '<section class="ev-panel">' +
      '<div class="ev-panel-head"><h2 class="ev-panel-title">Ticket types</h2>' +
        '<button class="btn btn-outline btn-sm" onclick="evAddTicketType()">' + evIcon('plus') + ' Add type</button></div>' +
      (EV.ticketTypes.length
        ? '<ul class="ev-ticketlist">' + EV.ticketTypes.map(function (t) {
            const quota = t.quota == null ? '∞' : t.quota;
            const pct = t.quota ? Math.min(100, Math.round((t.sold / t.quota) * 100)) : 0;
            return '<li class="ev-ticketrow">' +
              '<div class="ev-ticketrow-main">' +
                '<strong>' + escapeHtml(t.name) + '</strong>' +
                '<span class="ev-ticketrow-price">' + (Number(t.price) > 0 ? evMoney(t.price) : 'Free') + '</span>' +
              '</div>' +
              '<div class="ev-ticketrow-quota">' +
                '<div class="ev-capacity-track"><div class="ev-capacity-fill" style="width:' + pct + '%"></div></div>' +
                '<span>' + t.sold + ' of ' + quota + ' issued</span>' +
              '</div>' +
              '<button type="button" class="ev-icon-btn" onclick="evEditTicketType(' + t.id + ')" ' +
                'aria-label="Edit ticket type ' + escapeHtml(t.name) + '">' + evIcon('pencil') + '</button>' +
              '<button type="button" class="ev-icon-btn danger" onclick="evDeleteTicketType(' + t.id + ')" ' +
                'aria-label="Remove ticket type ' + escapeHtml(t.name) + '">' + evIcon('trash-2') + '</button>' +
            '</li>'; }).join('') + '</ul>'
        : '<p class="ev-muted">No ticket types yet.</p>') +
    '</section>' +

    /* ── Check-in ── */
    '<section class="ev-panel">' +
      '<h2 class="ev-panel-title">Check-in</h2>' +
      '<p class="ev-help">Scan a ticket QR into the box, or type the code printed on it.</p>' +
      '<form class="ev-checkin" onsubmit="evCheckIn(event)">' +
        '<label class="sr-only" for="ev-checkin-code">Ticket code</label>' +
        '<input type="text" id="ev-checkin-code" class="form-input" autocomplete="off" ' +
          'placeholder="DIC-TKT-XXXXX-XXXXXX" required />' +
        '<button type="submit" class="btn btn-primary">' + evIcon('scan-line') + ' Check in</button>' +
      '</form>' +
      '<div id="ev-checkin-result" aria-live="polite"></div>' +
    '</section>' +

    /* ── Registrations & waitlist ── */
    '<section class="ev-panel">' +
      '<div class="ev-panel-head"><h2 class="ev-panel-title">Registrations</h2>' +
        '<a class="btn btn-outline btn-sm" href="' + API.attendeesCsvUrl(e.id) + '" download>' +
          evIcon('download') + ' Export CSV</a></div>' +
      (rows.length
        ? (waitlisted.length
            ? '<h3 class="ev-subhead">' + evIcon('hourglass') + ' Waitlist (' + waitlisted.length + ')' +
              '<span class="ev-help inline">Promoted automatically when a confirmed ticket is cancelled.</span></h3>' +
              '<ul class="ev-people">' + waitlisted.map(evAttendeeRow).join('') + '</ul>'
            : '') +
          '<h3 class="ev-subhead">' + evIcon('users') + ' Confirmed (' + confirmed.length + ')</h3>' +
          (confirmed.length ? '<ul class="ev-people">' + confirmed.map(evAttendeeRow).join('') + '</ul>'
                            : '<p class="ev-muted">Nobody has registered yet.</p>') +
          (cancelled.length
            ? '<h3 class="ev-subhead">' + evIcon('circle-x') + ' Cancelled (' + cancelled.length + ')</h3>' +
              '<ul class="ev-people">' + cancelled.map(evAttendeeRow).join('') + '</ul>'
            : '')
        : renderEmptyState(evIcon('ticket'), 'No registrations yet',
            'Tickets appear here as alumni register.')) +
    '</section>';
  evRefreshIcons();
}

function evAttendeeRow(a) {
  return '<li class="ev-person">' + evAvatar(a, 38) +
    '<div class="ev-person-text"><strong>' + escapeHtml(a.name) + '</strong>' +
      '<span>' + evPersonMeta(a) + '</span>' +
      '<span class="ev-mono">' + escapeHtml(a.ticket_code) +
        (a.ticket_type_name ? ' · ' + escapeHtml(a.ticket_type_name) : '') +
        (Number(a.amount_paid) > 0 ? ' · ' + evMoney(a.amount_paid) : '') + '</span>' +
    '</div>' +
    '<div class="ev-person-actions">' +
      (a.checked_in
        ? '<span class="ev-pill success">' + evIcon('circle-check-big') + ' Checked in</span>'
        : a.status === 'waitlisted'
          ? '<span class="ev-pill warn">' + evIcon('hourglass') + ' Waitlist</span>'
          : a.status === 'cancelled'
            ? '<span class="ev-pill muted">' + evIcon('circle-x') + ' Cancelled</span>'
            : '<span class="ev-pill">' + evIcon('ticket') + ' Confirmed</span>') +
      evContactButtons(a, true) +
    '</div></li>';
}

async function evCheckIn(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('ev-checkin-code');
  const box = document.getElementById('ev-checkin-result');
  const code = input ? input.value.trim() : '';
  if (!code) return;

  const res = await API.checkInTicket(code);
  if (apiFailed(res)) {
    box.innerHTML = '<p class="ev-banner danger">' + evIcon('circle-x') + ' ' +
      escapeHtml(res && res.error ? res.error : 'Check-in failed') + '</p>';
    evRefreshIcons();
    return;
  }
  box.innerHTML = '<p class="ev-banner success">' + evIcon('circle-check-big') + ' ' +
    escapeHtml(res.attendee) + ' checked in' + (res.batch ? ' · Batch ' + escapeHtml(String(res.batch)) : '') + '</p>';
  input.value = '';
  input.focus();
  const rows = await API.getAttendees(EV.event.id);
  if (!apiFailed(rows)) EV.attendees = rows;
  evRefreshIcons();
}

function evAddTicketType() {
  showModal('<div class="modal-header"><h2 class="modal-title">' + evIcon('ticket') + ' Add ticket type</h2>' +
    '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button></div>' +
    '<form class="ev-form" onsubmit="evSubmitTicketType(event, null)">' +
      '<div class="ev-field"><label class="ev-label" for="ev-tt-name">Name <span class="req">*</span></label>' +
        '<input type="text" id="ev-tt-name" class="form-input" required placeholder="Alumni" /></div>' +
      '<div class="ev-grid2">' +
        '<div class="ev-field"><label class="ev-label" for="ev-tt-price">Price (৳)</label>' +
          '<input type="number" id="ev-tt-price" class="form-input" min="0" step="1" value="0" />' +
          '<span class="ev-help">Use 0 for a free ticket.</span></div>' +
        '<div class="ev-field"><label class="ev-label" for="ev-tt-quota">Quota</label>' +
          '<input type="number" id="ev-tt-quota" class="form-input" min="0" step="1" placeholder="Unlimited" />' +
          '<span class="ev-help">Leave blank for no per-type limit.</span></div>' +
      '</div>' +
      '<div class="ev-modal-footer">' +
        '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
        '<button type="submit" class="btn btn-primary">Add ticket type</button></div>' +
    '</form>');
  evRefreshIcons();
}

function evEditTicketType(id) {
  const t = EV.ticketTypes.find(function (x) { return x.id === id; });
  if (!t) return;
  showModal('<div class="modal-header"><h2 class="modal-title">' + evIcon('pencil') + ' Edit ticket type</h2>' +
    '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button></div>' +
    '<form class="ev-form" onsubmit="evSubmitTicketType(event, ' + id + ')">' +
      '<div class="ev-field"><label class="ev-label" for="ev-tt-name">Name <span class="req">*</span></label>' +
        '<input type="text" id="ev-tt-name" class="form-input" required value="' + escapeHtml(t.name) + '" /></div>' +
      '<div class="ev-grid2">' +
        '<div class="ev-field"><label class="ev-label" for="ev-tt-price">Price (৳)</label>' +
          '<input type="number" id="ev-tt-price" class="form-input" min="0" value="' + Number(t.price) + '" /></div>' +
        '<div class="ev-field"><label class="ev-label" for="ev-tt-quota">Quota</label>' +
          '<input type="number" id="ev-tt-quota" class="form-input" min="' + t.sold + '" ' +
          'value="' + (t.quota == null ? '' : t.quota) + '" placeholder="Unlimited" />' +
          '<span class="ev-help">' + t.sold + ' already issued.</span></div>' +
      '</div>' +
      '<div class="ev-modal-footer">' +
        '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
        '<button type="submit" class="btn btn-primary">Save changes</button></div>' +
    '</form>');
  evRefreshIcons();
}

async function evSubmitTicketType(e, id) {
  if (e) e.preventDefault();
  const quotaRaw = document.getElementById('ev-tt-quota').value;
  const payload = {
    name: document.getElementById('ev-tt-name').value.trim(),
    price: Number(document.getElementById('ev-tt-price').value) || 0,
    quota: quotaRaw === '' ? null : Number(quotaRaw)
  };
  const res = id ? await API.updateTicketType(id, payload) : await API.addTicketType(EV.event.id, payload);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not save.', 'triangle-alert'); return; }
  closeModal();
  showToast('Ticket type saved.', 'circle-check-big');
  await evTabTickets();
}

async function evDeleteTicketType(id) {
  if (!confirm('Remove this ticket type?')) return;
  const res = await API.deleteTicketType(id);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not remove.', 'triangle-alert'); return; }
  showToast('Ticket type removed.', 'trash-2');
  await evTabTickets();
}

/* ══════════════════════════════════════════════════════════
   PEOPLE — DIC members and external contacts, kept visibly apart
   ══════════════════════════════════════════════════════════ */

// Common roles for someone with no DIC account, offered as suggestions.
const EV_EXTERNAL_ROLES = ['Decorator', 'Caterer', 'Photographer', 'Sound Engineer',
                           'Security', 'Venue staff', 'External volunteer',
                           'Vendor representative', 'Transport', 'Other'];

function evPersonBadge(type) {
  return type === 'external'
    ? '<span class="ev-typebadge external">' + evIcon('user-round') + 'External</span>'
    : '<span class="ev-typebadge dic">' + evIcon('graduation-cap') + 'DIC member</span>';
}

async function evTabPeople() {
  const el = document.getElementById('ev-tab-content');
  if (!el || !EV.event) return;
  el.innerHTML = renderSkeletonCards(2, 'planner');

  const people = await API.getEventPeople(EV.event.id);
  if (apiFailed(people)) {
    el.innerHTML = renderErrorState(people && people.error ? people.error : 'Could not load people.', 'evTabPeople()');
    evRefreshIcons();
    return;
  }
  EV.people = people;

  const dic = people.filter(function (p) { return p.person_type !== 'external'; });
  const ext = people.filter(function (p) { return p.person_type === 'external'; });

  const dicGroups = EV_PEOPLE_ROLES.map(function (r) {
    return { role: r, members: dic.filter(function (p) { return p.role_in_event === r.key; }) };
  }).filter(function (g) { return g.members.length; });

  el.innerHTML =
    '<section class="ev-panel">' +
      '<div class="ev-panel-head">' +
        '<h2 class="ev-panel-title">Event team</h2>' +
        '<button type="button" class="btn btn-primary btn-sm" onclick="evOpenAddPeople()">' +
          evIcon('user-plus') + ' Add people</button>' +
      '</div>' +

      (people.length
        ? '<div class="ev-stats compact">' +
            evStat('graduation-cap', dic.length, 'DIC members', 'info') +
            evStat('user-round', ext.length, 'External contacts') +
          '</div>'
        : '') +

      /* ── DIC members ── */
      '<h3 class="ev-subhead">' + evIcon('graduation-cap') + ' DIC members' +
        (dic.length ? ' (' + dic.length + ')' : '') + '</h3>' +
      (dic.length
        ? dicGroups.map(function (g) {
            return '<p class="ev-grouplabel">' + escapeHtml(g.role.label) + '</p>' +
              '<ul class="ev-people">' + g.members.map(evPersonRow).join('') + '</ul>';
          }).join('')
        : '<p class="ev-muted">No DIC members on this event yet.</p>') +

      /* ── External contacts ── */
      '<h3 class="ev-subhead">' + evIcon('user-round') + ' External contacts' +
        (ext.length ? ' (' + ext.length + ')' : '') +
        '<span class="ev-help inline">People with no DIC account — decorators, caterers, vendors.</span></h3>' +
      (ext.length
        ? '<ul class="ev-people">' + ext.map(evPersonRow).join('') + '</ul>'
        : '<p class="ev-muted">No external contacts yet.</p>') +
    '</section>';
  evRefreshIcons();
}

function evPersonRow(p) {
  const isExternal = p.person_type === 'external';
  const meta = isExternal
    ? [p.organization, p.dept].filter(Boolean).map(escapeHtml).join(' · ')
    : evPersonMeta(p);

  return '<li class="ev-person">' + evAvatar(p, 42) +
    '<div class="ev-person-text">' +
      '<div class="ev-person-name"><strong>' + escapeHtml(p.name) + '</strong>' + evPersonBadge(p.person_type) + '</div>' +
      (p.role_label ? '<span class="ev-person-role">' + escapeHtml(p.role_label) + '</span>' : '') +
      (meta ? '<span>' + meta + '</span>' : '') +
      (p.committee ? '<span class="ev-tag">' + escapeHtml(p.committee) + '</span>' : '') +
      (isExternal
        ? '<span class="ev-muted small">' + evIcon('info') + ' External contact · No in-app account</span>'
        : (p.task_count ? '<span class="ev-muted small">' + p.task_count +
            ' task' + (p.task_count === 1 ? '' : 's') + ' on this event</span>' : '')) +
      (isExternal && p.notes ? '<span class="ev-muted small">' + escapeHtml(p.notes) + '</span>' : '') +
    '</div>' +
    '<div class="ev-person-actions">' + evContactButtons(p, true) +
      (isExternal
        ? '<button type="button" class="ev-contact-btn sm" onclick="evEditExternalPerson(' + p.id + ')" ' +
          'aria-label="Edit ' + escapeHtml(p.name) + '">' + evIcon('pencil') + '<span>Edit</span></button>'
        : '') +
      '<button type="button" class="ev-contact-btn sm danger" onclick="evRemovePerson(' + p.id + ')" ' +
        'aria-label="Remove ' + escapeHtml(p.name) + ' from the team">' +
        evIcon('user-minus') + '<span>Remove</span></button>' +
    '</div></li>';
}

async function evRemovePerson(personId) {
  if (!confirm('Remove this person from the event team?')) return;
  const res = await API.removeEventPerson(personId);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not remove.', 'triangle-alert'); return; }
  showToast('Removed from the team.', 'user-minus');
  await evTabPeople();
}

/* ── Choose a source before searching, so the two flows never mix ── */
function evOpenAddPeople(mode) {
  showModal(
    '<div class="modal-header">' +
      '<h2 class="modal-title">' + evIcon('user-plus') + ' Add people</h2>' +
      '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button>' +
    '</div>' +
    '<p class="ev-help">Choose where this person comes from.</p>' +
    '<div class="ev-sourcechoice">' +
      '<button type="button" class="ev-source" onclick="evOpenPicker(\'people\')">' +
        '<span class="ev-source-icon">' + evIcon('graduation-cap') + '</span>' +
        '<span class="ev-source-text"><strong>Search DIC directory</strong>' +
        '<span>Alumni, staff and students with a DIC account. They can be ' +
        'assigned tasks and receive in-app notifications.</span></span>' +
        evIcon('chevron-right', 'ev-source-chevron') + '</button>' +
      '<button type="button" class="ev-source" onclick="evOpenExternalForm()">' +
        '<span class="ev-source-icon">' + evIcon('user-round') + '</span>' +
        '<span class="ev-source-text"><strong>Add external person</strong>' +
        '<span>A decorator, caterer, photographer or vendor with no DIC ' +
        'account. Contactable by phone and WhatsApp only.</span></span>' +
        evIcon('chevron-right', 'ev-source-chevron') + '</button>' +
    '</div>');
  evRefreshIcons();
}

/* ── External person form ── */
function evOpenExternalForm(person) {
  const p = person || {};
  const isEdit = !!person;
  showModal(
    '<div class="modal-header">' +
      '<h2 class="modal-title">' + evIcon(isEdit ? 'pencil' : 'user-round') + ' ' +
        (isEdit ? 'Edit external contact' : 'Add external person') + '</h2>' +
      '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button>' +
    '</div>' +
    '<p class="ev-callout-plain">' + evIcon('info') +
      ' This person is recorded on this event only. No DIC account is created and they ' +
      'do not appear in the alumni directory.</p>' +
    '<form class="ev-form" onsubmit="evSubmitExternalPerson(event, ' + (isEdit ? p.id : 'null') + ')">' +
      '<div class="ev-field">' +
        '<label class="ev-label" for="ev-x-name">Full name <span class="req">*</span></label>' +
        '<input type="text" id="ev-x-name" class="form-input" required maxlength="150" ' +
          'value="' + escapeHtml(p.name || '') + '" placeholder="Rahim Decorators" /></div>' +

      '<div class="ev-field">' +
        '<label class="ev-label" for="ev-x-role">Role on event <span class="req">*</span></label>' +
        '<input type="text" id="ev-x-role" class="form-input" required maxlength="120" list="ev-x-roles" ' +
          'value="' + escapeHtml(p.role_title || '') + '" placeholder="Event Decorator" />' +
        '<datalist id="ev-x-roles">' +
          EV_EXTERNAL_ROLES.map(function (r) { return '<option value="' + r + '"></option>'; }).join('') +
        '</datalist>' +
        '<span class="ev-help">What they are doing for this event.</span></div>' +

      '<div class="ev-grid2">' +
        '<div class="ev-field"><label class="ev-label" for="ev-x-phone">Phone</label>' +
          '<input type="tel" id="ev-x-phone" class="form-input" maxlength="50" ' +
            'value="' + escapeHtml(p.phone || '') + '" placeholder="01711 223344" />' +
          '<span class="ev-help">Adds a Call button.</span></div>' +
        '<div class="ev-field"><label class="ev-label" for="ev-x-wa">WhatsApp</label>' +
          '<input type="tel" id="ev-x-wa" class="form-input" maxlength="50" ' +
            'value="' + escapeHtml(p.whatsapp || '') + '" placeholder="01711 223344" />' +
          '<span class="ev-help">Adds a WhatsApp button.</span></div>' +
      '</div>' +

      '<div class="ev-grid2">' +
        '<div class="ev-field"><label class="ev-label" for="ev-x-org">Organization / company</label>' +
          '<input type="text" id="ev-x-org" class="form-input" maxlength="150" ' +
            'value="' + escapeHtml(p.organization || '') + '" placeholder="Rahim Decor Ltd" /></div>' +
        '<div class="ev-field"><label class="ev-label" for="ev-x-area">Department / area</label>' +
          '<input type="text" id="ev-x-area" class="form-input" maxlength="150" ' +
            'value="' + escapeHtml(p.department_area || '') + '" placeholder="Stage &amp; decor" /></div>' +
      '</div>' +

      '<div class="ev-field"><label class="ev-label" for="ev-x-notes">Notes</label>' +
        '<textarea id="ev-x-notes" class="form-input" rows="2" maxlength="500" ' +
          'placeholder="Anything the team should know">' + escapeHtml(p.notes || '') + '</textarea></div>' +

      '<p class="ev-inline-error hidden" id="ev-x-error" role="alert"></p>' +
      '<div class="ev-modal-footer">' +
        '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
        '<button type="submit" class="btn btn-primary">' +
          (isEdit ? 'Save changes' : 'Add to event') + '</button>' +
      '</div>' +
    '</form>');
  evRefreshIcons();
}

function evEditExternalPerson(personId) {
  const p = (EV.people || []).find(function (x) { return x.id === personId; });
  if (!p) return;
  evOpenExternalForm({ id: p.id, name: p.name, role_title: p.role_title || p.role_label,
                       phone: p.phone, whatsapp: p.whatsapp, organization: p.organization,
                       department_area: p.dept, notes: p.notes });
}

async function evSubmitExternalPerson(e, personId) {
  if (e) e.preventDefault();
  const err = document.getElementById('ev-x-error');
  const val = function (id) { return document.getElementById(id).value.trim(); };
  const payload = {
    name: val('ev-x-name'), roleTitle: val('ev-x-role'),
    phone: val('ev-x-phone'), whatsapp: val('ev-x-wa'),
    organization: val('ev-x-org'), departmentArea: val('ev-x-area'),
    notes: val('ev-x-notes')
  };
  const fail = function (msg) {
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
    else showToast(msg, 'triangle-alert');
  };
  if (!payload.name) return fail('Please enter the person’s full name.');
  if (!payload.roleTitle) return fail('Please say what their role on this event is.');

  const res = personId
    ? await API.updateExternalPerson(personId, payload)
    : await API.addExternalPerson(EV.event.id, payload);

  if (apiFailed(res)) return fail((res && res.error) || 'Could not save this contact.');

  closeModal();
  showToast(personId ? 'External contact updated.' : payload.name + ' added to the team.', 'user-plus');
  await evTabPeople();
}

/* ══════════════════════════════════════════════════════════
   TAB — REPORTS
   ══════════════════════════════════════════════════════════ */

async function evTabReports() {
  const el = document.getElementById('ev-tab-content');
  const e = EV.event;
  if (!el || !e) return;
  el.innerHTML = renderSkeletonCards(2, 'analytics');

  const results = await Promise.all([
    API.getEventOverview(e.id),
    API.getPlannerAnalytics(e.id)
  ]);
  const o = results[0], a = results[1];
  if (apiFailed(o)) {
    el.innerHTML = renderErrorState('Could not load the report.', 'evTabReports()');
    evRefreshIcons();
    return;
  }
  // Refresh the cached event too: counters move while the workspace is open
  // (a check-in on the Tickets tab, a registration elsewhere), and reading the
  // stale copy made Reports contradict what Tickets had just shown.
  EV.overview = o;
  EV.event = o.event;
  const ev = o.event;
  renderEventContextHeader();

  const fill = ev.capacity ? Math.round(((ev.registered || 0) / ev.capacity) * 100) : 0;
  const spend = apiFailed(a) ? null : a.budget.actual;
  const net = spend === null ? null : o.revenue - spend;

  el.innerHTML =
    '<section class="ev-panel">' +
      '<h2 class="ev-panel-title">Attendance</h2>' +
      '<div class="ev-stats">' +
        evStat('users', (ev.registered || 0).toLocaleString(), 'Registered', 'info') +
        evStat('hourglass', (ev.waitlisted || 0).toLocaleString(), 'Waitlisted') +
        evStat('circle-check-big', (ev.checked_in || 0).toLocaleString(), 'Checked in', 'success') +
        evStat('percent', fill + '%', 'Capacity filled') +
      '</div>' +
    '</section>' +

    '<section class="ev-panel">' +
      '<h2 class="ev-panel-title">Tasks</h2>' +
      '<div class="ev-stats">' +
        evStat('clipboard-list', o.tasks.total, 'Total') +
        evStat('circle-check-big', o.tasks.completed, 'Done', 'success') +
        evStat('octagon-alert', o.tasks.blocked, 'Blocked', o.tasks.blocked ? 'danger' : '') +
        evStat('triangle-alert', o.tasks.overdue, 'Overdue', o.tasks.overdue ? 'danger' : '') +
      '</div>' +
      '<div class="ev-capacity"><div class="ev-capacity-track">' +
        '<div class="ev-capacity-fill" style="width:' + o.tasks.completionRate + '%"></div></div>' +
        '<div class="ev-capacity-meta"><span>Completion</span><span>' + o.tasks.completionRate + '%</span></div></div>' +
    '</section>' +

    '<section class="ev-panel">' +
      '<div class="ev-panel-head"><h2 class="ev-panel-title">Money</h2>' +
        '<div class="ev-panel-actions">' +
          '<a class="btn btn-outline btn-sm" href="' + API.attendeesCsvUrl(ev.id) + '" download>' +
            evIcon('download') + ' Attendees CSV</a>' +
          '<a class="btn btn-outline btn-sm" href="' + API.plannerReportUrl(ev.id, 'full') + '" download>' +
            evIcon('file-text') + ' Full report CSV</a>' +
        '</div></div>' +
      '<div class="ev-stats">' +
        evStat('banknote', evMoney(o.revenue), 'Ticket revenue', 'success') +
        (spend !== null ? evStat('receipt', evMoney(spend), 'Recorded spend') : '') +
        (net !== null ? evStat(net >= 0 ? 'trending-up' : 'trending-down', evMoney(net),
                               'Net', net >= 0 ? 'success' : 'danger') : '') +
      '</div>' +
      (spend === null ? '<p class="ev-muted small">Spend is recorded under Advanced → Budget.</p>' : '') +
    '</section>';
  evRefreshIcons();
}

/* ══════════════════════════════════════════════════════════
   TAB — ADVANCED  (budget, vendors, sponsors, marketing, meetings, risks)
   ══════════════════════════════════════════════════════════ */

const EV_ADVANCED = [
  { key: 'budget',    label: 'Budget',    icon: 'circle-dollar-sign' },
  { key: 'vendors',   label: 'Vendors',   icon: 'store' },
  { key: 'sponsors',  label: 'Sponsors',  icon: 'handshake' },
  { key: 'marketing', label: 'Marketing', icon: 'megaphone' },
  { key: 'meetings',  label: 'Meetings',  icon: 'calendar-check' },
  { key: 'risks',     label: 'Risks',     icon: 'shield-alert' }
];

async function evTabAdvanced() {
  const el = document.getElementById('ev-tab-content');
  if (!el || !EV.event) return;
  el.innerHTML = renderSkeletonCards(2, 'planner');

  const data = await API.getPlannerWorkspace(EV.event.id);
  if (apiFailed(data)) {
    el.innerHTML = renderErrorState(data && data.error ? data.error : 'Could not load the advanced modules.', 'evTabAdvanced()');
    evRefreshIcons();
    return;
  }
  EV.advanced = data;
  evRenderAdvanced();
}

function evSetAdvancedTab(k) { EV.advancedTab = k; evRenderAdvanced(); }

function evRenderAdvanced() {
  const el = document.getElementById('ev-tab-content');
  const d = EV.advanced;
  if (!el || !d) return;

  const nav = '<div class="ev-filters" role="tablist" aria-label="Advanced modules">' +
    EV_ADVANCED.map(function (a) {
      const on = EV.advancedTab === a.key;
      return '<button type="button" class="ev-chip ' + (on ? 'active' : '') + '" role="tab" ' +
        'aria-selected="' + on + '" onclick="evSetAdvancedTab(\'' + a.key + '\')">' +
        evIcon(a.icon) + ' ' + a.label + '</button>';
    }).join('') + '</div>';

  el.innerHTML =
    '<section class="ev-panel">' +
      '<h2 class="ev-panel-title">Advanced</h2>' +
      '<p class="ev-help">Optional modules for larger events. A small event does not need any of these.</p>' +
      nav + '<div id="ev-advanced-body"></div>' +
    '</section>';

  const body = document.getElementById('ev-advanced-body');
  const k = EV.advancedTab;

  if (k === 'budget') {
    const b = d.budgets || [], proc = d.procurement || [];
    const est = b.reduce(function (a, r) { return a + Number(r.estimated_cost || 0); }, 0);
    const act = b.reduce(function (a, r) { return a + Number(r.actual_cost || 0); }, 0);
    const procSpend = proc.reduce(function (a, r) { return a + Number(r.actual_price || 0) * (r.quantity || 1); }, 0);
    body.innerHTML =
      '<div class="ev-stats">' +
        evStat('calculator', evMoney(est), 'Estimated') +
        evStat('receipt', evMoney(act), 'Actual spend') +
        evStat(est - act >= 0 ? 'trending-up' : 'trending-down', evMoney(est - act), 'Remaining',
               est - act >= 0 ? 'success' : 'danger') +
        evStat('shopping-cart', evMoney(procSpend), 'Procurement') +
      '</div>' +
      evAdvToolbar('budgets', 'Budget line') +
      evAdvTable(['Category', 'Vendor', 'Estimated', 'Actual', 'Status', ''], b, function (r) {
        return ['<strong>' + escapeHtml(r.category) + '</strong>', escapeHtml(r.vendor_name || '—'),
                evMoney(r.estimated_cost), evMoney(r.actual_cost),
                '<span class="ev-pill ' + (r.payment_status === 'paid' ? 'success' : 'warn') + '">' +
                  escapeHtml(r.payment_status || '—') + '</span>',
                evAdvDelete('budgets', r.id)];
      }, 'No budget lines yet') +
      '<h3 class="ev-subhead">' + evIcon('shopping-cart') + ' Procurement</h3>' +
      evAdvToolbar('procurement', 'Item') +
      evAdvTable(['Item', 'Category', 'Qty', 'Actual', 'Vendor', 'Status', ''], proc, function (r) {
        return ['<strong>' + escapeHtml(r.item_name) + '</strong>', escapeHtml(r.category || '—'),
                String(r.quantity || 1), evMoney(r.actual_price), escapeHtml(r.vendor_name || '—'),
                '<span class="ev-pill">' + escapeHtml(r.delivery_status || '—') + '</span>',
                evAdvDelete('procurement', r.id)];
      }, 'No procurement items yet');

  } else if (k === 'vendors') {
    const v = d.vendors || [];
    body.innerHTML = evAdvToolbar('vendors', 'Vendor') +
      evAdvTable(['Vendor', 'Category', 'Contact', 'Contract', 'Status', ''], v, function (r) {
        return ['<strong>' + escapeHtml(r.name) + '</strong>', escapeHtml(r.category || '—'),
                escapeHtml(r.contact_person || '—') + (r.phone ? '<br><span class="ev-muted small">' +
                  escapeHtml(r.phone) + '</span>' : ''),
                evMoney(r.contract_value),
                '<span class="ev-pill ' + (r.status === 'paid' ? 'success' : 'warn') + '">' +
                  escapeHtml(r.status || '—') + '</span>',
                evAdvDelete('vendors', r.id)];
      }, 'No vendors yet');

  } else if (k === 'sponsors') {
    const s = d.sponsors || [];
    const secured = s.filter(function (r) { return ['agreed', 'received'].indexOf(r.pipeline_status) !== -1; })
                     .reduce(function (a, r) { return a + Number(r.contribution_amount || 0); }, 0);
    body.innerHTML = '<div class="ev-stats">' +
        evStat('handshake', s.length, 'Sponsors') +
        evStat('banknote', evMoney(secured), 'Secured', 'success') + '</div>' +
      evAdvToolbar('sponsors', 'Sponsor') +
      evAdvTable(['Company', 'Contact', 'Tier', 'Amount', 'Status', ''], s, function (r) {
        return ['<strong>' + escapeHtml(r.company) + '</strong>', escapeHtml(r.contact_person || '—'),
                escapeHtml(r.package_tier || '—'), evMoney(r.contribution_amount),
                '<span class="ev-pill">' + escapeHtml(r.pipeline_status || '—') + '</span>',
                evAdvDelete('sponsors', r.id)];
      }, 'No sponsors yet');

  } else if (k === 'marketing') {
    const m = d.marketing || [];
    body.innerHTML = evAdvToolbar('marketing', 'Campaign') +
      evAdvTable(['Channel', 'Campaign', 'Budget', 'Reach', 'Conversions', 'Status', ''], m, function (r) {
        return [escapeHtml(r.channel), '<strong>' + escapeHtml(r.campaign_name) + '</strong>',
                evMoney(r.budget), Number(r.reach || 0).toLocaleString(),
                Number(r.conversions || 0).toLocaleString(),
                '<span class="ev-pill">' + escapeHtml(r.status || '—') + '</span>',
                evAdvDelete('marketing', r.id)];
      }, 'No campaigns yet');

  } else if (k === 'meetings') {
    const mt = d.meetings || [];
    body.innerHTML = evAdvToolbar('meetings', 'Meeting') +
      evAdvTable(['Meeting', 'Date', 'Location', 'Attendees', 'Status', ''], mt, function (r) {
        return ['<strong>' + escapeHtml(r.title) + '</strong>', escapeHtml(evDate(r.meeting_date)),
                escapeHtml(r.location || '—'), escapeHtml(r.attendees || '—'),
                '<span class="ev-pill">' + escapeHtml(r.status || '—') + '</span>',
                evAdvDelete('meetings', r.id)];
      }, 'No meetings scheduled');

  } else if (k === 'risks') {
    const r = d.risks || [];
    body.innerHTML = evAdvToolbar('risks', 'Risk') +
      evAdvTable(['Risk', 'Category', 'Severity', 'Contingency', ''], r, function (x) {
        return ['<strong>' + escapeHtml(x.risk_title) + '</strong>', escapeHtml(x.category || '—'),
                '<span class="ev-pill ' + (x.severity === 'high' ? 'danger' : 'warn') + '">' +
                  escapeHtml(x.severity) + '</span>',
                escapeHtml(x.contingency_plan || '—'), evAdvDelete('risks', x.id)];
      }, 'No risks recorded');
  }
  evRefreshIcons();
}

function evAdvToolbar(kind, label) {
  return '<div class="ev-panel-actions right"><button class="btn btn-outline btn-sm" ' +
    'onclick="showPlannerItemModal(\'' + kind + '\')">' + evIcon('plus') + ' Add ' + label + '</button></div>';
}
function evAdvDelete(kind, id) {
  return '<button type="button" class="ev-icon-btn danger" onclick="deletePlannerItem(\'' + kind + '\', ' + id + ')" ' +
    'aria-label="Delete">' + evIcon('trash-2') + '</button>';
}
function evAdvTable(cols, rows, rowFn, emptyText) {
  if (!rows.length) return '<p class="ev-muted">' + escapeHtml(emptyText) + '</p>';
  return '<div class="ev-table" style="--ev-cols:' + cols.length + '">' +
    '<div class="ev-table-head">' + cols.map(function (c) { return '<div>' + escapeHtml(c) + '</div>'; }).join('') + '</div>' +
    rows.map(function (r) {
      return '<div class="ev-table-row">' + rowFn(r).map(function (cell, i) {
        return '<div data-label="' + escapeHtml(cols[i]) + '">' + cell + '</div>';
      }).join('') + '</div>';
    }).join('') + '</div>';
}

/* ══════════════════════════════════════════════════════════
   CREATION WIZARD — Basics → Tickets → Review
   ══════════════════════════════════════════════════════════ */

function openEventWizard() {
  if (!evCanManage()) { showToast('Only organisers can create events.', 'lock'); return; }
  EV.wizard = {
    step: 1,
    basics: {
      title: '', description: '', eventType: 'Reunion', startsOn: '', startTime: '', endTime: '',
      venue: '', organizerDepartment: (state.currentUser && state.currentUser.dept) || '',
      visibility: 'alumni', capacity: 100
    },
    tickets: { isPaid: false, waitlistEnabled: true,
               opensDate: '', opensTime: '', closesDate: '', closesTime: '',
               types: [{ name: 'Alumni', price: 500, quota: '' }] },
    error: ''
  };
  evRenderWizard();
}

const EV_WIZARD_STEPS = ['Event basics', 'Tickets & Registration', 'Review & Create'];

function evWizardStepper(step) {
  // Desktop shows all three labels in full — nothing is ellipsised. Narrow
  // screens drop to "Step n of 3" plus the current label, which is readable
  // where three labels side by side would not be.
  return '<ol class="ev-stepper" aria-label="Progress">' +
    EV_WIZARD_STEPS.map(function (label, i) {
      const n = i + 1;
      const cls = n === step ? 'current' : (n < step ? 'done' : '');
      return '<li class="' + cls + '" ' + (n === step ? 'aria-current="step"' : '') + '>' +
        '<span class="ev-stepper-num">' + (n < step ? evIcon('check') : n) + '</span>' +
        '<span class="ev-stepper-label">' + label + '</span></li>';
    }).join('') + '</ol>' +
    '<p class="ev-stepper-compact" aria-hidden="true">' +
      '<span class="ev-stepper-count">Step ' + step + ' of 3</span>' +
      '<span class="ev-stepper-current">' + EV_WIZARD_STEPS[step - 1] + '</span></p>';
}

function evRenderWizard() {
  const w = EV.wizard;
  if (!w) return;
  let bodyHtml = '';
  if (w.step === 1) bodyHtml = evWizardStep1();
  else if (w.step === 2) bodyHtml = evWizardStep2();
  else bodyHtml = evWizardStep3();

  showModal(
    '<div class="modal-header">' +
      '<h2 class="modal-title">' + evIcon('calendar-plus') + ' New event</h2>' +
      '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button>' +
    '</div>' +
    evWizardStepper(w.step) +
    (w.error ? '<p class="ev-banner danger" role="alert">' + evIcon('triangle-alert') + ' ' + escapeHtml(w.error) + '</p>' : '') +
    '<div class="ev-wizard-body">' + bodyHtml + '</div>',
    { wide: true });
  evRefreshIcons();
}

function evWizardStep1() {
  const b = EV.wizard.basics;
  return '<div class="ev-form">' +
    '<div class="ev-field"><label class="ev-label" for="ev-w-title">Event title <span class="req">*</span></label>' +
      '<input type="text" id="ev-w-title" class="form-input" maxlength="200" required ' +
      'value="' + escapeHtml(b.title) + '" placeholder="DIC Annual Alumni Reunion 2026" />' +
      '<span class="ev-help">The name alumni will see.</span></div>' +

    '<div class="ev-field"><label class="ev-label" for="ev-w-desc">Description</label>' +
      '<textarea id="ev-w-desc" class="form-input" rows="3" maxlength="2000" ' +
      'placeholder="What the event is, who it is for, what to expect">' + escapeHtml(b.description) + '</textarea></div>' +

    '<div class="ev-grid2">' +
      '<div class="ev-field"><label class="ev-label" for="ev-w-type">Event type <span class="req">*</span></label>' +
        '<select id="ev-w-type" class="form-select">' + EV_TYPES.map(function (t) {
          return '<option value="' + t + '"' + (b.eventType === t ? ' selected' : '') + '>' + t + '</option>';
        }).join('') + '</select>' +
        '<span class="ev-help">Chooses the icon shown on the event card.</span></div>' +
      '<div class="ev-field"><label class="ev-label" for="ev-w-date">Date <span class="req">*</span></label>' +
        '<input type="date" id="ev-w-date" class="form-input" required value="' + escapeHtml(b.startsOn) + '" /></div>' +
    '</div>' +

    '<div class="ev-grid2">' +
      '<div class="ev-field"><label class="ev-label" for="ev-w-start">Start time</label>' +
        '<input type="time" id="ev-w-start" class="form-input" value="' + escapeHtml(b.startTime) + '" /></div>' +
      '<div class="ev-field"><label class="ev-label" for="ev-w-end">End time</label>' +
        '<input type="time" id="ev-w-end" class="form-input" value="' + escapeHtml(b.endTime) + '" /></div>' +
    '</div>' +

    '<div class="ev-field"><label class="ev-label" for="ev-w-venue">Venue <span class="req">*</span></label>' +
      '<input type="text" id="ev-w-venue" class="form-input" required maxlength="200" ' +
      'value="' + escapeHtml(b.venue) + '" placeholder="DIC Main Campus Auditorium" /></div>' +

    '<div class="ev-grid2">' +
      '<div class="ev-field"><label class="ev-label" for="ev-w-org">Organiser / department</label>' +
        '<input type="text" id="ev-w-org" class="form-input" maxlength="150" ' +
        'value="' + escapeHtml(b.organizerDepartment) + '" placeholder="DIC Alumni Relations" /></div>' +
      '<div class="ev-field"><label class="ev-label" for="ev-w-cap">Total capacity</label>' +
        '<input type="number" id="ev-w-cap" class="form-input" min="1" value="' + (b.capacity || 100) + '" />' +
        '<span class="ev-help">Total seats. Ticket quotas can be set on the next step.</span></div>' +
    '</div>' +

    '<fieldset class="ev-field ev-fieldset">' +
      '<legend class="ev-label">Who can see this event</legend>' +
      evRadioCard('ev-w-vis', 'visibility', 'public', 'Public', 'Anyone can see it', b.visibility === 'public') +
      evRadioCard('ev-w-vis', 'visibility', 'alumni', 'Alumni only', 'Signed-in alumni only', b.visibility === 'alumni') +
      evRadioCard('ev-w-vis', 'visibility', 'invite', 'Invite only', 'Hidden from the public list', b.visibility === 'invite') +
    '</fieldset>' +

    '<div class="ev-modal-footer">' +
      '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
      '<button type="button" class="btn btn-primary" onclick="evWizardNext()">Next: Tickets ' + evIcon('arrow-right') + '</button>' +
    '</div></div>';
}

function evRadioCard(idBase, name, value, label, help, checked) {
  const id = idBase + '-' + value;
  return '<label class="ev-radio" for="' + id + '">' +
    '<input type="radio" id="' + id + '" name="' + name + '" value="' + value + '"' + (checked ? ' checked' : '') + ' />' +
    '<span><strong>' + label + '</strong><span>' + help + '</span></span></label>';
}

function evWizardStep2() {
  const t = EV.wizard.tickets;
  return '<div class="ev-form">' +
    '<fieldset class="ev-field ev-fieldset">' +
      '<legend class="ev-label">Registration</legend>' +
      '<label class="ev-radio" for="ev-w-free"><input type="radio" id="ev-w-free" name="paid" value="free"' +
        (t.isPaid ? '' : ' checked') + ' onchange="evWizardSetPaid(false)" />' +
        '<span><strong>Free</strong><span>Alumni register at no cost</span></span></label>' +
      '<label class="ev-radio" for="ev-w-paid"><input type="radio" id="ev-w-paid" name="paid" value="paid"' +
        (t.isPaid ? ' checked' : '') + ' onchange="evWizardSetPaid(true)" />' +
        '<span><strong>Paid</strong><span>One or more ticket types with prices</span></span></label>' +
    '</fieldset>' +

    (t.isPaid
      ? '<div class="ev-field"><div class="ev-field-head"><span class="ev-label">Ticket types</span>' +
          '<button type="button" class="btn btn-ghost btn-sm" onclick="evWizardAddType()">' +
            evIcon('plus') + ' Add type</button></div>' +
        '<div class="ev-tickettypes">' +
          '<div class="ev-tt-head"><span>Name</span><span>Price (৳)</span><span>Quota</span><span></span></div>' +
          t.types.map(function (row, i) {
            return '<div class="ev-tt-row">' +
              evWizTicketCell(i, 'n', 'Ticket name', 'text', row.name, 'name', 'Alumni') +
              evWizTicketCell(i, 'p', 'Price', 'number', row.price, 'price', '0') +
              evWizTicketCell(i, 'q', 'Quota', 'number', row.quota, 'quota', 'No limit') +
              (t.types.length > 1
                ? '<button type="button" class="ev-icon-btn danger" onclick="evWizardRemoveType(' + i + ')" ' +
                  'aria-label="Remove ticket type">' + evIcon('x') + '</button>'
                : '<span></span>') +
            '</div>'; }).join('') +
        '</div>' +
        '<span class="ev-help">Leave a quota blank for no per-type limit. Quotas are enforced on top of total capacity.</span></div>'
      : '<p class="ev-callout-plain">' + evIcon('info') +
        ' Everyone gets one free ticket, limited by the total capacity you set on the previous step.</p>') +

    '<fieldset class="ev-field ev-fieldset ev-regwindow">' +
      '<legend class="ev-label">Registration window</legend>' +
      '<div class="ev-regrow">' +
        '<span class="ev-reglabel" id="ev-reg-open-lbl">Registration opens</span>' +
        '<div class="ev-regpair" role="group" aria-labelledby="ev-reg-open-lbl">' +
          '<div class="ev-regcell">' +
            '<label class="ev-sublabel" for="ev-w-open-date">Date</label>' +
            '<input type="date" id="ev-w-open-date" class="form-input" value="' + escapeHtml(t.opensDate) + '" ' +
              'oninput="evWizardWindowChanged()" />' +
          '</div>' +
          '<div class="ev-regcell">' +
            '<label class="ev-sublabel" for="ev-w-open-time">Time</label>' +
            '<input type="time" id="ev-w-open-time" class="form-input" value="' + escapeHtml(t.opensTime) + '" ' +
              'oninput="evWizardWindowChanged()" />' +
          '</div>' +
        '</div>' +
        '<span class="ev-help">Optional — leave blank to open registration immediately.</span>' +
      '</div>' +

      '<div class="ev-regrow">' +
        '<span class="ev-reglabel" id="ev-reg-close-lbl">Registration closes</span>' +
        '<div class="ev-regpair" role="group" aria-labelledby="ev-reg-close-lbl">' +
          '<div class="ev-regcell">' +
            '<label class="ev-sublabel" for="ev-w-close-date">Date</label>' +
            '<input type="date" id="ev-w-close-date" class="form-input" value="' + escapeHtml(t.closesDate) + '" ' +
              'oninput="evWizardWindowChanged()" />' +
          '</div>' +
          '<div class="ev-regcell">' +
            '<label class="ev-sublabel" for="ev-w-close-time">Time</label>' +
            '<input type="time" id="ev-w-close-time" class="form-input" value="' + escapeHtml(t.closesTime) + '" ' +
              'oninput="evWizardWindowChanged()" />' +
          '</div>' +
        '</div>' +
        '<span class="ev-help">Optional — leave blank to keep registration open.</span>' +
      '</div>' +
      '<p class="ev-inline-error hidden" id="ev-reg-error" role="alert"></p>' +
    '</fieldset>' +

    '<label class="ev-switch" for="ev-w-wait">' +
      '<input type="checkbox" id="ev-w-wait"' + (t.waitlistEnabled ? ' checked' : '') + ' />' +
      '<span><strong>Keep a waitlist when the event is full</strong>' +
      '<span>People are promoted automatically when someone cancels.</span></span></label>' +

    '<div class="ev-modal-footer">' +
      '<button type="button" class="btn btn-outline" onclick="evWizardBack()">' + evIcon('arrow-left') + ' Back</button>' +
      '<button type="button" class="btn btn-primary" onclick="evWizardNext()">Next: Review ' + evIcon('arrow-right') + '</button>' +
    '</div></div>';
}

// One labelled field in a ticket-type row. The .ev-tt-head row supplies the
// column names on wide screens; once the grid stacks those disappear, so each
// input keeps its own label rather than leaving a bare "500" next to "150".
function evWizTicketCell(i, slot, label, type, value, key, placeholder) {
  const id = 'ev-tt-' + slot + '-' + i;
  return '<div class="ev-tt-cell">' +
    '<label class="ev-tt-label" for="' + id + '">' + label + '</label>' +
    '<input type="' + type + '" id="' + id + '" class="form-input"' +
      (type === 'number' ? ' min="0"' : '') +
      ' placeholder="' + placeholder + '"' +
      ' value="' + escapeHtml(String(value == null ? '' : value)) + '"' +
      ' oninput="evWizardType(' + i + ', \'' + key + '\', this.value)" /></div>';
}

/* A date with no time is ambiguous, so an opening date defaults to the start
   of that day and a closing date to the end of it — which is what an organiser
   means by "closes on the 10th". Returns null when no date was given. */
function evRegInstant(date, time, fallbackTime) {
  if (!date) return null;
  return date + 'T' + (time && time.length >= 4 ? time : fallbackTime);
}

function evRegWindowError(t) {
  if (t.opensTime && !t.opensDate) return 'Registration opens: please choose a date, or clear the time.';
  if (t.closesTime && !t.closesDate) return 'Registration closes: please choose a date, or clear the time.';
  const open = evRegInstant(t.opensDate, t.opensTime, '00:00');
  const close = evRegInstant(t.closesDate, t.closesTime, '23:59');
  if (open && close && close <= open) {
    return 'Registration must close after it opens.';
  }
  return '';
}

function evRegWindowSummary(t) {
  const open = evRegInstant(t.opensDate, t.opensTime, '00:00');
  const close = evRegInstant(t.closesDate, t.closesTime, '23:59');
  const fmt = function (iso) {
    const parts = String(iso).split('T');
    return evDate(parts[0]) + (parts[1] ? ' at ' + evTime(parts[1]) : '');
  };
  if (!open && !close) return 'Opens immediately · no closing date';
  if (open && !close) return 'Opens ' + fmt(open) + ' · no closing date';
  if (!open && close) return 'Opens immediately · closes ' + fmt(close);
  return 'Opens ' + fmt(open) + ' · closes ' + fmt(close);
}

/* Inline validation as the organiser types, so the problem is shown next to
   the fields rather than only when Next is pressed. */
function evWizardWindowChanged() {
  const w = EV.wizard;
  if (!w) return;
  evWizardCapture();
  const box = document.getElementById('ev-reg-error');
  if (!box) return;
  const msg = evRegWindowError(w.tickets);
  box.textContent = msg;
  box.classList.toggle('hidden', !msg);
}

function evWizardSetPaid(paid) {
  evWizardCapture();
  EV.wizard.tickets.isPaid = paid;
  evRenderWizard();
}
function evWizardType(i, field, value) {
  EV.wizard.tickets.types[i][field] = value;
}
function evWizardAddType() {
  evWizardCapture();
  EV.wizard.tickets.types.push({ name: '', price: 0, quota: '' });
  evRenderWizard();
}
function evWizardRemoveType(i) {
  evWizardCapture();
  EV.wizard.tickets.types.splice(i, 1);
  evRenderWizard();
}

function evWizardStep3() {
  const w = EV.wizard, b = w.basics, t = w.tickets;
  const u = state.currentUser || {};
  const needsApproval = !evIsAdmin();
  const quotaSum = t.isPaid
    ? t.types.reduce(function (a, r) { return a + (parseInt(r.quota, 10) || 0); }, 0) : 0;
  const capacity = parseInt(b.capacity, 10) || quotaSum || 100;

  const row = function (label, value) {
    return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>';
  };

  return '<div class="ev-review">' +
    '<div class="ev-review-head">' +
      '<span class="ev-card-icon">' + evIcon(evTypeIcon(b.eventType)) + '</span>' +
      '<div><h3>' + escapeHtml(b.title) + '</h3>' +
      '<p>' + escapeHtml(b.eventType) + ' · ' + (t.isPaid ? 'Paid' : 'Free') + '</p></div>' +
    '</div>' +
    (b.description ? '<p class="ev-prose">' + escapeHtml(b.description) + '</p>' : '') +
    '<dl class="ev-deflist">' +
      row('Date', escapeHtml(evDate(b.startsOn))) +
      row('Time', escapeHtml(
        b.startTime ? evTime(b.startTime) + (b.endTime ? ' – ' + evTime(b.endTime) : '') : 'Not set')) +
      row('Venue', escapeHtml(b.venue)) +
      row('Capacity', capacity.toLocaleString() + ' seats') +
      row('Organiser', b.organizerDepartment ? escapeHtml(b.organizerDepartment)
                                             : '<span class="ev-notset">Not set</span>') +
      row('Visibility', b.visibility === 'public' ? 'Public'
                      : b.visibility === 'invite' ? 'Invite only' : 'Alumni only') +
      row('Registration', escapeHtml(evRegWindowSummary(t))) +
      row('Waitlist', t.waitlistEnabled ? 'Enabled' : 'Off') +
    '</dl>' +

    '<h4 class="ev-subhead">' + evIcon('ticket') + ' Tickets</h4>' +
    (t.isPaid
      ? '<ul class="ev-review-tickets">' + t.types.map(function (r) {
          return '<li><strong>' + escapeHtml(r.name || 'Unnamed') + '</strong>' +
            '<span>' + evMoney(r.price) + '</span>' +
            '<span>' + (r.quota === '' || r.quota == null ? 'No limit' : r.quota + ' available') + '</span></li>';
        }).join('') + '</ul>'
      : '<p class="ev-muted">One free ticket per person, limited to ' + capacity.toLocaleString() + ' seats.</p>') +

    '<div class="ev-createdby">' +
      evIcon('user-round-pen') +
      '<div><span class="ev-label">Created by</span>' +
        '<strong>' + escapeHtml(u.name || 'You') + '</strong>' +
        '<span>' + escapeHtml(u.roleLabel || u.role || '') + ' · ' +
          escapeHtml(evDate(new Date().toISOString())) + '</span></div>' +
    '</div>' +

    '<p class="ev-banner ' + (needsApproval ? 'warn' : 'success') + '">' +
      evIcon(needsApproval ? 'clock' : 'circle-check-big') + ' ' +
      (needsApproval
        ? 'This event will be submitted for approval.'
        : 'This event will be published immediately.') + '</p>' +

    '<div class="ev-modal-footer">' +
      '<button type="button" class="btn btn-outline" onclick="evWizardBack()">' + evIcon('arrow-left') + ' Back</button>' +
      '<button type="button" class="btn btn-primary" id="ev-w-submit" onclick="evWizardSubmit()">Create event</button>' +
    '</div></div>';
}

// Reads whatever is on screen back into wizard state before re-rendering.
function evWizardCapture() {
  const w = EV.wizard;
  if (!w) return;
  const val = function (id) { const el = document.getElementById(id); return el ? el.value : undefined; };

  if (w.step === 1) {
    const b = w.basics;
    if (val('ev-w-title') !== undefined) {
      b.title = val('ev-w-title').trim();
      b.description = val('ev-w-desc').trim();
      b.eventType = val('ev-w-type');
      b.startsOn = val('ev-w-date');
      b.startTime = val('ev-w-start');
      b.endTime = val('ev-w-end');
      b.venue = val('ev-w-venue').trim();
      b.organizerDepartment = val('ev-w-org').trim();
      b.capacity = val('ev-w-cap');
      const vis = document.querySelector('input[name="visibility"]:checked');
      if (vis) b.visibility = vis.value;
    }
  } else if (w.step === 2) {
    const t = w.tickets;
    if (val('ev-w-open-date') !== undefined) {
      t.opensDate = val('ev-w-open-date');
      t.opensTime = val('ev-w-open-time');
      t.closesDate = val('ev-w-close-date');
      t.closesTime = val('ev-w-close-time');
      const wait = document.getElementById('ev-w-wait');
      if (wait) t.waitlistEnabled = wait.checked;
    }
  }
}

function evWizardBack() {
  evWizardCapture();
  EV.wizard.error = '';
  EV.wizard.step = Math.max(1, EV.wizard.step - 1);
  evRenderWizard();
}

function evWizardNext() {
  evWizardCapture();
  const w = EV.wizard;
  w.error = '';

  if (w.step === 1) {
    const b = w.basics;
    if (!b.title) w.error = 'Please give the event a title.';
    else if (!b.startsOn) w.error = 'Please choose the event date.';
    else if (!b.venue) w.error = 'Please enter the venue.';
    else if (b.startTime && b.endTime && b.endTime <= b.startTime)
      w.error = 'The end time must be after the start time.';
    if (w.error) { evRenderWizard(); return; }
  }

  if (w.step === 2) {
    if (w.tickets.isPaid) {
      const bad = w.tickets.types.find(function (r) { return !String(r.name || '').trim(); });
      if (bad) { w.error = 'Every ticket type needs a name.'; evRenderWizard(); return; }
    }
    const windowError = evRegWindowError(w.tickets);
    if (windowError) { w.error = windowError; evRenderWizard(); return; }
  }

  w.step = Math.min(3, w.step + 1);
  evRenderWizard();
}

async function evWizardSubmit() {
  const w = EV.wizard;
  if (!w) return;
  const btn = document.getElementById('ev-w-submit');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  const b = w.basics, t = w.tickets;
  const payload = {
    title: b.title, description: b.description || null, eventType: b.eventType,
    startsOn: b.startsOn, startTime: b.startTime || null, endTime: b.endTime || null,
    venue: b.venue, capacity: parseInt(b.capacity, 10) || null,
    organizerDepartment: b.organizerDepartment || null, visibility: b.visibility,
    isPaid: t.isPaid, waitlistEnabled: t.waitlistEnabled,
    registrationOpensAt: evRegInstant(t.opensDate, t.opensTime, '00:00'),
    registrationClosesAt: evRegInstant(t.closesDate, t.closesTime, '23:59'),
    ticketTypes: t.isPaid
      ? t.types.map(function (r) {
          return { name: String(r.name).trim(), price: Number(r.price) || 0,
                   quota: r.quota === '' || r.quota == null ? null : Number(r.quota) };
        })
      : []
  };

  const res = await API.createEvent(payload);
  if (apiFailed(res)) {
    w.error = (res && res.error) || 'Could not create the event.';
    evRenderWizard();
    return;
  }

  closeModal();
  EV.wizard = null;
  showToast(res.approval_status === 'pending_approval'
    ? '"' + res.title + '" submitted for approval.'
    : '"' + res.title + '" created and published.', 'circle-check-big');
  await openEventWorkspace(res.id, 'overview');
}

/* ══════════════════════════════════════════════════════════
   EVENT ACTIONS
   ══════════════════════════════════════════════════════════ */

function evEditEvent() {
  const e = EV.event;
  if (!e) return;
  showModal('<div class="modal-header"><h2 class="modal-title">' + evIcon('pencil') + ' Edit event</h2>' +
    '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button></div>' +
    '<form class="ev-form" onsubmit="evSubmitEditEvent(event)">' +
      '<div class="ev-field"><label class="ev-label" for="ev-e-title">Title <span class="req">*</span></label>' +
        '<input type="text" id="ev-e-title" class="form-input" required value="' + escapeHtml(e.title) + '" /></div>' +
      '<div class="ev-field"><label class="ev-label" for="ev-e-desc">Description</label>' +
        '<textarea id="ev-e-desc" class="form-input" rows="3">' + escapeHtml(e.description || '') + '</textarea></div>' +
      '<div class="ev-grid2">' +
        '<div class="ev-field"><label class="ev-label" for="ev-e-type">Type</label>' +
          '<select id="ev-e-type" class="form-select">' + EV_TYPES.map(function (t) {
            return '<option value="' + t + '"' + (e.event_type === t ? ' selected' : '') + '>' + t + '</option>';
          }).join('') + '</select></div>' +
        '<div class="ev-field"><label class="ev-label" for="ev-e-date">Date <span class="req">*</span></label>' +
          '<input type="date" id="ev-e-date" class="form-input" required value="' + evDateInput(e.starts_on) + '" /></div>' +
      '</div>' +
      '<div class="ev-grid2">' +
        '<div class="ev-field"><label class="ev-label" for="ev-e-start">Start time</label>' +
          '<input type="time" id="ev-e-start" class="form-input" value="' + evTimeInput(e.start_time) + '" /></div>' +
        '<div class="ev-field"><label class="ev-label" for="ev-e-end">End time</label>' +
          '<input type="time" id="ev-e-end" class="form-input" value="' + evTimeInput(e.end_time) + '" /></div>' +
      '</div>' +
      '<div class="ev-field"><label class="ev-label" for="ev-e-venue">Venue <span class="req">*</span></label>' +
        '<input type="text" id="ev-e-venue" class="form-input" required value="' + escapeHtml(e.venue) + '" /></div>' +
      '<div class="ev-grid2">' +
        '<div class="ev-field"><label class="ev-label" for="ev-e-cap">Capacity</label>' +
          '<input type="number" id="ev-e-cap" class="form-input" min="1" value="' + (e.capacity || 0) + '" /></div>' +
        '<div class="ev-field"><label class="ev-label" for="ev-e-org">Organiser</label>' +
          '<input type="text" id="ev-e-org" class="form-input" value="' + escapeHtml(e.organizer_department || '') + '" /></div>' +
      '</div>' +
      '<div class="ev-field"><label class="ev-label" for="ev-e-vis">Visibility</label>' +
        '<select id="ev-e-vis" class="form-select">' +
          '<option value="public"' + (e.visibility === 'public' ? ' selected' : '') + '>Public</option>' +
          '<option value="alumni"' + (e.visibility === 'alumni' ? ' selected' : '') + '>Alumni only</option>' +
          '<option value="invite"' + (e.visibility === 'invite' ? ' selected' : '') + '>Invite only</option>' +
        '</select></div>' +
      '<div class="ev-modal-footer">' +
        '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>' +
        '<button type="submit" class="btn btn-primary">Save changes</button></div>' +
    '</form>');
  evRefreshIcons();
}

async function evSubmitEditEvent(e) {
  if (e) e.preventDefault();
  const payload = {
    title: document.getElementById('ev-e-title').value.trim(),
    description: document.getElementById('ev-e-desc').value.trim(),
    eventType: document.getElementById('ev-e-type').value,
    startsOn: document.getElementById('ev-e-date').value,
    startTime: document.getElementById('ev-e-start').value || null,
    endTime: document.getElementById('ev-e-end').value || null,
    venue: document.getElementById('ev-e-venue').value.trim(),
    capacity: parseInt(document.getElementById('ev-e-cap').value, 10) || null,
    organizerDepartment: document.getElementById('ev-e-org').value.trim(),
    visibility: document.getElementById('ev-e-vis').value
  };
  const res = await API.updateEvent(EV.event.id, payload);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not save.', 'triangle-alert'); return; }
  closeModal();
  showToast('Event updated.', 'circle-check-big');
  await evReloadWorkspace();
}

async function evApprove(id) {
  const res = await API.approveEvent(id);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not approve.', 'triangle-alert'); return; }
  showToast('Event approved and published.', 'circle-check-big');
  if (EV.event && EV.event.id === id) await evReloadWorkspace(); else await loadEventList();
}

async function evReject(id) {
  const reason = prompt('Why is this event being sent back? The organiser will see this.');
  if (reason === null) return;
  if (!reason.trim()) { showToast('A reason is required.', 'triangle-alert'); return; }
  const res = await API.rejectEvent(id, reason.trim());
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not send back.', 'triangle-alert'); return; }
  showToast('Sent back to the organiser.', 'undo-2');
  if (EV.event && EV.event.id === id) await evReloadWorkspace(); else await loadEventList();
}

async function evCancelEvent() {
  const e = EV.event;
  if (!e) return;
  const reason = prompt('Why is "' + e.title + '" being cancelled? Everyone holding a ticket will be told.');
  if (reason === null) return;
  if (!reason.trim()) { showToast('A reason is required.', 'triangle-alert'); return; }
  const res = await API.cancelEvent(e.id, reason.trim());
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not cancel.', 'triangle-alert'); return; }
  showToast('Event cancelled and ticket holders notified.', 'calendar-x');
  await evReloadWorkspace();
}

function evPreviewPublic() {
  const e = EV.event;
  if (!e) return;
  const reg = e.registered || 0;
  const full = e.capacity ? reg >= e.capacity : false;
  showModal(
    '<div class="modal-header"><h2 class="modal-title">' + evIcon('eye') + ' Public preview</h2>' +
      '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button></div>' +
    '<p class="ev-help">This is how the event appears to alumni.</p>' +
    '<div class="ev-preview">' + evPublicCard(Object.assign({}, e, { is_registered: false })) + '</div>' +
    (e.visibility === 'invite'
      ? '<p class="ev-banner warn">' + evIcon('eye-off') +
        ' This event is invite only, so it does not appear in the public list.</p>' : '') +
    (e.approval_status !== 'approved'
      ? '<p class="ev-banner warn">' + evIcon('clock') +
        ' Not approved yet, so alumni cannot see it.</p>' : ''),
    { dismissable: true });
  evRefreshIcons();
}

/* ══════════════════════════════════════════════════════════
   ALUMNI-FACING TICKET ACTIONS
   ══════════════════════════════════════════════════════════ */

async function evRegister(eventId) {
  const e = EV.list.find(function (x) { return x.id === eventId; });
  const types = e && e.is_paid ? await API.getTicketTypes(eventId) : null;

  if (types && !apiFailed(types) && types.length > 1) {
    showModal('<div class="modal-header"><h2 class="modal-title">' + evIcon('ticket') + ' Choose a ticket</h2>' +
      '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button></div>' +
      '<div class="ev-ticketchoices">' + types.map(function (t) {
        const left = t.quota == null ? null : Math.max(0, t.quota - t.sold);
        const soldOut = left === 0;
        return '<button type="button" class="ev-ticketchoice" ' + (soldOut ? 'disabled' : '') + ' ' +
          'onclick="evDoRegister(' + eventId + ',' + t.id + ')">' +
          '<span class="ev-ticketchoice-name"><strong>' + escapeHtml(t.name) + '</strong>' +
          '<span>' + (left == null ? 'No limit' : (soldOut ? 'Sold out' : left + ' left')) + '</span></span>' +
          '<span class="ev-ticketchoice-price">' + (Number(t.price) > 0 ? evMoney(t.price) : 'Free') + '</span>' +
          '</button>'; }).join('') + '</div>');
    evRefreshIcons();
    return;
  }
  await evDoRegister(eventId, types && !apiFailed(types) && types[0] ? types[0].id : null);
}

async function evDoRegister(eventId, ticketTypeId) {
  const body = { clientMutationId: 'reg-' + eventId + '-' + (state.currentUser ? state.currentUser.id : 0) + '-' + Date.now() };
  if (ticketTypeId) body.ticketTypeId = ticketTypeId;

  const res = await API.registerForEvent(eventId, body);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Registration failed.', 'triangle-alert'); return; }
  closeModal();
  showToast(res.status === 'waitlisted'
    ? 'That event is full — you are on the waitlist.'
    : 'Ticket confirmed for "' + res.event + '".', res.status === 'waitlisted' ? 'hourglass' : 'ticket-check');
  await loadEventList();
  if (typeof renderNotifications === 'function') renderNotifications();
  if (res.status === 'confirmed') evViewTicket(eventId);
}

async function evCancelTicket(eventId) {
  if (!confirm('Cancel your ticket for this event?')) return;
  const res = await API.cancelRegistration(eventId);
  if (apiFailed(res)) { showToast(res && res.error ? res.error : 'Could not cancel.', 'triangle-alert'); return; }
  showToast(res.promoted ? 'Ticket cancelled — a waitlisted alumnus was promoted.' : 'Ticket cancelled.', 'circle-check-big');
  await loadEventList();
}

async function evViewTicket(eventId) {
  const t = await API.getMyTicket(eventId);
  if (apiFailed(t) || !t) { showToast('No ticket found for this event.', 'triangle-alert'); return; }

  showModal('<div class="modal-header"><h2 class="modal-title">' + evIcon('ticket') + ' Your ticket</h2>' +
    '<button type="button" class="modal-close" aria-label="Close">' + evIcon('x') + '</button></div>' +
    '<div class="ev-ticket">' +
      '<div class="ev-ticket-event">' +
        '<strong>' + escapeHtml(t.event_title || '') + '</strong>' +
        '<span>' + escapeHtml(evDate(t.starts_on)) +
          (t.start_time ? ' · ' + escapeHtml(evTime(t.start_time)) : '') + '</span>' +
        '<span>' + escapeHtml(t.venue || '') + '</span>' +
      '</div>' +
      '<div id="ev-ticket-qr" class="ev-ticket-qr"></div>' +
      '<p class="ev-ticket-code">' + escapeHtml(t.ticket_code) + '</p>' +
      '<p class="ev-ticket-status">' +
        (t.status === 'waitlisted'
          ? evIcon('hourglass') + ' Waitlisted — you will be told if a seat opens'
          : evIcon('circle-check-big') + ' Confirmed') +
        (t.ticket_type_name ? ' · ' + escapeHtml(t.ticket_type_name) : '') +
        (t.checked_in ? ' · ' + evIcon('check') + ' Checked in' : '') + '</p>' +
      (Number(t.amount_paid) > 0
        ? '<p class="ev-muted small">Paid ' + evMoney(t.amount_paid) + '</p>' : '') +
      '<p class="ev-help">Show this QR code at the entrance.</p>' +
    '</div>', { dismissable: true });
  evRefreshIcons();

  const holder = document.getElementById('ev-ticket-qr');
  if (holder && typeof QRCode !== 'undefined') {
    try {
      new QRCode(holder, { text: t.qr_payload, width: 176, height: 176,
                           colorDark: '#0B3897', colorLight: '#ffffff' });
    } catch (err) {
      holder.innerHTML = '<p class="ev-muted small">QR code unavailable — use the code below.</p>';
    }
  } else if (holder) {
    holder.innerHTML = '<p class="ev-muted small">QR code unavailable — use the code below.</p>';
  }
}
