/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE — ALUMNI PLATFORM
   navigation.js

   Page switching and the role-aware sidebar. showPage() is the single
   authoritative implementation and lives here.

   Split out of app.js. Loaded as a classic script in the order listed in
   index.html; all module files share one global scope.
   ============================================================ */


// ─── DYNAMIC SIDEBAR NAV PER ROLE ───────────────────────────
function renderSidebarNav(role) {
  const container = document.getElementById('sidebar-nav-container');
  if (!container) return;

  const navItems = [
    { id: 'dashboard', icon: '⊞', label: 'Dashboard', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'directory', icon: '◉', label: 'Alumni Directory', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    // The badge on this item read a literal "3" against a mentorships table
    // holding no rows, and the Job Board badge below read a literal "5". Both
    // are gone; a count in the navigation would need to be fetched, and neither
    // is worth a request on every render.
    { id: 'mentorship', icon: '⟳', label: 'Mentorship Hub', roles: ['alumni', 'moderator', 'univ_admin', 'super_admin'] },
    { id: 'donations', icon: '❤', label: 'Donations & Funds', roles: ['alumni', 'univ_admin', 'super_admin'] },
    { id: 'events', icon: 'calendar-days', label: 'Events & Tickets', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'jobs', icon: '✦', label: 'Job Board', roles: ['alumni', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'analytics', icon: '▦', label: 'Executive Analytics', roles: ['dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'chapters', icon: '⬡', label: 'DIC Chapters', roles: ['alumni', 'univ_admin', 'super_admin'] },
    { id: 'news', icon: '✐', label: 'DIC News Feed', roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'map', icon: '⊕', label: 'Alumni Map', roles: ['alumni', 'univ_admin', 'super_admin'] },
    { id: 'profile', icon: '◎', label: 'My DIC Profile', isDivider: true, roles: ['alumni', 'moderator', 'dept_admin', 'univ_admin', 'super_admin'] },
    { id: 'admin', icon: '⚙', label: 'DIC Admin Panel', roles: ['univ_admin', 'super_admin'] }
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
  if (page === 'jobs') renderJobReferrals();
  if (page === 'jobs') renderJobsEnhanced();
  if (page === 'career' && typeof renderCareerTracker === 'function') renderCareerTracker();
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
    // Load the real row first; the ten sections read from FULL_USER_PROFILE.
    hydrateUserProfile().then(() => render10SectionProfile());
    renderCareerTimeline();
    paintProfileCompleteness('profile-completeness-bar', 'profile-completeness-ring',
                             'profile-completeness-text', 'profile-completeness-items');
    if (typeof renderEngagementScore === 'function') renderEngagementScore();
    if (typeof renderAlumniBadges === 'function') renderAlumniBadges();
  }
  if (page === 'admin') {
    if (typeof renderBulkImportPanel === 'function') renderBulkImportPanel();
    loadImportHistory(); // pulls the real audit trail, then re-renders the panel
    renderRBACTableV2();
    renderAuditLog();
    renderComplianceGrid();
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
