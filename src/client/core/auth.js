/*
 * auth.js — extracted verbatim from the original app.js, lines 134-364.
 *
 * Authentication: login submit/error/busy handlers, session bootstrap,
 * sidebar nav rendering, the multi-step login flow, logout, and theme
 * toggle. (Sign-up and change-password live
 * separately in core/auth-signup.js — see app.js:6139-6253.)
 */

// ─── AUTHENTICATION HANDLERS ────────────────────────────────
// Every path below authenticates against PostgreSQL via /api/auth/login and
// stores a signed session token. The client no longer invents a user object.

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

  if (topbarAvatar) topbarAvatar.textContent = u.initials;
  if (sidebarAvatar) sidebarAvatar.textContent = u.initials;
  if (sidebarName) sidebarName.textContent = u.name;
  if (sidebarRole) sidebarRole.textContent = u.roleLabel;
}

// ─── DYNAMIC SIDEBAR NAV PER ROLE ───────────────────────────
function renderSidebarNav(role) {
  const container = document.getElementById('sidebar-nav-container');
  if (!container) return;

  /* Sidebar badges.
   *
   * "Mentorship Hub" carried a hardcoded 3 and "Job Board" a hardcoded 5, shown
   * to every user on every page load regardless of whether they had a single
   * pending request or the board held a single posting. Items now name the
   * stats field they read via `badgeKey`, and refreshNavBadges() fills them in
   * after /api/stats/platform answers; a count of zero renders no badge at all,
   * because a badge is a call to action and zero is not one. */
  const navItems = [
    { id: 'dashboard', icon: '⊞', label: 'Dashboard', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'directory', icon: '◉', label: 'Alumni Directory', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'mentorship', icon: '⟳', label: 'Mentorship Hub', badgeKey: 'myPendingMentorshipRequests', roles: ['alumni', 'moderator', 'univ_admin', 'super_admin'] },
    { id: 'donations', icon: '❤', label: 'Donations & Funds', roles: ['alumni', 'univ_admin', 'super_admin'] },
    { id: 'events', icon: '◈', label: 'Events & Tickets', roles: ['alumni', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'jobs', icon: '✦', label: 'Job Board', badgeKey: 'openJobPostings', badgeNew: true, roles: ['alumni', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'analytics', icon: '▦', label: 'Executive Analytics', roles: ['dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'career', icon: '📈', label: 'Career Progression', roles: ['alumni', 'super_admin'] },
    { id: 'chapters', icon: '⬡', label: 'DIC Chapters', roles: ['alumni', 'univ_admin', 'super_admin'] },
    { id: 'news', icon: '✐', label: 'DIC News Feed', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'map', icon: '⊕', label: 'Alumni Map', roles: ['alumni', 'univ_admin', 'super_admin'] },
    { id: 'profile', icon: '◎', label: 'My DIC Profile', isDivider: true, roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'admin', icon: '⚙', label: 'DIC Admin Panel', roles: ['univ_admin', 'super_admin'] },
    // No badge: the "ENT" (Enterprise) chip advertised a tier that does not
    // exist, on a page that is now an explicit not-implemented notice.
    { id: 'apidev', icon: '⟁', label: 'Developer API', roles: ['super_admin'] }
  ];

  const allowed = navItems.filter(item => item.roles.includes(role));

  container.innerHTML = allowed.map(item => `
    ${item.isDivider ? '<div class="nav-divider"></div>' : ''}
    <a class="nav-item ${item.id === state.currentPage ? 'active' : ''}" onclick="showPage('${item.id}')" id="nav-${item.id}">
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
      ${item.badge ? `<span class="nav-badge ${item.badgeNew ? 'new' : ''}" ${item.badgeTeal ? 'style="background:var(--teal);color:var(--bg-deep)"' : ''}>${item.badge}</span>` : ''}${item.badgeKey ? `<span class="nav-badge ${item.badgeNew ? 'new' : ''}" data-badge-key="${item.badgeKey}" hidden></span>` : ''}
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

/* The platform has one theme.
 *
 * There used to be a dark/light toggle here writing `data-theme` onto <html>
 * and persisting the choice in localStorage. The stylesheet no longer defines
 * a dark palette at all — there is not a single [data-theme] or
 * prefers-color-scheme selector left in styles.css — so the toggle switched to
 * a mode that renders nothing, and the persisted 'dark' preference would have
 * applied a theme that no longer exists.
 *
 * initAppTheme() is kept as a no-op rather than deleted because runtime.js and
 * app-shell.js both call it on boot; it also clears the stale stored
 * preference so nothing is left pointing at the removed theme. */
function initAppTheme() {
  try { localStorage.removeItem('dic_theme'); } catch { /* private mode */ }
  document.documentElement.removeAttribute('data-theme');
}



/* Fills the data-driven sidebar badges from live counts.
 *
 * A zero count leaves the badge hidden rather than rendering "0": the badge is
 * there to pull someone's attention to something waiting for them, and a zero
 * is the one value that should not.
 */
async function refreshNavBadges() {
  const nodes = document.querySelectorAll('[data-badge-key]');
  if (!nodes.length) return;

  const stats = await API.getPlatformStats();
  if (apiFailed(stats)) return;

  nodes.forEach(el => {
    const value = stats[el.getAttribute('data-badge-key')];
    if (typeof value !== 'number' || value <= 0) { el.hidden = true; return; }
    el.textContent = value > 99 ? '99+' : String(value);
    el.hidden = false;
  });
}
