/*
 * directory.js — extracted verbatim from the original app.js, lines 932-1211.
 *
 * Alumni directory: verification queue, approveAlumni, server-backed alumni grid
 * rendering/paging, filterDirectory (original declaration — wrapped later in
 * gap-fixes-req.js), chip filters, connect, card rendering, sorting, and the
 * full alumni profile view.
 */

// ─── RENDER FUNCTIONS ────────────────────────────────────────
/* Alumni verification queue.
 *
 * This used to render MOCK_VERIFICATION_QUEUE — two hardcoded people, "Rafiq
 * Hossain" and "Sumaiya Zaman" — and its Approve button called showToast() and
 * nothing else. There was no verification endpoint on the server at all, so
 * no account could ever actually be approved.
 *
 * It now reads GET /api/verification/queue. That matters more than it used to:
 * bulk import no longer marks imported accounts verified, so this queue is the
 * only route from an imported row to a usable account.
 *
 * The escaping note the previous author left here was exactly right, and the
 * day it warned about is today — these names now come from self-registered
 * accounts, so they are attacker-chosen. Every interpolated value is escaped,
 * and the action buttons carry the numeric user id, never the name. A name
 * interpolated into an inline handler's argument list lands in a JS string
 * literal, where an apostrophe breaks out and HTML-escaping does not save you.
 */
let verificationQueueCache = [];

async function renderVerificationQueue() {
  const container = document.getElementById('verification-queue');
  if (!container) return;

  // apiRequest() resolves with an { error } envelope instead of throwing, so
  // this is apiFailed(), not try/catch.
  const data = await API.getVerificationQueue();
  if (apiFailed(data)) {
    container.innerHTML = '<div class="queue-empty">Could not load the verification queue.</div>';
    return;
  }

  verificationQueueCache = data.items || [];

  const badge = document.getElementById('verification-queue-count');
  if (badge) {
    badge.textContent = data.total;
    badge.hidden = data.total === 0;
  }

  // An empty queue is the healthy state, so it should read as "nothing to do"
  // rather than as a list that failed to load.
  if (!verificationQueueCache.length) {
    container.innerHTML = '<div class="queue-empty">No accounts are waiting for review.</div>';
    return;
  }

  container.innerHTML = verificationQueueCache.map(item => {
    // Where the account came from changes how much scrutiny it deserves: a
    // bulk_import row came from a spreadsheet the college supplied, a signup
    // row is an unverified claim by a member of the public.
    const origin = item.source === 'bulk_import' ? 'Bulk import'
                 : item.source === 'manual' ? 'Added by staff'
                 : 'Self sign-up';
    const detail = [item.batch ? 'Batch ' + item.batch : null,
                    item.department, item.studentId, origin]
                   .filter(Boolean).join(' · ');
    return `
    <div class="queue-item">
      <div class="queue-avatar">${escapeHtml(item.initials || '?')}</div>
      <div class="queue-info">
        <div class="queue-name">${escapeHtml(item.name || item.email)}</div>
        <div class="queue-sub">${escapeHtml(detail)}</div>
      </div>
      <div class="queue-actions">
        <button class="approve-btn" onclick="approveAlumni(${Number(item.id)})">✓ Approve</button>
        <button class="review-btn" onclick="rejectAlumni(${Number(item.id)})">Reject</button>
      </div>
    </div>`;
  }).join('');
}

async function approveAlumni(userId) {
  const item = verificationQueueCache.find(i => i.id === userId);
  const result = await API.approveVerification(userId);
  showToast(apiFailed(result)
    ? `⚠ ${result.error || 'Could not verify that account'}`
    : `✅ ${result.name || (item && item.name) || 'Account'} verified`);
  renderVerificationQueue();
}

async function rejectAlumni(userId) {
  const item = verificationQueueCache.find(i => i.id === userId);
  // The server requires a reason and stores it, so a rejection is explicable
  // later. Asking here rather than rejecting silently is the point.
  const reason = prompt(`Why is ${(item && item.name) || 'this account'} being rejected?\n\nThis is recorded in the audit log.`);
  if (reason === null) return;
  const result = await API.rejectVerification(userId, reason);
  showToast(apiFailed(result)
    ? `⚠ ${result.error || 'Could not reject that account'}`
    : '🚫 Account rejected');
  renderVerificationQueue();
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

// Records behind the alumni cards / profile modal currently on screen, keyed by
// id. Inline on*= handlers pass the numeric id and look the record up here at
// click time: a name interpolated into an onclick="" string lands inside a JS
// string literal, and HTML-entity escaping does not stop it closing that
// literal — the browser decodes &#39; back to ' before the JS is parsed.
const alumniRecordIndex = new Map();

function alumniRecord(id) {
  return alumniRecordIndex.get(String(id)) || null;
}

function connectAlumniById(id, btn) {
  const rec = alumniRecord(id);
  if (!rec) return;
  // Called from the profile modal there is no button to flip, so fall back to
  // the grid card's own button — the onclick text no longer carries the name.
  connectAlumni(rec.name, btn || document.querySelector(`.connect-btn[data-alumni-id="${Number(id)}"]`));
}

function requestMentorshipById(id) {
  const rec = alumniRecord(id);
  if (rec) showMentorModal(rec.name, rec.id);
}

// Single card renderer shared by the directory grid and the dashboard
// recommendations — these were two near-identical copies that had already
// drifted apart (one omitted the verified ring, the other the click target).
function renderAlumniCard(a) {
  const isConn = state.connectedAlumni && state.connectedAlumni[a.name];
  const color = a.color || '#00A859';
  const subtitle = [a.role, a.company].filter(Boolean).join(' · ') || 'Profile incomplete';
  alumniRecordIndex.set(String(a.id), a);

  return `
    <div class="alumni-card" onclick="viewAlumniProfile(${Number(a.id)})">
      <div class="alumni-card-top">
        <div class="alumni-avatar ${a.verified ? 'verified-ring' : ''}" style="background: linear-gradient(135deg, ${escapeHtml(color)}40, ${escapeHtml(color)}20);">
          <span style="color:${escapeHtml(color)}">${escapeHtml(a.initials)}</span>
          ${a.verified ? '<div class="verified-badge-icon">✓</div>' : ''}
        </div>
        <div class="alumni-card-info">
          <div class="alumni-card-name">${escapeHtml(a.name)}</div>
          <div class="alumni-card-role">${escapeHtml(subtitle)}</div>
          <div class="alumni-card-location">📍 ${escapeHtml(a.location || 'Location not set')}${a.batch ? ` · Batch ${escapeHtml(a.batch)}` : ''}</div>
        </div>
      </div>
      <div class="alumni-tags">
        ${(a.skills || []).map(s => `<span class="alumni-tag">${escapeHtml(s)}</span>`).join('')}
        ${a.mentor ? '<span class="alumni-tag mentor-tag">🤝 Mentor</span>' : ''}
      </div>
      <div class="alumni-card-actions">
        <button class="connect-btn ${isConn ? 'connected' : ''}" data-alumni-id="${Number(a.id)}"
                onclick="event.stopPropagation(); connectAlumniById(${Number(a.id)}, this)"
                ${isConn ? 'disabled' : ''}>${isConn ? '✓ Connected' : '+ Connect'}</button>
        ${a.mentor ? `<button class="mentor-req-btn" onclick="event.stopPropagation(); requestMentorshipById(${Number(a.id)})">🤝 Request Mentorship</button>` : ''}
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

  // The modal's buttons carry only the numeric id; the name is resolved here.
  alumniRecordIndex.set(String(profile.id), profile);

  showModal(`
    <div class="onboarding-header">
      <div style="display:flex;align-items:center;gap:12px">
        <div class="alumni-avatar verified-ring" style="width:52px;height:52px;font-size:18px;background:var(--teal)">
          <span>${escapeHtml(profile.initials || profile.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase())}</span>
          <div class="verified-badge-icon">✓</div>
        </div>
        <div style="flex:1">
          <div class="onboarding-title" style="font-size:18px">${escapeHtml(profile.name)}</div>
          <div class="onboarding-sub">${escapeHtml([profile.jobTitle, profile.company].filter(Boolean).join(" · ") || "Profile incomplete")}</div>
          <div style="font-size:11px;color:var(--teal);margin-top:2px">🎓 ${val(profile.degree)}${profile.batch ? ` (Batch ${escapeHtml(profile.batch)})` : ""} · ${val(profile.department)}</div>
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
        <button class="btn btn-outline btn-sm" style="flex:1" onclick="exportProfileDSAR()">📥 Export Data (DSAR JSON)</button>
      </div>

      <!-- ACTION BUTTONS -->
      <div class="field-grid-2" style="margin-top:10px">
        <button class="btn btn-primary btn-full" onclick="closeModal(); connectAlumniById(${Number(profile.id)})">+ Connect</button>
        <button class="btn btn-outline btn-full" onclick="closeModal(); requestMentorshipById(${Number(profile.id)})">🤝 Request Mentorship</button>
      </div>
    </div>
  `);
}



