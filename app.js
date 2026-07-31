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

// ─── DIC ALUMNI DATASET ──────────────────────────────────────
const MOCK_ALUMNI = [
  { id: 1, name: 'Fatima Khanam', initials: 'FK', role: 'Senior Software Engineer', company: 'bKash Ltd', batch: 2019, dept: 'CSE', domain: 'tech', location: 'Dhaka, BD', skills: ['React', 'Node.js', 'AWS'], mentor: true, verified: true, color: '#00A859' },
  { id: 2, name: 'Arif Hossain', initials: 'AH', role: 'Data Scientist', company: 'Pathao', batch: 2018, dept: 'SWE', domain: 'tech', location: 'Dhaka, BD', skills: ['Python', 'ML', 'TensorFlow'], mentor: true, verified: true, color: '#00D4AA' },
  { id: 3, name: 'Nusrat Jahan', initials: 'NJ', role: 'Investment Analyst', company: 'BRAC Bank', batch: 2020, dept: 'BBA', domain: 'finance', location: 'Dhaka, BD', skills: ['Finance', 'Excel', 'Bloomberg'], mentor: false, verified: true, color: '#C084FC' },
  { id: 4, name: 'Tanvir Ahmed', initials: 'TA', role: 'Product Manager', company: 'Brain Station 23', batch: 2017, dept: 'CSE', domain: 'tech', location: 'Dhaka, BD', skills: ['Agile', 'Product', 'Analytics'], mentor: true, verified: true, color: '#FF8C42' },
  { id: 5, name: 'Ruma Begum', initials: 'RB', role: 'DevOps Engineer', company: 'Nagad', batch: 2019, dept: 'SWE', domain: 'tech', location: 'Dhaka, BD', skills: ['Docker', 'K8s', 'CI/CD'], mentor: false, verified: true, color: '#34D399' },
  { id: 6, name: 'Sakib Al Hassan', initials: 'SH', role: 'Cybersecurity Lead', company: 'Dutch-Bangla Bank', batch: 2016, dept: 'CSE', domain: 'tech', location: 'Dhaka, BD', skills: ['Security', 'Pentest', 'SIEM'], mentor: true, verified: true, color: '#F87171' },
  { id: 7, name: 'Priya Das', initials: 'PD', role: 'UX Designer', company: 'SSL Wireless', batch: 2021, dept: 'CSE', domain: 'design', location: 'Dhaka, BD', skills: ['Figma', 'UX Research', 'Design Systems'], mentor: false, verified: true, color: '#00A859' },
  { id: 8, name: 'Khalid Mahmud', initials: 'KM', role: 'Backend Engineer', company: 'Chaldal', batch: 2020, dept: 'CSE', domain: 'tech', location: 'Dhaka, BD', skills: ['Go', 'PostgreSQL', 'Redis'], mentor: true, verified: true, color: '#00D4AA' },
  { id: 9, name: 'Sadia Islam', initials: 'SI', role: 'Business Analyst', company: 'Unilever BD', batch: 2018, dept: 'BBA', domain: 'business', location: 'Dhaka, BD', skills: ['Strategy', 'Analytics', 'SQL'], mentor: false, verified: true, color: '#C084FC' },
  { id: 10, name: 'Rezaul Karim', initials: 'RK', role: 'ML Research Engineer', company: 'Samsung R&D BD', batch: 2017, dept: 'CSE', domain: 'tech', location: 'Dhaka, BD', skills: ['ML', 'NLP', 'Computer Vision'], mentor: true, verified: true, color: '#FF8C42' },
  { id: 11, name: 'Tasnim Akter', initials: 'TA', role: 'Software Engineer', company: 'Google', batch: 2015, dept: 'CSE', domain: 'tech', location: 'London, UK', skills: ['Python', 'Go', 'Distributed Systems'], mentor: true, verified: true, color: '#34D399' },
  { id: 12, name: 'Imran Hossain', initials: 'IH', role: 'Quant Developer', company: 'Goldman Sachs', batch: 2014, dept: 'EEE', domain: 'finance', location: 'New York, USA', skills: ['C++', 'Quant Finance', 'Python'], mentor: false, verified: true, color: '#F87171' }
];

const MOCK_CAMPAIGNS = [
  { id: 1, name: 'DIC Merit Scholarship Fund 2026', desc: 'Provide full tuition scholarships to 50 meritorious DIC students from underprivileged backgrounds.', tag: 'scholarship', raised: 1840000, goal: 2500000, donors: 342, days: 18, gateways: ['bkash', 'nagad', 'card'] },
  { id: 2, name: 'DIC Smart Robotics Lab Fund', desc: 'Equip the campus robotics laboratory with modern research-grade instruments and microcontrollers.', tag: 'infrastructure', raised: 680000, goal: 1200000, donors: 189, days: 31, gateways: ['bkash', 'nagad', 'rocket'] },
  { id: 3, name: 'DIC Entrepreneurship Seed Fund', desc: 'Launch a startup incubator at DIC providing seed funding and mentorship for student tech startups.', tag: 'education', raised: 920000, goal: 1500000, donors: 210, days: 45, gateways: ['bkash', 'card'] }
];

const MOCK_EVENTS = [
  { id: 1, emoji: '🎓', title: 'DIC 10th Annual Reunion 2026', date: 'Aug 15, 2026', time: '6:00 PM', venue: 'DIC Main Auditorium', capacity: 2000, registered: 1840, price: '৳500', status: 'upcoming', type: 'Gala' },
  { id: 2, emoji: '💼', title: 'DIC CSE & SWE Job Fair Q3', date: 'Aug 22, 2026', time: '10:00 AM', venue: 'DIC Campus Center', capacity: 1200, registered: 890, price: 'Free', status: 'upcoming', type: 'Professional' },
  { id: 3, emoji: '🚀', title: 'DIC AI & Cloud Tech Symposium', date: 'Aug 30, 2026', time: '9:00 AM', venue: 'DIC International Hall', capacity: 400, registered: 395, price: '৳300', status: 'upcoming', type: 'Conference' }
];

const MOCK_JOBS = [
  { id: 1, emoji: '💻', title: 'Senior Backend Engineer', company: 'Brain Station 23', salary: '৳1.8L/mo', type: 'fulltime', location: 'Dhaka', posted_by: 'Tanvir Ahmed', batch: 2017, tags: ['Node.js', 'PostgreSQL', 'AWS'], days: 2 },
  { id: 2, emoji: '📊', title: 'Data Scientist', company: 'Pathao', salary: '৳1.4L/mo', type: 'fulltime', location: 'Dhaka', posted_by: 'Arif Hossain', batch: 2018, tags: ['Python', 'Machine Learning'], days: 4 },
  { id: 3, emoji: '🎨', title: 'UI/UX Design Intern', company: 'SSL Wireless', salary: '৳25K/mo', type: 'internship', location: 'Dhaka', posted_by: 'Priya Das', batch: 2021, tags: ['Figma', 'UX'], days: 1 }
];

const MOCK_NEWS = [
  { id: 1, emoji: '🌟', category: 'DIC Spotlight', title: 'DIC Alumna Appointed AI Research Lead at Google DeepMind', excerpt: 'Liana Choudhury (CSE Batch 2018) has been appointed AI Research Lead. She credits DIC\'s hands-on lab environment and mentorship program for her research foundation.', author: 'DIC Press Office', date: '28 Jul 2026', status: 'published' },
  { id: 2, emoji: '🏆', category: 'Achievement', title: 'DIC Ranks #1 College in Computer Science Innovation 2026', excerpt: 'Daffodil International College achieved top research output in computer science and software engineering in the national index.', author: 'DIC Academic Council', date: '24 Jul 2026', status: 'published' }
];

const MOCK_CHAPTERS = [
  { id: 1, name: 'DIC Main Campus Chapter', type: 'regional', icon: '🏫', members: 18420, events: 14, parent: null },
  { id: 2, name: 'DIC Dhanmondi Branch Alumni', type: 'regional', icon: '🌆', members: 12400, events: 8, parent: null },
  { id: 3, name: 'DIC CSE Alumni Association', type: 'interest', icon: '💻', members: 6210, events: 18, parent: null },
  { id: 4, name: 'DIC SWE Engineers Club', type: 'interest', icon: '🚀', members: 4120, events: 12, parent: null },
  { id: 5, name: 'DIC UK & Europe Alumni', type: 'regional', icon: '🇬🇧', members: 840, events: 5, parent: null }
];

const MOCK_MENTORSHIPS = [
  { id: 1, name: 'Fatima Khanam', initials: 'FK', company: 'bKash', role: 'Senior SWE', type: 'mentor', health: 94, batch: 2019 },
  { id: 2, name: 'Arif Hossain', initials: 'AH', company: 'Pathao', role: 'Data Scientist', type: 'mentor', health: 87, batch: 2018 }
];
const MOCK_PENDING_REQUESTS = [
  { id: 1, name: 'Rafiq Islam', initials: 'RI', subject: 'Career Transition to ML', expires: '2 days' }
];
const MOCK_SUGGESTED_MENTORS = [
  { name: 'Tasnim Akter', initials: 'TA', company: 'Google', role: 'SWE', score: '97%', color: '#34D399' }
];
const MOCK_NOTIFICATIONS = [
  { icon: '🤝', title: 'Mentorship Accepted', sub: 'Fatima Khanam accepted your connection', time: '5 min ago', unread: true },
  { icon: '💰', title: 'Donation Receipt', sub: 'Your ৳5,000 to DIC Merit Fund confirmed', time: '1 hr ago', unread: true }
];
const MOCK_VERIFICATION_QUEUE = [
  { name: 'Rafiq Hossain', initials: 'RH', details: 'CSE Batch 2021 · Unmatched ID' },
  { name: 'Sumaiya Zaman', initials: 'SZ', details: 'BBA Batch 2022 · Pending NID' }
];
const MOCK_AUDIT_LOG = [
  { icon: '👑', bg: 'rgba(0,168,89,0.15)', action: 'Role Elevated: alumni → moderator', meta: 'By: Super Admin · 2026-07-29 14:32:11 UTC', hash: '0xA4F2...9E3C' }
];

const MOCK_COMPLIANCE = [
  { icon: '🔐', title: 'AES-256-GCM Field Encryption', desc: 'NID and BRC fields encrypted at application layer.', status: 'compliant' },
  { icon: '📜', title: 'PDPA 2026 & CA 2023 Compliant', desc: 'DIC Privacy policy & consent logging active.', status: 'compliant' }
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
  currentUser: MOCK_USERS.super_admin, // Default demo account
  charts: {},
  searchTimeout: null,
  selectedGateway: null,
  selectedAmount: null,
  displayedAlumni: 12,
  analyticsChart: null,
};

// ─── AUTHENTICATION & DEMO LOGIN HANDLERS ───────────────────
function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const emailInput = document.getElementById('login-email').value.trim().toLowerCase();
  
  // Find matching user or fallback to Super Admin
  let matchedUser = Object.values(MOCK_USERS).find(u => u.email.toLowerCase() === emailInput);
  if (!matchedUser) matchedUser = MOCK_USERS.super_admin;

  loginAsUser(matchedUser);
}

function loginAsRole(roleKey) {
  const user = MOCK_USERS[roleKey] || MOCK_USERS.super_admin;
  loginAsUser(user);
}

function switchCurrentRole(roleKey) {
  const user = MOCK_USERS[roleKey] || MOCK_USERS.super_admin;
  state.currentUser = user;
  updateUserUI();
  renderSidebarNav(user.role);
  showToast(`🔄 Switched View Role to: ${user.icon} ${user.roleLabel}`);
  showPage('dashboard');
}

function loginAsUser(user) {
  state.currentUser = user;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  updateUserUI();
  renderSidebarNav(user.role);
  initApp();
  showToast(`🎉 Welcome to DIC Portal, ${user.name} (${user.roleLabel})`);
}

function updateUserUI() {
  const u = state.currentUser;
  const topbarAvatar = document.getElementById('topbar-user-avatar');
  const sidebarAvatar = document.getElementById('sidebar-user-avatar');
  const sidebarName = document.getElementById('sidebar-user-name');
  const sidebarRole = document.getElementById('sidebar-user-role');
  const topbarSelect = document.getElementById('topbar-role-select');

  if (topbarAvatar) topbarAvatar.textContent = u.initials;
  if (sidebarAvatar) sidebarAvatar.textContent = u.initials;
  if (sidebarName) sidebarName.textContent = u.name;
  if (sidebarRole) sidebarRole.textContent = u.roleLabel;
  if (topbarSelect) topbarSelect.value = u.role;
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

function enterApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  initApp();
}

function logout() {
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('step-1').classList.remove('hidden');
  document.getElementById('step-2').classList.add('hidden');
  document.getElementById('step-3').classList.add('hidden');
  document.getElementById('sis-result').style.display = 'none';
  document.getElementById('continue-btn').classList.add('hidden');
  document.querySelector('.sis-match-animation').style.display = 'flex';
}

// ─── APP INITIALIZATION & ROLE-BASED DASHBOARDS ──────────────
function initApp() {
  updateUserUI();
  renderSidebarNav(state.currentUser.role);
  renderDashboard();

  // Initialize background data
  renderAlumniGrid();
  renderMentorships();
  if (typeof renderCampaignsEnhanced === 'function') renderCampaignsEnhanced(); else renderCampaigns();
  if (typeof startCampaignTicker === 'function') startCampaignTicker();
  renderEvents();
  if (typeof renderJobsEnhanced === 'function') renderJobsEnhanced(); else renderJobs();
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
          <div id="alumni-grid" class="alumni-grid" style="grid-template-columns:1fr 1fr;gap:10px"></div>
        </div>
        <div class="glass-card mt-16">
          <div class="card-header"><h3 class="card-title">📅 Upcoming DIC Events</h3></div>
          <div id="events-grid" class="events-grid" style="grid-template-columns:1fr;gap:10px"></div>
        </div>
      </div>
      <div class="dashboard-right">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">🏆 Top Donors Leaderboard</h3><span class="card-badge amber">FY 2026</span></div>
          <div id="donor-leaderboard"></div>
        </div>
        <div class="glass-card mt-16">
          <div class="card-header"><h3 class="card-title">🗳 DIC Live Poll</h3></div>
          <div id="active-poll"></div>
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

    <div class="sync-overview-grid mb-16" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
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

    <div class="sync-overview-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
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
  if (page === 'donations') { if (typeof renderCampaignsEnhanced === 'function') renderCampaignsEnhanced(); else renderCampaigns(); }
  if (page === 'events') renderEvents('upcoming');
  if (page === 'jobs') { if (typeof renderJobsEnhanced === 'function') renderJobsEnhanced(); else renderJobs(); }
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
  if (!ctx) return;

  if (state.charts.main) state.charts.main.destroy();

  const d = CHART_DATA.engagement;
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
        pointBorderColor: '#0a0e1a',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
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
          labels: { color: '#8B9CC4', font: { family: 'Inter', size: 12 }, padding: 20 }
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

function renderAlumniGrid(filter = '') {
  const container = document.getElementById('alumni-grid');
  if (!container) return;

  let alumni = MOCK_ALUMNI;
  if (filter) {
    const q = filter.toLowerCase();
    alumni = MOCK_ALUMNI.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.company.toLowerCase().includes(q) ||
      a.domain.toLowerCase().includes(q) ||
      a.skills.some(s => s.toLowerCase().includes(q)) ||
      a.location.toLowerCase().includes(q) ||
      a.batch.toString().includes(q)
    );
  }

  const shown = alumni.slice(0, state.displayedAlumni);
  document.getElementById('dir-count').textContent = `Showing ${shown.length} of ${MOCK_ALUMNI.length} profiles`;

  container.innerHTML = shown.map(a => `
    <div class="alumni-card" onclick="viewAlumniProfile(${a.id})">
      <div class="alumni-card-top">
        <div class="alumni-avatar ${a.verified ? 'verified-ring' : ''}" style="background: linear-gradient(135deg, ${a.color}40, ${a.color}20);">
          <span style="color:${a.color}">${a.initials}</span>
          ${a.verified ? '<div class="verified-badge-icon">✓</div>' : ''}
        </div>
        <div class="alumni-card-info">
          <div class="alumni-card-name">${a.name}</div>
          <div class="alumni-card-role">${a.role} · ${a.company}</div>
          <div class="alumni-card-location">📍 ${a.location} · Batch ${a.batch}</div>
        </div>
      </div>
      <div class="alumni-tags">
        ${a.skills.map(s => `<span class="alumni-tag">${s}</span>`).join('')}
        ${a.mentor ? '<span class="alumni-tag mentor-tag">🤝 Mentor</span>' : ''}
      </div>
      <div class="alumni-card-actions">
        <button class="connect-btn" onclick="event.stopPropagation(); connectAlumni('${a.name}')">+ Connect</button>
        ${a.mentor ? `<button class="mentor-req-btn" onclick="event.stopPropagation(); showMentorModal('${a.name}')">🤝 Request Mentorship</button>` : ''}
      </div>
    </div>
  `).join('');
}

function loadMoreAlumni() {
  state.displayedAlumni = Math.min(state.displayedAlumni + 12, MOCK_ALUMNI.length);
  renderAlumniGrid();
}

function filterDirectory(value) {
  clearTimeout(state.searchTimeout);
  const indicator = document.getElementById('search-indicator');
  indicator.style.display = 'flex';
  state.searchTimeout = setTimeout(() => {
    indicator.style.display = 'none';
    renderAlumniGrid(value);
  }, 600);
}

function toggleChip(el, filter) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  if (filter === 'all') { renderAlumniGrid(); return; }
  if (filter === 'mentor') {
    const container = document.getElementById('alumni-grid');
    const mentors = MOCK_ALUMNI.filter(a => a.mentor);
    container.innerHTML = mentors.map(a => renderAlumniCard(a)).join('');
  } else {
    renderAlumniGrid(filter);
  }
}

function renderAlumniCard(a) {
  return `
    <div class="alumni-card">
      <div class="alumni-card-top">
        <div class="alumni-avatar verified-ring" style="background: linear-gradient(135deg, ${a.color}40, ${a.color}20);">
          <span style="color:${a.color}">${a.initials}</span>
          ${a.verified ? '<div class="verified-badge-icon">✓</div>' : ''}
        </div>
        <div class="alumni-card-info">
          <div class="alumni-card-name">${a.name}</div>
          <div class="alumni-card-role">${a.role} · ${a.company}</div>
          <div class="alumni-card-location">📍 ${a.location} · Batch ${a.batch}</div>
        </div>
      </div>
      <div class="alumni-tags">${a.skills.map(s => `<span class="alumni-tag">${s}</span>`).join('')}${a.mentor ? '<span class="alumni-tag mentor-tag">🤝 Mentor</span>' : ''}</div>
      <div class="alumni-card-actions">
        <button class="connect-btn" onclick="connectAlumni('${a.name}')">+ Connect</button>
        ${a.mentor ? `<button class="mentor-req-btn" onclick="showMentorModal('${a.name}')">🤝 Request</button>` : ''}
      </div>
    </div>`;
}

function sortDirectory(by) { renderAlumniGrid(); }

async function viewAlumniProfile(id) {
  showToast(`👤 Loading profile for DIC Alumni #${id}…`);
  let profile = null;

  try {
    if (typeof API !== 'undefined') {
      profile = await API.getAlumniProfile(id);
    }
  } catch (err) {
    console.warn('PostgreSQL fetch fallback:', err);
  }

  if (!profile || !profile.name) {
    const a = MOCK_ALUMNI.find(x => x.id === parseInt(id)) || MOCK_ALUMNI[0];
    profile = {
      id: a.id,
      name: a.name,
      studentId: a.studentId || `DIC-2020-0${a.id}`,
      batch: a.batch || 2020,
      department: a.dept || 'Computer Science & Engineering',
      degree: a.degree || 'BSc in Computer Science & Engineering',
      company: a.company || 'Brain Station 23',
      jobTitle: a.role || 'Senior Software Engineer',
      location: a.location || 'Dhaka, Bangladesh',
      bio: a.bio || 'DIC alumni tech lead, software architect, and community mentor.',
      skills: a.skills || ['React', 'Node.js', 'PostgreSQL', 'AWS'],
      mobile: a.mobile || '+880 1712-345678',
      email: a.email || `${a.name.toLowerCase().replace(/ /g, '.')}@dic.edu.bd`,
      linkedin: a.linkedin || 'https://linkedin.com',
      github: a.github || 'https://github.com',
      verified: true,
      canMentor: a.mentor !== undefined ? a.mentor : true,
      hiring: true
    };
  }

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
          <div class="onboarding-sub">${profile.jobTitle} · ${profile.company}</div>
          <div style="font-size:11px;color:var(--teal);margin-top:2px">🎓 ${profile.degree} (Batch ${profile.batch}) · ${profile.department}</div>
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
        <span class="verify-pill">✓ Student ID ${profile.studentId}</span>
        <span class="verify-pill">✓ Email Verified (${profile.email})</span>
        <span class="verify-pill">✓ DIC Alumni Board Verified</span>
      </div>

      <!-- ABOUT BIO -->
      <div class="profile-section-card">
        <div class="profile-section-title" style="font-size:13px;font-weight:700;color:var(--teal)">📌 About &amp; Biography</div>
        <div style="font-size:13px;color:var(--text-primary);margin-top:6px">${profile.bio}</div>
      </div>

      <!-- CAREER & LOCATION -->
      <div class="profile-section-card">
        <div class="profile-section-title" style="font-size:13px;font-weight:700;color:var(--teal)">💼 Professional &amp; Location Details</div>
        <div class="field-grid-2" style="margin-top:8px">
          <div><div class="field-label">Current Role &amp; Employer</div><div class="field-val">${profile.jobTitle} at ${profile.company}</div></div>
          <div><div class="field-label">Geographical Location</div><div class="field-val">📍 ${profile.location}</div></div>
          <div><div class="field-label">Primary Email</div><div class="field-val">${profile.email}</div></div>
          <div><div class="field-label">Mobile Number</div><div class="field-val">${profile.mobile}</div></div>
        </div>
      </div>

      <!-- SKILLS -->
      <div class="profile-section-card">
        <div class="profile-section-title" style="font-size:13px;font-weight:700;color:var(--teal)">⚡ Core Expertise &amp; Skills</div>
        <div class="alumni-tags" style="margin-top:8px">
          ${(Array.isArray(profile.skills) ? profile.skills : profile.skills.split(',')).map(s => `<span class="alumni-tag">${s.trim()}</span>`).join('')}
        </div>
      </div>

      <!-- PRD UTILITIES (DIGITAL PASS & DSAR EXPORT) -->
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" style="flex:1" onclick="showToast('🎟 Generated DIC Wallet Pass (Apple/Google PKPass)')">🎟 Download Digital Pass</button>
        <button class="btn btn-outline btn-sm" style="flex:1" onclick="exportProfileDSAR('${profile.name}')">📥 Export Data (DSAR JSON)</button>
      </div>

      <!-- ACTION BUTTONS -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
        <button class="btn btn-primary btn-full" onclick="closeModal(); connectAlumni('${profile.name}')">+ Connect</button>
        <button class="btn btn-outline btn-full" onclick="closeModal(); showMentorModal('${profile.name}')">🤝 Request Mentorship</button>
      </div>
    </div>
  `);
}

function exportProfileDSAR(name) {
  const data = JSON.stringify(FULL_USER_PROFILE, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dic_dsar_export_${name.toLowerCase().replace(/ /g,'_')}.json`;
  a.click();
  showToast('📥 Downloaded DSAR GDPR/PDPA compliance data export');
}

function renderMentorships() {
  const list = document.getElementById('mentorship-list');
  if (list) list.innerHTML = MOCK_MENTORSHIPS.map(m => `
    <div class="mentorship-connection">
      <div class="alumni-avatar" style="width:44px;height:44px;background:linear-gradient(135deg,rgba(108,99,255,0.3),rgba(0,212,170,0.3));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">${m.initials}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px">${m.name}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${m.role} · ${m.company}</div>
      </div>
      <span class="mentorship-type-badge ${m.type}">${m.type === 'mentor' ? '🎓 Mentor' : '📚 Mentee'}</span>
      <div class="health-score">${m.health}%</div>
    </div>
  `).join('');

  const pending = document.getElementById('pending-requests');
  if (pending) pending.innerHTML = MOCK_PENDING_REQUESTS.map(r => `
    <div class="pending-request">
      <div class="alumni-avatar" style="width:40px;height:40px;background:linear-gradient(135deg,rgba(255,140,66,0.3),rgba(192,132,252,0.2));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${r.initials}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${r.name}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${r.subject}</div>
      </div>
      <span class="expiry-badge">⏱ ${r.expires}</span>
      <button class="btn btn-sm btn-primary" onclick="acceptRequest('${r.name}')">Accept</button>
    </div>
  `).join('');

  const suggested = document.getElementById('suggested-mentors');
  if (suggested) suggested.innerHTML = MOCK_SUGGESTED_MENTORS.map(m => `
    <div class="suggested-mentor-card">
      <div class="alumni-avatar" style="width:44px;height:44px;background:linear-gradient(135deg,${m.color}40,${m.color}20);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:${m.color}">${m.initials}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px">${m.name}</div>
        <div style="font-size:11px;color:var(--text-secondary)">${m.role} · ${m.company}</div>
      </div>
      <div style="text-align:right">
        <div class="match-score">${m.score}</div>
        <div style="font-size:10px;color:var(--text-muted)">match</div>
      </div>
    </div>
  `).join('');
}

function acceptRequest(name) { showToast(`✅ Mentorship with ${name} accepted!`); }

function renderCampaigns() {
  const container = document.getElementById('campaigns-grid');
  if (!container) return;
  container.innerHTML = MOCK_CAMPAIGNS.map(c => {
    const pct = Math.round((c.raised / c.goal) * 100);
    return `
    <div class="campaign-card">
      <div class="campaign-card-header">
        <span class="campaign-tag ${c.tag}">${c.tag.toUpperCase()}</span>
        <div class="campaign-name">${c.name}</div>
        <div class="campaign-desc">${c.desc}</div>
      </div>
      <div class="campaign-progress">
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="progress-meta">
          <span class="progress-raised">৳${(c.raised/100000).toFixed(1)}L raised</span>
          <span class="progress-goal">of ৳${(c.goal/100000).toFixed(1)}L goal · ${pct}%</span>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;font-size:12px;color:var(--text-muted)">
          <span>👥 ${c.donors} donors</span>
          <span>📅 ${c.days} days left</span>
        </div>
      </div>
      <div class="campaign-footer">
        <div class="gateway-pills">
          ${c.gateways.map(g => `<span class="gateway-pill ${g}">${g.charAt(0).toUpperCase() + g.slice(1)}</span>`).join('')}
        </div>
        <button class="donate-btn" onclick="showDonateModal(${c.id}, '${c.name}')">Donate →</button>
      </div>
    </div>`;
  }).join('');
}

function renderEvents(filter = 'upcoming') {
  const container = document.getElementById('events-grid');
  if (!container) return;

  if (filter === 'checkin') {
    container.innerHTML = `
      <div class="glass-card" style="grid-column:1/-1;text-align:center;padding:48px">
        <div style="font-size:48px;margin-bottom:16px">📷</div>
        <div style="font-size:20px;font-weight:800;margin-bottom:8px">QR Check-In Scanner</div>
        <div style="color:var(--text-secondary);margin-bottom:24px">Point camera at attendee QR ticket for instant check-in</div>
        <button class="btn btn-primary" onclick="simulateCheckin()">🎫 Simulate QR Scan</button>
      </div>`;
    return;
  }

  const events = filter === 'past'
    ? [{ emoji: '🎓', title: 'Alumni Day 2025', date: 'Nov 15, 2025', time: '6:00 PM', venue: 'DIC Auditorium', capacity: 400, registered: 389, price: '৳500', status: 'past', type: 'Gala' }]
    : MOCK_EVENTS;

  container.innerHTML = events.map(e => {
    const pct = Math.round((e.registered / e.capacity) * 100);
    return `
    <div class="event-card">
      <div class="event-card-banner" style="background: linear-gradient(135deg, rgba(108,99,255,0.15), rgba(0,212,170,0.1))">
        ${e.emoji}
        <span class="event-status ${e.status}">${e.status === 'sold-out' ? '🔴 Sold Out' : e.status === 'live' ? '🔴 Live' : '🟢 Open'}</span>
      </div>
      <div class="event-card-body">
        <div style="font-size:10px;font-weight:700;color:var(--primary-light);margin-bottom:4px;text-transform:uppercase">${e.type}</div>
        <div class="event-title">${e.title}</div>
        <div class="event-meta">
          <span>📅 ${e.date} · ${e.time}</span>
          <span>📍 ${e.venue}</span>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">${e.registered}/${e.capacity} registered (${pct}%)</div>
        <div class="event-capacity-bar"><div class="event-capacity-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="event-footer">
        <div class="event-price">${e.price}</div>
        <button class="event-ticket-btn" onclick="buyTicket('${e.title}')">${e.status === 'sold-out' ? '⏳ Waitlist' : '🎫 Get Ticket'}</button>
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
  showToast('📋 Loading Event Planner Workspace data…');
  let data = await API.getEventPlanner(eventId);

  if (!data || !data.proposal) {
    // Local fallback state
    data = {
      proposal: {
        id: 1,
        name: 'DIC 10th Annual Reunion & Tech Gala 2026',
        description: 'Comprehensive 10th anniversary alumni reunion featuring keynotes, networking gala, career fair, and fundraising drive.',
        objectives: 'Foster alumni-student mentorship, raise scholarship funds, and showcase DIC computer science achievements.',
        outcomes: '500+ attendees, ৳10L+ raised for scholarships, 50+ mentorship connections created.',
        category: 'Alumni Gala',
        type: 'Reunion & Gala',
        department: 'Computer Science & Engineering',
        organizer_name: 'DIC Alumni Relations & Executive Board',
        expected_attendance: 2000,
        venue: 'DIC Main Campus Auditorium & International Hall',
        event_date: 'Aug 15, 2026',
        duration: '8 Hours',
        status: 'approved'
      },
      budgets: [
        { id: 1, category: 'Venue & Hall Rental', estimated_cost: 150000, actual_cost: 140000, vendor_name: 'DIC Campus Operations', status: 'approved', payment_status: 'paid' },
        { id: 2, category: 'Stage & LED Screen Setup', estimated_cost: 180000, actual_cost: 185000, vendor_name: 'Dhaka Event Tech Ltd', status: 'approved', payment_status: 'paid' },
        { id: 3, category: 'Catering & Buffet Food (2000 pax)', estimated_cost: 350000, actual_cost: 340000, vendor_name: 'Grand Prince Catering', status: 'approved', payment_status: 'paid' },
        { id: 4, category: 'Photography & 4K Video Crew', estimated_cost: 80000, actual_cost: 75000, vendor_name: 'Cinematic Studio BD', status: 'approved', payment_status: 'paid' },
        { id: 5, category: 'Security & Medical First Aid Team', estimated_cost: 50000, actual_cost: 48000, vendor_name: 'Elite Security Services', status: 'approved', payment_status: 'paid' },
        { id: 6, category: 'Merchandise & Printed Welcome Kits', estimated_cost: 120000, actual_cost: 115000, vendor_name: 'PressCraft Printers', status: 'approved', payment_status: 'paid' }
      ],
      sponsors: [
        { id: 1, company: 'Brain Station 23', contact_person: 'Tanvir Ahmed', package_tier: 'title', contribution_amount: 500000, pipeline_status: 'received', deliverables: 'Main stage banner branding, keynote session slot, 10 VIP passes' },
        { id: 2, company: 'bKash Limited', contact_person: 'Arif Hossain', package_tier: 'gold', contribution_amount: 300000, pipeline_status: 'received', deliverables: 'Ticketing partner branding, booth space in lobby' },
        { id: 3, company: 'Pathao Tech', contact_person: 'Nusrat Rima', package_tier: 'silver', contribution_amount: 150000, pipeline_status: 'agreed', deliverables: 'Rideshare promo codes for attendees' },
        { id: 4, company: 'SSL Wireless', contact_person: 'Farhana S', package_tier: 'bronze', contribution_amount: 100000, pipeline_status: 'proposed', deliverables: 'SMS gateway sponsorship' }
      ],
      committees: [
        { id: 1, name: 'Finance & Sponsorship', leader_name: 'Super Admin (Mohiuddin)', members_count: 4, budget_allocated: 250000 },
        { id: 2, name: 'Marketing & Media', leader_name: 'Nusrat Jahan', members_count: 6, budget_allocated: 150000 },
        { id: 3, name: 'Logistics & Stage', leader_name: 'Rafiqul Islam', members_count: 8, budget_allocated: 300000 },
        { id: 4, name: 'Security & Volunteers', leader_name: 'Imtiaz Ahmed', members_count: 12, budget_allocated: 100000 }
      ],
      tasks: [
        { id: 1, committee_name: 'Finance & Sponsorship', title: 'Finalize Title Sponsor Agreement with Brain Station 23', priority: 'critical', status: 'completed', assigned_to: 'Super Admin', deadline: 'Aug 01, 2026' },
        { id: 2, committee_name: 'Logistics & Stage', title: 'Book Auditorium & Confirm Sound/Lighting Quotation', priority: 'high', status: 'completed', assigned_to: 'Rafiqul Islam', deadline: 'Aug 05, 2026' },
        { id: 3, committee_name: 'Marketing & Media', title: 'Launch Social Media Campaign & Press Release', priority: 'medium', status: 'in_progress', assigned_to: 'Nusrat Jahan', deadline: 'Aug 10, 2026' },
        { id: 4, committee_name: 'Security & Volunteers', title: 'Assign 25 Volunteers to Check-In & VIP Security Duties', priority: 'high', status: 'todo', assigned_to: 'Imtiaz Ahmed', deadline: 'Aug 12, 2026' },
        { id: 5, committee_name: 'Logistics & Stage', title: 'Receive 500 Printed Welcome Gift Boxes & Lanyards', priority: 'low', status: 'blocked', assigned_to: 'Rafiqul Islam', deadline: 'Aug 13, 2026' }
      ],
      procurement: [
        { id: 1, item_name: 'Custom Alumni Welcome T-Shirts', category: 'Merchandise', quantity: 500, estimated_price: 100000, actual_price: 95000, vendor_name: 'PressCraft Printers', delivery_status: 'delivered' },
        { id: 2, item_name: 'Lanyards & Anti-Spoof QR ID Badges', category: 'Branding', quantity: 600, estimated_price: 25000, actual_price: 24000, vendor_name: 'PressCraft Printers', delivery_status: 'delivered' },
        { id: 3, item_name: 'VIP Flowers & Recognition Crests', category: 'Decorations', quantity: 20, estimated_price: 15000, actual_price: 14500, vendor_name: 'Flower Garden BD', delivery_status: 'ordered' }
      ],
      volunteers: [
        { id: 1, volunteer_name: 'Tanvir Ahmed', shift_time: '8:00 AM - 1:00 PM', assigned_committee: 'Registration & Check-In', attendance_status: 'checked_in', certificate_issued: true },
        { id: 2, volunteer_name: 'Farhana Sultana', shift_time: '12:00 PM - 5:00 PM', assigned_committee: 'Hospitality & VIP Lounge', attendance_status: 'checked_in', certificate_issued: true },
        { id: 3, volunteer_name: 'Sabbir Rahman', shift_time: '8:00 AM - 4:00 PM', assigned_committee: 'Stage & Tech Support', attendance_status: 'assigned', certificate_issued: false }
      ],
      risks: [
        { id: 1, risk_title: 'Monsoon Heavy Rainfall / Weather Disruption', category: 'Weather', severity: 'high', contingency_plan: 'Shift outdoor booths to indoor Gymnasium. Covered walkway installed.' },
        { id: 2, risk_title: 'Main Power Grid Failure during Keynote', category: 'Technical', severity: 'high', contingency_plan: 'Auto-synchronizing 250kVA standby diesel generator with zero-downtime UPS.' }
      ]
    };
  }

  CURRENT_PLANNER_DATA = data;
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

  const p = CURRENT_PLANNER_DATA.proposal;
  const b = CURRENT_PLANNER_DATA.budgets;
  const s = CURRENT_PLANNER_DATA.sponsors;
  const t = CURRENT_PLANNER_DATA.tasks;
  const c = CURRENT_PLANNER_DATA.committees;

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

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
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
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:14px;margin-top:12px">
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
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
        <div class="card-header"><h3 class="card-title">📢 Omnichannel Marketing &amp; Meeting Minutes</h3></div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">Schedule broadcast announcements, review meeting minutes (MoM), and track promotional assets.</p>
        <div class="field-grid-2">
          <div style="padding:14px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
            <div style="font-weight:700;font-size:14px">📱 Social Media &amp; SMS Campaign</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Broadcast event registration invites directly to 2,000+ alumni emails &amp; SMS gateways.</div>
            <button class="btn btn-sm btn-primary mt-12" onclick="showBroadcastModal()">📢 Launch Broadcast</button>
          </div>
          <div style="padding:14px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
            <div style="font-weight:700;font-size:14px">📝 Executive Meeting Minutes (MoM)</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Logged: Meeting #4 (Aug 01) — Title Sponsor confirmed; Main Auditorium stage lighting finalized.</div>
            <button class="btn btn-sm btn-outline mt-12" onclick="showToast('📝 Meeting minutes updated')">+ Add MoM Entry</button>
          </div>
        </div>
      </div>`;
  } else if (tab === 'analytics') {
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">📈 Event ROI Analytics &amp; Post-Event Audit Reports</h3>
          <button class="btn btn-sm btn-primary" onclick="downloadEventReport('summary')">📥 Download Full Event Report (JSON)</button>
        </div>
        <div class="planner-metrics-ribbon mt-14 mb-16">
          <div class="pmetric-card">
            <div class="pmetric-val" style="color:var(--teal)">+16.6%</div>
            <div class="pmetric-lab">Financial ROI</div>
          </div>
          <div class="pmetric-card">
            <div class="pmetric-val">100%</div>
            <div class="pmetric-lab">Task Completion</div>
          </div>
          <div class="pmetric-card">
            <div class="pmetric-val">2,000</div>
            <div class="pmetric-lab">Total Ticket Cap</div>
          </div>
          <div class="pmetric-card">
            <div class="pmetric-val" style="color:var(--teal)">4.9 / 5.0</div>
            <div class="pmetric-lab">Attendee Rating</div>
          </div>
        </div>
      </div>`;
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

function downloadEventReport(type) {
  const dataStr = JSON.stringify(CURRENT_PLANNER_DATA, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dic_event_planner_report_${type}.json`;
  a.click();
  showToast('📥 Downloaded Event Management Planner Report JSON');
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

function renderJobs(filter = '') {
  const container = document.getElementById('jobs-list');
  if (!container) return;

  let jobs = MOCK_JOBS;
  if (filter) {
    const q = filter.toLowerCase();
    jobs = MOCK_JOBS.filter(j =>
      j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) ||
      j.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  container.innerHTML = jobs.map(j => `
    <div class="job-card">
      <div class="job-company-logo">${j.emoji}</div>
      <div class="job-info">
        <div class="job-title">${j.title}</div>
        <div class="job-company">${j.company}</div>
        <div class="job-meta">
          <span class="job-meta-item">📍 ${j.location}</span>
          <span class="job-meta-item">👤 Posted by ${j.posted_by} (${j.batch})</span>
          <span class="job-meta-item">🕒 ${j.days}d ago</span>
        </div>
        <div class="job-tags">${j.tags.map(t => `<span class="job-tag">${t}</span>`).join('')}</div>
      </div>
      <div class="job-right">
        <div class="job-salary">${j.salary}</div>
        <span class="job-type-badge ${j.type}">${j.type.charAt(0).toUpperCase() + j.type.slice(1)}</span>
        <button class="apply-btn" onclick="applyJob('${j.title}')">Apply →</button>
      </div>
    </div>
  `).join('');
}

function filterJobs(value) { renderJobs(value); }
function filterJobType(v) { renderJobs(v); }
function filterJobLocation(v) { renderJobs(v); }

let USER_CHAPTER_MEMBERSHIPS = new Set([1, 3]);

async function renderChapters() {
  const tree = document.getElementById('chapter-tree');
  if (!tree) return;

  // Sync with PostgreSQL API if available
  if (typeof API !== 'undefined') {
    const chaptersFromApi = await API.getChapters();
    if (chaptersFromApi && Array.isArray(chaptersFromApi)) {
      MOCK_CHAPTERS = chaptersFromApi.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        icon: c.icon,
        members: c.members_count || 100,
        events: c.events_count || 5,
        parent: c.parent_id
      }));
    }
  }

  const roots = MOCK_CHAPTERS.filter(c => c.parent === null || c.parent === undefined);
  const children = (parentId) => MOCK_CHAPTERS.filter(c => c.parent === parentId);

  tree.innerHTML = roots.map(c => `
    <div class="chapter-node" onclick="selectChapter(${c.id})">
      <span class="chapter-icon">${c.icon}</span>
      <span class="chapter-name">${c.name}</span>
      <span class="chapter-type ${c.type}">${c.type}</span>
      <span class="chapter-count">${c.members ? c.members.toLocaleString() : '100'}</span>
    </div>
    ${children(c.id).map(sub => `
      <div class="chapter-node chapter-indent" onclick="selectChapter(${sub.id})">
        <span class="chapter-icon">${sub.icon}</span>
        <span class="chapter-name">${sub.name}</span>
        <span class="chapter-type ${sub.type}">${sub.type}</span>
        <span class="chapter-count">${sub.members ? sub.members.toLocaleString() : '50'}</span>
      </div>
    `).join('')}
  `).join('');

  if (MOCK_CHAPTERS.length > 0) selectChapter(MOCK_CHAPTERS[0].id);
}

function selectChapter(id) {
  document.querySelectorAll('.chapter-node').forEach(n => n.classList.remove('active'));
  const c = MOCK_CHAPTERS.find(ch => ch.id === id);
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
  const c = MOCK_CHAPTERS.find(ch => ch.id === id);
  if (!c) return;

  let joined = false;
  if (typeof API !== 'undefined') {
    const res = await API.joinChapter(id, state.currentUser ? state.currentUser.id : 5);
    if (res) joined = res.joined;
  } else {
    if (USER_CHAPTER_MEMBERSHIPS.has(id)) {
      USER_CHAPTER_MEMBERSHIPS.delete(id);
      c.members = Math.max(1, c.members - 1);
      joined = false;
    } else {
      USER_CHAPTER_MEMBERSHIPS.add(id);
      c.members = c.members + 1;
      joined = true;
    }
  }

  if (joined) {
    USER_CHAPTER_MEMBERSHIPS.add(id);
    c.members += 1;
    showToast(`🎉 You have joined "${c.name}"!`);
  } else {
    USER_CHAPTER_MEMBERSHIPS.delete(id);
    c.members = Math.max(1, c.members - 1);
    showToast(`ℹ Left chapter "${c.name}".`);
  }

  selectChapter(id);
  renderChapters();
}

async function showChapterMembersModal(id) {
  const c = MOCK_CHAPTERS.find(ch => ch.id === id);
  let members = [];

  if (typeof API !== 'undefined') {
    const res = await API.getChapterMembers(id);
    if (res && Array.isArray(res)) members = res;
  }

  if (members.length === 0) {
    members = MOCK_ALUMNI.slice(0, 4);
  }

  openModal(`
    <div class="onboarding-header">
      <div class="onboarding-title">👥 Chapter Enrolled Members</div>
      <div class="onboarding-sub">${c ? c.name : 'DIC Alumni Chapter'} · ${members.length} Enrolled Members</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;max-height:55vh;overflow-y:auto">
      ${members.map(m => `
        <div class="glass-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="alumni-avatar" style="width:36px;height:36px;font-size:13px;background:var(--teal)">
              <span>${m.initials || (m.name ? m.name.slice(0,2).toUpperCase() : 'AL')}</span>
            </div>
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${m.name}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${m.role || 'Software Engineer'} · ${m.company || 'Brain Station 23'}</div>
              <div style="font-size:11px;color:var(--text-muted)">Batch ${m.batch || 2020} · ${m.dept || 'CSE'}</div>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="closeModal(); viewAlumniProfile(${m.id || 5})">View Profile</button>
        </div>
      `).join('')}
    </div>
  `);
}

function renderNewsFeed() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;
  feed.innerHTML = MOCK_NEWS.map(n => `
    <div class="news-card">
      <div class="news-banner" style="background:linear-gradient(135deg, rgba(108,99,255,0.12), rgba(0,212,170,0.08))">${n.emoji}</div>
      <div class="news-card-body">
        <div class="news-category">${n.category}</div>
        <div class="news-title">${n.title}</div>
        <div class="news-excerpt">${n.excerpt}</div>
        <div class="news-footer">
          <div class="news-author">
            <div class="news-author-avatar">${n.author.slice(0,2).toUpperCase()}</div>
            <div>
              <div style="font-weight:600">${n.author}</div>
              <div class="news-meta">${n.date}</div>
            </div>
          </div>
          <span class="moderated-badge">✓ Published</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderSpotlightAlumni() {
  const el = document.getElementById('spotlight-alumni');
  if (!el) return;
  const spotlights = MOCK_ALUMNI.filter(a => a.mentor).slice(0, 5);
  el.innerHTML = spotlights.map(a => `
    <div class="spotlight-card">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,${a.color}40,${a.color}20);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${a.color};flex-shrink:0">${a.initials}</div>
      <div class="spotlight-info">
        <div class="spotlight-name">${a.name}</div>
        <div class="spotlight-sub">${a.company} · Batch ${a.batch}</div>
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

function renderAuditLog() {
  const el = document.getElementById('audit-log');
  if (!el) return;
  el.innerHTML = MOCK_AUDIT_LOG.map(log => `
    <div class="audit-log-item">
      <div class="audit-log-icon" style="background:${log.bg}">${log.icon}</div>
      <div class="audit-log-body">
        <div class="audit-log-action">${log.action}</div>
        <div class="audit-log-meta">${log.meta}</div>
        <div class="audit-log-hash">${log.hash}</div>
      </div>
    </div>
  `).join('');
}

function renderComplianceGrid() {
  const el = document.getElementById('compliance-grid');
  if (!el) return;
  el.innerHTML = MOCK_COMPLIANCE.map(c => `
    <div class="compliance-card glass-card">
      <div class="compliance-icon">${c.icon}</div>
      <div class="compliance-title">${c.title}</div>
      <div class="compliance-desc">${c.desc}</div>
      <div class="compliance-status ${c.status}">
        <div class="compliance-status-dot"></div>
        ${c.status === 'compliant' ? '✓ Compliant' : '⚠ Partial'}
      </div>
    </div>
  `).join('');
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

function renderNotifications() {
  const el = document.getElementById('notif-list');
  if (!el) return;
  el.innerHTML = MOCK_NOTIFICATIONS.map(n => `
    <div class="notif-item">
      <div class="notif-item-icon">${n.icon}</div>
      <div class="notif-item-body">
        <div class="notif-item-title">${n.title}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${n.sub}</div>
        <div class="notif-item-time">${n.time}</div>
      </div>
      ${n.unread ? '<div class="notif-item-unread"></div>' : ''}
    </div>
  `).join('');
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
      <button class="btn btn-sm btn-outline" onclick="applyJob('${d.role}')">Apply</button>
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
}

function openModal(html) {
  showModal(html);
}
window.openModal = showModal;

function closeModal(e) {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function showMentorModal(mentorName = '') {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🤝 Request a Mentor</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="socratic-prompt">
      <div class="socratic-prompt-icon">🤖</div>
      <div class="socratic-prompt-text">
        <strong>ConnectAI:</strong> I'll help you craft an effective mentorship request. What's your primary career goal? What specific guidance are you looking for?
      </div>
    </div>
    ${mentorName ? `<div style="margin-bottom:16px;padding:12px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm);">
      <div style="font-size:12px;color:var(--text-muted)">Requesting mentorship from</div>
      <div style="font-size:15px;font-weight:700;margin-top:2px">${mentorName}</div>
    </div>` : ''}
    <div class="modal-section">
      <div class="modal-section-title">Mentorship Focus Area</div>
      <select class="form-select" id="mentor-focus">
        <option>Career Transition & Growth</option>
        <option>FAANG / Big Tech Interview Prep</option>
        <option>Startup & Entrepreneurship</option>
        <option>Academic Research Guidance</option>
        <option>International Career & Visa</option>
        <option>Technical Skills (Specific Stack)</option>
      </select>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Your Request (AI-Assisted)</div>
      <textarea class="form-input" rows="5" placeholder="Hi, I'm a recent DIC alumni interested in transitioning into machine learning. I've been self-studying Python and TensorFlow, and would love guidance on building a portfolio and navigating job applications at AI companies...">Hi, I'm Mohiuddin from Batch 2020. I'm currently a full-stack developer looking to transition into AI/ML engineering. Your experience at Google inspires me. I'd love guidance on bridging the gap from web dev to ML — specifically around building projects that stand out to top tech recruiters.</textarea>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Preferred Meeting Style</div>
      <div style="display:flex;gap:8px">
        <button class="chip active" onclick="toggleChipGroup(this)">Video Call</button>
        <button class="chip" onclick="toggleChipGroup(this)">Chat / Async</button>
        <button class="chip" onclick="toggleChipGroup(this)">Either</button>
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="submitMentorRequest()">🤝 Send Mentorship Request</button>
  `);
}

function submitMentorRequest() {
  closeModal();
  showToast('✅ Mentorship request sent! Expected response within 5 days.');
}

function showDonateModal(id, name) {
  const campaign = MOCK_CAMPAIGNS.find(c => c.id === id);
  state.selectedGateway = null;
  state.selectedAmount = null;
  state.donationStep = 1;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">❤ Donate</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="margin-bottom:20px;padding:12px;background:var(--primary-glow);border:1px solid rgba(108,99,255,0.3);border-radius:var(--radius-sm)">
      <div style="font-size:12px;color:var(--text-muted)">Campaign</div>
      <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${name}</div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Select Amount</div>
      <div class="amount-grid">
        <button class="amount-option" onclick="selectAmount(this, 500)">৳500</button>
        <button class="amount-option" onclick="selectAmount(this, 1000)">৳1,000</button>
        <button class="amount-option" onclick="selectAmount(this, 2000)">৳2,000</button>
        <button class="amount-option" onclick="selectAmount(this, 5000)">৳5,000</button>
        <button class="amount-option" onclick="selectAmount(this, 10000)">৳10,000</button>
        <button class="amount-option" onclick="selectAmount(this, 25000)">৳25,000</button>
      </div>
      <input type="number" class="form-input" style="margin-top:8px" placeholder="Or enter custom amount (৳)" id="custom-amount" oninput="state.selectedAmount = this.value" />
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Payment Gateway</div>
      <div class="gateway-grid">
        <div class="gateway-option" onclick="selectGateway(this, 'bkash')">
          <div class="gateway-logo" style="color:#E2136E">b</div>
          <div><div class="gateway-name">bKash</div><div class="gateway-sub">Mobile Banking</div></div>
        </div>
        <div class="gateway-option" onclick="selectGateway(this, 'nagad')">
          <div class="gateway-logo" style="color:#FF6B00">N</div>
          <div><div class="gateway-name">Nagad</div><div class="gateway-sub">Mobile Banking</div></div>
        </div>
        <div class="gateway-option" onclick="selectGateway(this, 'rocket')">
          <div class="gateway-logo" style="color:#8B2FC9">R</div>
          <div><div class="gateway-name">Rocket</div><div class="gateway-sub">DBBL Mobile</div></div>
        </div>
        <div class="gateway-option" onclick="selectGateway(this, 'card')">
          <div class="gateway-logo">💳</div>
          <div><div class="gateway-name">Visa / MC</div><div class="gateway-sub">International Card</div></div>
        </div>
      </div>
    </div>
    <button class="btn btn-primary btn-full" id="donate-confirm-btn" onclick="processDonation('${name}')">
      Proceed to Payment →
    </button>
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

function processDonation(campaignName) {
  if (!state.selectedAmount && !document.getElementById('custom-amount').value) {
    showToast('⚠ Please select or enter a donation amount'); return;
  }
  if (!state.selectedGateway) {
    showToast('⚠ Please select a payment gateway'); return;
  }

  const amount = state.selectedAmount || document.getElementById('custom-amount').value;
  const gwNames = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', card: 'Visa/MC' };

  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔐 Authorize Payment</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="payment-step">
      <div style="font-size:48px;margin-bottom:12px">${state.selectedGateway === 'bkash' ? '📱' : state.selectedGateway === 'nagad' ? '📲' : state.selectedGateway === 'rocket' ? '🚀' : '💳'}</div>
      <div style="font-size:18px;font-weight:800;margin-bottom:6px">Authorizing via ${gwNames[state.selectedGateway]}</div>
      <div style="color:var(--text-secondary);margin-bottom:20px">Amount: <strong style="color:var(--teal)">৳${Number(amount).toLocaleString()}</strong></div>
      <div style="background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:16px;margin-bottom:20px;">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">Enter your ${gwNames[state.selectedGateway]} PIN/OTP</div>
        <div class="otp-inputs" style="justify-content:center">
          <input type="password" class="otp-box" maxlength="1" />
          <input type="password" class="otp-box" maxlength="1" />
          <input type="password" class="otp-box" maxlength="1" />
          <input type="password" class="otp-box" maxlength="1" />
        </div>
      </div>
      <button class="btn btn-primary btn-full" onclick="completeDonation(${amount}, '${campaignName}', '${gwNames[state.selectedGateway]}')">✓ Confirm Payment</button>
    </div>
  `);
}

function completeDonation(amount, campaign, gateway) {
  const txRef = 'TXN-' + Date.now().toString(36).toUpperCase();
  const date = new Date().toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' });

  showModal(`
    <div class="modal-header">
      <div class="modal-title">🎉 Payment Successful!</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="payment-step">
      <div class="payment-success">✅</div>
      <div class="payment-success-title">Thank you for your donation!</div>
      <div class="payment-success-sub">Your contribution to "${campaign}" has been processed.</div>
      <div class="receipt-preview">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;text-align:center;">OFFICIAL TAX RECEIPT</div>
        <div style="font-size:11px;text-align:center;color:var(--text-muted);margin-bottom:12px">Dhaka International College Alumni Association</div>
        <div class="receipt-row"><span>Donor Name</span><span>Mohiuddin Rahman</span></div>
        <div class="receipt-row"><span>Campaign</span><span style="font-size:11px">${campaign.slice(0,20)}…</span></div>
        <div class="receipt-row"><span>Transaction ID</span><span style="font-family:monospace;font-size:11px">${txRef}</span></div>
        <div class="receipt-row"><span>Gateway</span><span>${gateway}</span></div>
        <div class="receipt-row"><span>Date & Time</span><span style="font-size:11px">${date}</span></div>
        <div class="receipt-row"><span>Total Amount</span><span>৳${Number(amount).toLocaleString()}</span></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
        <button class="btn btn-outline" onclick="downloadReceipt()">📄 Download PDF</button>
        <button class="btn btn-outline" onclick="closeModal()">✓ Done</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:12px">Receipt also sent via SMS & Email · Cryptographic QR code embedded</div>
    </div>
  `);
}

function downloadReceipt() { showToast('📄 PDF receipt downloading…'); }

function showBroadcastModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">📢 Broadcast Message</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Target Audience</div>
      <div class="filter-chips" style="flex-wrap:wrap">
        <button class="chip active">All Alumni (12,847)</button>
        <button class="chip">Batch 2020</button>
        <button class="chip">Dhaka Chapter</button>
        <button class="chip">Mentors Only</button>
        <button class="chip">Event Attendees</button>
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Message</div>
      <textarea class="form-input" rows="4" placeholder="Write your broadcast message…">🎓 Alumni Reunion 2026 Registration closes in 48 hours! Secure your spot now at dic.alumnai.io/events. Limited seats available.</textarea>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Channels</div>
      <div style="display:flex;gap:8px">
        <button class="chip active">📱 SMS</button>
        <button class="chip active">🔔 Push</button>
        <button class="chip active">📧 Email</button>
      </div>
    </div>
    <div style="background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:12px;margin-bottom:16px;font-size:12px;color:var(--text-secondary)">
      ⚡ Fallback routing enabled: If preferred channel fails, system automatically tries next available channel.
    </div>
    <button class="btn btn-primary btn-full" onclick="sendBroadcast()">📢 Send Broadcast to 12,847 Alumni</button>
  `);
}

function sendBroadcast() { closeModal(); showToast('📢 Broadcast sent to 12,847 alumni via SMS + Push + Email'); }

function showCreateCampaign() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Create Campaign</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="input-group"><label class="input-label">Campaign Name</label><input type="text" class="form-input" placeholder="e.g., Science Lab Fund 2026" /></div>
    <div class="input-group"><label class="input-label">Description</label><textarea class="form-input" rows="3" placeholder="Describe the impact of this campaign…"></textarea></div>
    <div class="input-group"><label class="input-label">Goal Amount (৳)</label><input type="number" class="form-input" placeholder="e.g., 1500000" /></div>
    <div class="input-group"><label class="input-label">Category</label><select class="form-select"><option>Education</option><option>Scholarship</option><option>Infrastructure</option><option>Sports</option></select></div>
    <div class="input-group"><label class="input-label">Payment Gateways</label><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="chip active">bKash</button><button class="chip active">Nagad</button><button class="chip">Rocket</button><button class="chip active">Card</button></div></div>
    <button class="btn btn-primary btn-full" onclick="closeModal(); showToast('✅ Campaign created and published!')">Create Campaign</button>
  `);
}

function showCreateEventModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Create Event</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="input-group"><label class="input-label">Event Title</label><input type="text" class="form-input" placeholder="e.g., Alumni Career Summit 2026" /></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="input-group"><label class="input-label">Date</label><input type="date" class="form-input" /></div>
      <div class="input-group"><label class="input-label">Time</label><input type="time" class="form-input" /></div>
    </div>
    <div class="input-group"><label class="input-label">Venue</label><input type="text" class="form-input" placeholder="Venue or Online (Zoom)" /></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="input-group"><label class="input-label">Capacity</label><input type="number" class="form-input" placeholder="e.g., 200" /></div>
      <div class="input-group"><label class="input-label">Ticket Price (৳)</label><input type="text" class="form-input" placeholder="0 for free" /></div>
    </div>
    <button class="btn btn-primary btn-full" onclick="closeModal(); showToast('✅ Event created! QR tickets will be generated upon registration.')">Create Event</button>
  `);
}

function showPostJobModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Post a Job</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="background:var(--primary-glow);border:1px solid rgba(108,99,255,0.2);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--primary-light)">🔒 Alumni-only posting — only DIC verified alumni can post jobs.</div>
    <div class="input-group"><label class="input-label">Job Title</label><input type="text" class="form-input" placeholder="e.g., Senior Software Engineer" /></div>
    <div class="input-group"><label class="input-label">Company</label><input type="text" class="form-input" placeholder="Your company name" /></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="input-group"><label class="input-label">Type</label><select class="form-select"><option>Full-time</option><option>Part-time</option><option>Internship</option><option>Contract</option></select></div>
      <div class="input-group"><label class="input-label">Location</label><input type="text" class="form-input" placeholder="Dhaka / Remote / etc." /></div>
    </div>
    <div class="input-group"><label class="input-label">Salary Range</label><input type="text" class="form-input" placeholder="e.g., ৳80K–৳120K/mo" /></div>
    <button class="btn btn-primary btn-full" onclick="closeModal(); showToast('✅ Job posted! Visible to 12,847 verified alumni.')">Post Job</button>
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

  const userRole = state.currentUser ? state.currentUser.role : 'alumni';
  
  if (typeof API !== 'undefined') {
    const res = await API.submitChapter({ name, type, icon, description, createdByRole: userRole });
    if (res && res.chapter) {
      if (res.status === 'approved') {
        MOCK_CHAPTERS.push({ id: res.chapter.id, name, type, icon, members: 1, events: 0, parent: null });
        showToast(`✅ Chapter "${name}" created and published!`);
      } else {
        showToast(`⏳ Chapter "${name}" submitted for Super Admin review!`);
      }
    }
  } else {
    showToast(`⏳ Chapter "${name}" submitted for review!`);
  }

  closeModal();
  renderChapters();
  if (typeof renderModerationPanel === 'function') renderModerationPanel();
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

  if (typeof API !== 'undefined') {
    await API.submitStory({ title, category, emoji, content, authorName });
  }

  closeModal();
  showToast(`⏳ Story "${title}" submitted for Super Admin moderation!`);
  if (typeof renderModerationPanel === 'function') renderModerationPanel();
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
function buyTicket(event) { showToast(`🎫 Ticket purchased for "${event}"! QR code sent to email.`); }
function applyJob(title) { showToast(`📄 Application submitted for "${title}"!`); }
function simulateCheckin() { showToast('✅ QR Scanned! Attendee checked in: Rafiq Hossain — Batch 2021'); }

function showNotifications() {
  const panel = document.getElementById('notif-panel');
  panel.classList.toggle('hidden');
}
function closeNotifications() {
  document.getElementById('notif-panel').classList.add('hidden');
}

function showEditProfile() { showToast('✏ Profile editor loading…'); }

function exportUserData(format) {
  showToast(`📦 Preparing ${format.toUpperCase()} export. Download will start shortly.`);
}

function showDeleteAccount() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">⚠ Request Account Deletion</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:var(--radius-sm);padding:14px;margin-bottom:20px;font-size:13px;color:var(--red);">
      ⚠ This action initiates a 30-day grace period after which all your data will be permanently deleted (PDPA 2026 compliance). This cannot be undone.
    </div>
    <div class="input-group"><label class="input-label">Reason for Deletion</label><select class="form-select"><option>Privacy Concerns</option><option>No Longer Alumni</option><option>Using Another Platform</option><option>Other</option></select></div>
    <div class="input-group"><label class="input-label">Type "DELETE" to confirm</label><input type="text" class="form-input" placeholder="DELETE" /></div>
    <button class="btn btn-danger btn-full" onclick="closeModal(); showToast('🗑 Deletion requested. 30-day grace period started.')">Request Data Deletion</button>
  `);
}

function exportPDF() { showToast('📄 Generating analytics PDF report…'); }
function exportExcel() { showToast('📊 Generating Excel export…'); }
function triggerResumeUpload() { document.getElementById('resume-input').click(); }
function toggleChipGroup(el) {
  el.classList.toggle('active');
}

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

// ─── INIT ON LOAD ────────────────────────────────────────────
window.addEventListener('load', () => {
  // Auto-enter application so all 14 pages and navigation work immediately
  enterApp();
});

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
function renderCampaignsEnhanced() {
  const container = document.getElementById('campaigns-grid');
  if (!container) return;
  container.innerHTML = MOCK_CAMPAIGNS.map(c => {
    const pct = Math.round((c.raised / c.goal) * 100);
    return `
    <div class="campaign-card">
      <div class="campaign-card-header">
        <span class="campaign-tag ${c.tag}">${c.tag.toUpperCase()}</span>
        <div class="campaign-name">${c.name}</div>
        <div class="campaign-desc">${c.desc}</div>
      </div>
      <div class="campaign-progress">
        <div class="campaign-live-indicator"><div class="live-dot"></div> Live</div>
        <div class="progress-track"><div class="progress-fill" id="campaign-pct-${c.id}" style="width:${pct}%"></div></div>
        <div class="progress-meta">
          <span class="progress-raised" id="campaign-raised-${c.id}">৳${(c.raised/100000).toFixed(1)}L raised</span>
          <span class="progress-goal">of ৳${(c.goal/100000).toFixed(1)}L goal · ${pct}%</span>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;font-size:12px;color:var(--text-muted)">
          <span>👥 <span id="campaign-donors-${c.id}">${c.donors}</span> donors</span>
          <span>📅 ${c.days} days left</span>
        </div>
      </div>
      <div class="campaign-footer">
        <div class="gateway-pills">
          ${c.gateways.map(g => `<span class="gateway-pill ${g}">${g.charAt(0).toUpperCase() + g.slice(1)}</span>`).join('')}
        </div>
        <button class="donate-btn" onclick="showDonateModal(${c.id}, '${c.name}')">Donate →</button>
      </div>
    </div>`;
  }).join('');
}

// ─── REQ-07: REFERRAL REQUEST WORKFLOW ──────────────────────
function showReferralModal(jobTitle, postedBy, company) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🤝 Request a Referral</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="background:var(--teal-glow);border:1px solid rgba(0,212,170,0.2);border-radius:var(--radius-sm);padding:12px;margin-bottom:16px">
      <div style="font-size:11px;color:var(--text-muted)">Position at</div>
      <div style="font-size:15px;font-weight:700">${jobTitle}</div>
      <div style="font-size:12px;color:var(--teal);margin-top:2px">${company} · Referred by ${postedBy}</div>
    </div>
    <div class="socratic-prompt">
      <div class="socratic-prompt-icon">🤖</div>
      <div class="socratic-prompt-text"><strong>ConnectAI:</strong> A strong referral request includes your connection to the poster, your relevant experience, and why you're a great fit. Let me help you craft it.</div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Your Message to ${postedBy}</div>
      <textarea class="form-input" rows="5">Hi ${postedBy},

I noticed you posted the ${jobTitle} opening at ${company} on the DIC Alumni Network. 

I'm a DIC alumni (Batch 2020, BSc CSE) with 4+ years of full-stack development experience. I've been following ${company}'s engineering blog and I'm passionate about the problems you're solving.

Would you be open to referring me for this role? I'd be happy to share my resume and portfolio.

Thank you!</textarea>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Attach</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="showToast('📄 Resume attached!')">📄 Attach Resume</button>
        <button class="btn btn-outline btn-sm" onclick="showToast('🔗 LinkedIn profile attached!')">🔗 LinkedIn Profile</button>
      </div>
    </div>
    <button class="btn btn-primary btn-full" onclick="submitReferralRequest('${postedBy}', '${jobTitle}')">🤝 Send Referral Request</button>
  `);
}

function submitReferralRequest(name, job) {
  closeModal();
  showToast(`✅ Referral request sent to ${name} for "${job}"`);
}

// Updated renderJobs with Referral button
function renderJobsEnhanced(filter = '') {
  const container = document.getElementById('jobs-list');
  if (!container) return;

  let jobs = MOCK_JOBS;
  if (filter) {
    const q = filter.toLowerCase();
    jobs = MOCK_JOBS.filter(j =>
      j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) ||
      j.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  container.innerHTML = jobs.map(j => `
    <div class="job-card">
      <div class="job-company-logo">${j.emoji}</div>
      <div class="job-info">
        <div class="job-title">${j.title}</div>
        <div class="job-company">${j.company}</div>
        <div class="job-meta">
          <span class="job-meta-item">📍 ${j.location}</span>
          <span class="job-meta-item">👤 Posted by ${j.posted_by} (${j.batch})</span>
          <span class="job-meta-item">🕒 ${j.days}d ago</span>
        </div>
        <div class="job-tags">${j.tags.map(t => `<span class="job-tag">${t}</span>`).join('')}</div>
      </div>
      <div class="job-right">
        <div class="job-salary">${j.salary}</div>
        <span class="job-type-badge ${j.type}">${j.type.charAt(0).toUpperCase() + j.type.slice(1)}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="apply-btn" onclick="applyJob('${j.title}')">Apply →</button>
          <button class="referral-btn" onclick="showReferralModal('${j.title}', '${j.posted_by}', '${j.company}')">🤝 Referral</button>
        </div>
      </div>
    </div>
  `).join('');
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
      <div style="text-align:right;flex-shrink:0">
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
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
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
    html += `<tr>
      <td class="module-name">${MOCK_RBAC_V2.modules[i]}</td>
      ${row.map(p => `<td class="perm-cell"><span class="${permClass[p] || 'perm-none'}">${p}</span></td>`).join('')}
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
const MOCK_BROADCAST_HISTORY = [
  { id: 1, title: 'Reunion 2026 Registration Reminder', msg: '🎓 Alumni Reunion 2026 closes in 48 hours! Register now at dic.alumnai.io/events', audience: 'All Alumni (12,847)', channels: ['sms', 'push', 'email'], sent: 'Jul 28, 2026 · 10:00 AM', delivered: 98.4, opened: 74.2, clicked: 42.1 },
  { id: 2, title: 'Merit Scholarship Fund Appeal', msg: '❤ Help us reach our ৳25L goal! 50 students need your support.', audience: 'Verified Alumni (11,203)', channels: ['push', 'email'], sent: 'Jul 24, 2026 · 2:30 PM', delivered: 99.1, opened: 61.8, clicked: 28.3 },
  { id: 3, title: 'New Job Postings Available', msg: '💼 8 new jobs posted by DIC alumni at bKash, Pathao, Google & more.', audience: 'Tech Domain (4,821)', channels: ['push'], sent: 'Jul 20, 2026 · 9:15 AM', delivered: 96.7, opened: 83.4, clicked: 57.2 },
  { id: 4, title: 'AI & Tech Symposium Tickets', msg: '🚀 Limited seats remain for the Aug 30 AI Symposium — ৳1,200/seat.', audience: 'Batch 2015–2023 (8,431)', channels: ['sms', 'email'], sent: 'Jul 15, 2026 · 3:00 PM', delivered: 97.8, opened: 69.5, clicked: 34.7 },
];

function renderBroadcastHistory() {
  const el = document.getElementById('broadcast-history-list');
  if (!el) return;
  el.innerHTML = MOCK_BROADCAST_HISTORY.map(b => `
    <div class="broadcast-history-item">
      <div class="broadcast-history-header">
        <div>
          <div class="broadcast-history-title">${b.title}</div>
          <div class="broadcast-history-meta">To: ${b.audience} · Sent: ${b.sent}</div>
        </div>
        <button class="btn btn-sm btn-outline" onclick="showToast('📢 Re-sending: ${b.title}')">Resend</button>
      </div>
      <div class="broadcast-channels">
        ${b.channels.map(c => `<span class="channel-badge ${c}">${c.toUpperCase()}</span>`).join('')}
      </div>
      <div class="broadcast-read-receipts">
        <div class="receipt-stat">
          <div class="receipt-stat-val" style="color:var(--teal)">${b.delivered}%</div>
          <div class="receipt-stat-label">Delivered</div>
        </div>
        <div class="receipt-stat">
          <div class="receipt-stat-val" style="color:var(--primary-light)">${b.opened}%</div>
          <div class="receipt-stat-label">Opened</div>
        </div>
        <div class="receipt-stat">
          <div class="receipt-stat-val" style="color:var(--amber)">${b.clicked}%</div>
          <div class="receipt-stat-label">Clicked</div>
        </div>
      </div>
    </div>
  `).join('');
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
const MOCK_TOP_DONORS = [
  { rank: 1, name: 'Tariqul Islam', initials: 'TI', batch: 2012, amount: '৳1,50,000', label: 'Gold Benefactor' },
  { rank: 2, name: 'Nusrat Jahan', initials: 'NJ', batch: 2015, amount: '৳1,20,000', label: 'Silver Patron' },
  { rank: 3, name: 'Sabbir Hossain', initials: 'SH', batch: 2010, amount: '৳95,000', label: 'Bronze Supporter' },
  { rank: 4, name: 'Fatima Khanam', initials: 'FK', batch: 2019, amount: '৳60,000', label: 'Alumni Sustainer' },
  { rank: 5, name: 'Tanvir Ahmed', initials: 'TA', batch: 2017, amount: '৳45,000', label: 'Annual Contributor' }
];

function renderDonorLeaderboard() {
  const el = document.getElementById('donor-leaderboard');
  if (!el) return;
  el.innerHTML = MOCK_TOP_DONORS.map(d => `
    <div class="leaderboard-item">
      <div class="rank-badge rank-${d.rank > 3 ? 'other' : d.rank}">${d.rank}</div>
      <div class="leaderboard-info">
        <div class="leaderboard-name">${d.name} <span class="leaderboard-sub">· Batch '${d.batch % 100}</span></div>
        <div class="leaderboard-sub">${d.label}</div>
      </div>
      <div class="leaderboard-amount">${d.amount}</div>
    </div>
  `).join('');
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
const MOCK_NID_VAULT = [
  { id: 'USR-8472', name: 'Mohiuddin Rahman', type: 'National ID (NID)', ciphertext: 'AES256:gcm:e8f4c9a1b2d3e4f5061728394a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b', consentVer: 'v2.4 (Accepted Jan 15, 2026)', status: 'VERIFIED' },
  { id: 'USR-9014', name: 'Fatima Khanam', type: 'Birth Registration Cert (BRC)', ciphertext: 'AES256:gcm:3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e', consentVer: 'v2.4 (Accepted Jan 18, 2026)', status: 'VERIFIED' },
  { id: 'USR-1105', name: 'Tasnim Akter', type: 'National ID (NID)', ciphertext: 'AES256:gcm:a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f67890a1b2c3d4e5f60718', consentVer: 'v2.3 (Accepted Dec 10, 2025)', status: 'VERIFIED' }
];

function renderNIDVaultPanel() {
  const el = document.getElementById('nid-vault-panel');
  if (!el) return;
  el.innerHTML = `
    <div class="glass-card mb-16">
      <div class="card-header">
        <h3 class="card-title">🔐 Personal Data &amp; Compliance Vault (PDPA 2026 / CA 2023)</h3>
        <span class="card-badge teal">AES-256-GCM Field-Level Encryption</span>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px">
        Strict application-layer field encryption for National ID (NID) and Birth Registration Certificate (BRC) numbers. Decryption requires HSM key release and triggers an immutable administrative audit log.
      </p>
      ${MOCK_NID_VAULT.map(v => `
        <div class="nid-vault-card">
          <div class="vault-header">
            <div>
              <span class="vault-title">${v.name}</span>
              <span style="font-size:11px;color:var(--text-muted);margin-left:8px">(${v.id})</span>
            </div>
            <span class="card-badge teal">${v.status}</span>
          </div>
          <div style="font-size:11px;color:var(--text-secondary)">Document Type: <strong>${v.type}</strong></div>
          <div class="cipher-box">${v.ciphertext}</div>
          <div class="vault-meta">
            <span>Consent Log: ${v.consentVer}</span>
            <button class="api-key-btn" onclick="decryptVaultField('${v.id}', '${v.name}')">🔓 Decrypt (Audit Logged)</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function decryptVaultField(id, name) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔓 Decryption Key Release Authorization</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);border-radius:var(--radius-sm);padding:12px;margin-bottom:14px;font-size:12px;color:var(--red)">
      ⚠ WARNING: Decrypting identity fields for <strong>${name} (${id})</strong> will write an immutable record to the System Security Audit Log.
    </div>
    <div class="input-group"><label class="input-label">Admin Master Password / Security Token</label><input type="password" class="form-input" placeholder="••••••••••••" /></div>
    <button class="btn btn-primary btn-full" onclick="closeModal(); showToast('🔓 Decrypted value: NID 19942691520000847 (Logged to Audit Trail)')">Confirm Decryption</button>
  `);
}

// ─── 4. BULK USER IMPORT & AUTOMATIC PROFILE CREATION ENGINE ──
let MOCK_IMPORT_HISTORY = [
  { batchId: 'BATCH-2026-042', filename: 'dic_alumni_batch_2020.csv', total: 1250, success: 1248, failed: 2, duplicates: 14, date: '2026-07-28 14:32', admin: 'Super Admin', timeSec: '1.4s' },
  { batchId: 'BATCH-2026-041', filename: 'cse_graduates_2021.xlsx', total: 420, success: 420, failed: 0, duplicates: 3, date: '2026-07-20 10:15', admin: 'College Admin', timeSec: '0.8s' }
];

let currentImportState = {
  step: 1,
  filename: '',
  strategy: 'temp12345',
  dupResolution: 'skip',
  totalRows: 0,
  validRecords: [],
  invalidRecords: [],
  duplicateRecords: []
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
            ${MOCK_IMPORT_HISTORY.map(h => `
              <tr>
                <td><strong>${h.batchId}</strong></td>
                <td>📄 ${h.filename}</td>
                <td>${h.total}</td>
                <td><span class="card-badge teal">${h.success}</span></td>
                <td>${h.failed > 0 ? `<span class="card-badge amber">${h.failed}</span>` : '0'}</td>
                <td>${h.duplicates}</td>
                <td>${h.date} (${h.admin})</td>
                <td>${h.timeSec}</td>
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
      <div class="dropzone" onclick="simulateFileUploadProcess()">
        <div class="dropzone-icon">📄</div>
        <div class="dropzone-title">Click or Drag &amp; Drop CSV / XLSX / XLS File Here</div>
        <div class="dropzone-sub">Supports up to 50,000 records per file · Auto-validates 43 comprehensive fields</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        <div class="input-group">
          <label class="input-label">Automatic Password Generation Policy</label>
          <select class="form-select" id="password-strategy-select" onchange="currentImportState.strategy = this.value">
            <option value="temp12345">Static Temporary Password (12345678)</option>
            <option value="student_id_suffix">StudentID + Secure Suffix (e.g. DIC101#2026)</option>
            <option value="random_secure">Cryptographic Random Password (12-char)</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label">Automated User Notification Channel</label>
          <select class="form-select">
            <option>Email Activation Notice + SMS (Default)</option>
            <option>Email Only</option>
            <option>Do Not Notify (Silent Import)</option>
          </select>
        </div>
      </div>

      <button class="btn btn-primary btn-full mt-16" onclick="simulateFileUploadProcess()">🚀 Process Sample File (12 Records)</button>
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

function simulateFileUploadProcess() {
  currentImportState.filename = "dic_batch_2026_import.csv";
  currentImportState.totalRows = 12;
  currentImportState.step = 2;

  currentImportState.validRecords = [
    { row: 1, name: 'Rafiqul Islam', studentId: 'DIC-2020-101', email: 'rafiqul@gmail.com', year: '2020', dept: 'CSE', company: 'Brain Station 23' },
    { row: 2, name: 'Nusrat Jahan Rima', studentId: 'DIC-2020-102', email: 'nusrat.rima@gmail.com', year: '2020', dept: 'SWE', company: 'Pathao' },
    { row: 3, name: 'Mahmudul Hassan', studentId: 'DIC-2020-103', email: 'mahmudul@bkash.com', year: '2020', dept: 'CSE', company: 'bKash' },
    { row: 4, name: 'Tania Akter', studentId: 'DIC-2020-104', email: 'tania.akter@nagad.bd', year: '2020', dept: 'BBA', company: 'Nagad' },
    { row: 5, name: 'Shahriar Kabir', studentId: 'DIC-2020-105', email: 'skabir@chaldal.com', year: '2020', dept: 'EEE', company: 'Chaldal' },
    { row: 6, name: 'Farhana Sultana', studentId: 'DIC-2020-106', email: 'farhana.s@sslcommerz.com', year: '2020', dept: 'CSE', company: 'SSL Wireless' },
    { row: 7, name: 'Imtiaz Ahmed', studentId: 'DIC-2020-107', email: 'imtiaz.ahmed@grameenphone.com', year: '2020', dept: 'SWE', company: 'Grameenphone' },
    { row: 8, name: 'Khadija Tul Kobra', studentId: 'DIC-2020-108', email: 'khadija@bracbank.com', year: '2020', dept: 'BBA', company: 'BRAC Bank' },
    { row: 9, name: 'Zahid Hossain', studentId: 'DIC-2020-109', email: 'zahid.h@robi.com.bd', year: '2020', dept: 'CSE', company: 'Robi Axiata' }
  ];

  currentImportState.duplicateRecords = [
    { row: 10, name: 'Fatima Khanam', studentId: 'DIC-2019-001', email: 'fatima@bkash.com', year: '2019', dept: 'CSE', company: 'bKash Ltd' }
  ];

  currentImportState.invalidRecords = [
    { row: 11, name: 'Sabbir Rahman', studentId: '', email: 'invalid_email_format', year: '2020', dept: 'CSE', errorMsg: 'Missing Student ID & Invalid Email Format' },
    { row: 12, name: '', studentId: 'DIC-2020-112', email: 'missing_name@dic.edu.bd', year: 'invalid_year', dept: 'BBA', errorMsg: 'Missing Full Name & Invalid Passing Year' }
  ];

  renderBulkImportPanel();
  showToast('🔍 File Validated: 9 Valid, 1 Duplicate, 2 Errors');
}

function resetImportWizard() {
  currentImportState.step = 1;
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

function executeBulkImportProcess() {
  currentImportState.step = 4;
  
  // Push valid records into MOCK_ALUMNI
  currentImportState.validRecords.forEach((r, idx) => {
    MOCK_ALUMNI.push({
      id: MOCK_ALUMNI.length + 1,
      name: r.name,
      initials: r.name.split(' ').map(n=>n[0]).join('').slice(0,2),
      role: 'Software Engineer',
      company: r.company || 'DIC Tech Hub',
      batch: parseInt(r.year),
      dept: r.dept,
      domain: 'tech',
      location: 'Dhaka, BD',
      skills: ['React', 'Node.js', 'SQL'],
      mentor: true,
      verified: true,
      color: '#00A859'
    });
  });

  // Log to Audit History
  MOCK_IMPORT_HISTORY.unshift({
    batchId: `BATCH-2026-0${MOCK_IMPORT_HISTORY.length + 43}`,
    filename: currentImportState.filename,
    total: currentImportState.totalRows,
    success: currentImportState.validRecords.length,
    failed: currentImportState.invalidRecords.length,
    duplicates: currentImportState.duplicateRecords.length,
    date: new Date().toISOString().replace('T', ' ').slice(0, 16),
    admin: state.currentUser.name,
    timeSec: '1.1s'
  });

  renderBulkImportPanel();
  showToast(`🎉 Bulk Import Success! ${currentImportState.validRecords.length} accounts created.`);
}

// ─── 5. ADMIN DYNAMIC CUSTOM FIELD MANAGER ───────────────────
let MOCK_CUSTOM_FIELDS = [
  { id: 'cf_1', label: 'Research Publications', section: 'academic', type: 'text', required: false },
  { id: 'cf_2', label: 'Scholarship / Award Name', section: 'academic', type: 'text', required: false },
  { id: 'cf_3', label: 'Startup Pitch Deck / Video Link', section: 'networking', type: 'url', required: false }
];

function renderCustomFieldManager() {
  const el = document.getElementById('custom-fields-panel');
  if (!el) return;

  el.innerHTML = `
    <div class="glass-card">
      <div class="card-header">
        <h3 class="card-title">⚙ Admin Dynamic Custom Field Builder</h3>
        <span class="card-badge teal">No-Code Schema Extender</span>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">Define custom user profile fields without changing source code. Newly created fields instantly render across user profiles and edit forms.</p>

      <form onsubmit="handleCreateCustomField(event)" style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:10px;align-items:end;margin-bottom:20px;padding:14px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
        <div class="input-group" style="margin:0">
          <label class="input-label">Field Name / Label</label>
          <input type="text" id="cf-name" class="form-input" placeholder="e.g. High School Name, Kaggle Rank" required />
        </div>
        <div class="input-group" style="margin:0">
          <label class="input-label">Target Section</label>
          <select id="cf-section" class="form-select">
            <option value="basic">Basic Info</option>
            <option value="academic">Academic Record</option>
            <option value="professional">Professional Info</option>
            <option value="networking">Networking</option>
            <option value="social">Social Links</option>
          </select>
        </div>
        <div class="input-group" style="margin:0">
          <label class="input-label">Input Type</label>
          <select id="cf-type" class="form-select">
            <option value="text">Short Text</option>
            <option value="number">Number</option>
            <option value="url">URL Link</option>
            <option value="date">Date Picker</option>
            <option value="checkbox">Checkbox</option>
          </select>
        </div>
        <div class="input-group" style="margin:0">
          <label class="input-label">Required?</label>
          <select id="cf-required" class="form-select">
            <option value="false">Optional</option>
            <option value="true">Required</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">+ Add Field</button>
      </form>

      <div class="table-scroll">
        <table class="rbac-table">
          <thead>
            <tr><th>Field ID</th><th>Field Label</th><th>Target Section</th><th>Type</th><th>Required</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${MOCK_CUSTOM_FIELDS.map(f => `
              <tr>
                <td><code>${f.id}</code></td>
                <td><strong>${f.label}</strong></td>
                <td><span class="card-badge teal">${f.section}</span></td>
                <td>${f.type}</td>
                <td>${f.required ? '<span class="card-badge amber">Required</span>' : 'Optional'}</td>
                <td><button class="btn btn-sm btn-danger" onclick="deleteCustomField('${f.id}')">Delete</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function handleCreateCustomField(e) {
  e.preventDefault();
  const label = document.getElementById('cf-name').value.trim();
  const section = document.getElementById('cf-section').value;
  const type = document.getElementById('cf-type').value;
  const required = document.getElementById('cf-required').value === 'true';

  if (!label) return;

  MOCK_CUSTOM_FIELDS.push({
    id: `cf_${Date.now()}`,
    label,
    section,
    type,
    required
  });

  renderCustomFieldManager();
  render10SectionProfile();
  showToast(`✅ Created Custom Field: "${label}"`);
}

function deleteCustomField(id) {
  MOCK_CUSTOM_FIELDS = MOCK_CUSTOM_FIELDS.filter(f => f.id !== id);
  renderCustomFieldManager();
  render10SectionProfile();
  showToast('🗑 Custom field removed.');
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
const MOCK_POLL = {
  question: 'Where should the Alumni Reunion 2027 Gala be hosted?',
  votes: 1420,
  options: [
    { text: 'Dhaka Campus Auditorium', pct: 48, count: 681 },
    { text: 'Cox\'s Bazar Beach Resort', pct: 32, count: 454 },
    { text: 'Sylhet Tea Garden Convention Center', pct: 20, count: 285 }
  ]
};

function renderActivePoll() {
  const el = document.getElementById('active-poll');
  if (!el) return;
  el.innerHTML = `
    <div class="poll-header">
      <div class="poll-title">🗳 Institutional Alumni Poll</div>
      <div class="poll-meta">🟢 Live · ${MOCK_POLL.votes} votes</div>
    </div>
    <div class="poll-question-text">${MOCK_POLL.question}</div>
    <div class="poll-options">
      ${MOCK_POLL.options.map((o, idx) => `
        <button class="poll-option-btn" onclick="votePoll(${idx})">
          <div class="poll-option-bar" style="width:${o.pct}%"></div>
          <span class="poll-option-text">${o.text}</span>
          <span class="poll-option-pct">${o.pct}%</span>
        </button>
      `).join('')}
    </div>
  `;
}

function votePoll(idx) {
  MOCK_POLL.options[idx].pct += 2;
  MOCK_POLL.votes += 1;
  renderActivePoll();
  showToast(`✅ Vote recorded for "${MOCK_POLL.options[idx].text}"`);
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


