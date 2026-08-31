/*
 * auth.js — extracted verbatim from the original app.js, lines 134-364.
 *
 * Authentication and demo login: login submit/error/busy handlers, role
 * login/switching, session bootstrap, sidebar nav rendering, the multi-step
 * login flow, logout, and theme toggle. (Sign-up and change-password live
 * separately in core/auth-signup.js — see app.js:6139-6253.)
 */

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

