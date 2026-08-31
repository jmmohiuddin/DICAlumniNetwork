/*
 * profile-community.js — extracted verbatim from the original app.js, lines 4225-4888.
 *
 * "Remaining feature implementations" #5-9: admin custom field manager, the
 * 10-section user profile hub, audience segmentation panel, live poll/trending
 * tags/past polls, gamification & badges, event waitlist (wraps filterEvents),
 * moderation queue & approval workflow, and the admin-switcher decorator (wraps
 * switchAdmin). (The full profile editor modal heading here is just a comment —
 * the actual modal lives in profile-editor.js — see app.js:6254-6352.)
 */

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



