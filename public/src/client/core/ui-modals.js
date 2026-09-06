/*
 * ui-modals.js — extracted verbatim from the original app.js, lines 2451-2771.
 *
 * QR code init, base modal show/open/close, and the "quick" feature modals:
 * mentor request, donate, create-event, post-job, create-chapter (+ submit),
 * create-news (+ submit), and the tenant switcher.
 */

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
/* One dialog element, reused by all 34 modal call sites across 9 modules, so
 * everything below lands everywhere without touching a single caller.
 *
 * What it used to do: set innerHTML, remove .hidden, set body overflow hidden.
 * That last part is a visual scroll lock only. It does not stop Tab and it does
 * not stop a screen reader's virtual cursor, so the page behind stayed fully
 * reachable — 17 focusable controls sat behind the donation modal — the dialog
 * carried no role, focus never entered it, and Escape did nothing. A keyboard
 * user could open Change Password and immediately tab out into the page under
 * it without ever reaching the fields.
 *
 * `inert` does the heavy lifting: it removes a subtree from the tab order AND
 * from the accessibility tree in one attribute, which is both the focus trap
 * and the AT-hiding. It is supported across every browser this product
 * targets. The backdrop stays clickable because it is outside the inert
 * subtrees.
 */
let modalReturnFocus = null;

/** Regions that must go inert while a dialog is open. */
function modalBackgroundRegions() {
  return ['pages', 'sidebar', 'sidebar-overlay']
    .map(id => document.getElementById(id))
    // The skip link lives at body root, outside every one of those, so it
    // stayed focusable behind an open dialog — a one-element leak in the trap.
    .concat([document.querySelector('.topbar'),
             document.querySelector('.bottom-nav'),
             document.querySelector('.skip-link')])
    .filter(Boolean);
}

function showModal(html) {
  const body = document.getElementById('modal-body');
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if (body) body.innerHTML = html;
  if (overlay) overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Remember who opened this so focus can go back there on close. Returning
  // focus to where it came from is what keeps a keyboard user from being
  // dumped at the top of the document after every dialog.
  modalReturnFocus = document.activeElement;

  if (content) {
    content.setAttribute('role', 'dialog');
    content.setAttribute('aria-modal', 'true');

    // Name the dialog from its own title, whatever the caller called it.
    const title = content.querySelector('.modal-title');
    if (title) {
      if (!title.id) title.id = 'modal-title-' + Date.now().toString(36);
      content.setAttribute('aria-labelledby', title.id);
    } else {
      content.removeAttribute('aria-labelledby');
    }
  }

  modalBackgroundRegions().forEach(el => el.setAttribute('inert', ''));

  // Focus the close button rather than the first field: it is a predictable
  // landing spot, and it means the first thing announced is how to get out.
  const target = content && (content.querySelector('.modal-close') ||
                             content.querySelector('button, [href], input, select, textarea'));
  if (target) setTimeout(() => target.focus(), 0);
}

function openModal(html) {
  showModal(html);
}
window.openModal = showModal;

function closeModal(e) {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';

  modalBackgroundRegions().forEach(el => el.removeAttribute('inert'));

  // Back where it came from. The guard covers an opener that has since been
  // re-rendered out of the document.
  if (modalReturnFocus && document.contains(modalReturnFocus)) {
    try { modalReturnFocus.focus(); } catch { /* not focusable any more */ }
  }
  modalReturnFocus = null;
}

/** Escape closes whatever dialog is open — the convention every dialog has. */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const overlay = document.getElementById('modal-overlay');
  if (overlay && !overlay.classList.contains('hidden')) {
    e.preventDefault();
    closeModal();
  }
});

// ─── MENTOR REQUEST MODAL ───
function showMentorModal(mentorName = '', mentorId = null, matchScore = 0) {
  if (!mentorId) {
    showToast('ℹ Open a mentor from the suggestions list to send a request.');
    return;
  }
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🤝 Request a Mentor</div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
    <button class="btn btn-primary btn-full" onclick="submitMentorRequest(${Number(mentorId)}, ${Number(matchScore)})">🤝 Send Request</button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
    </div>
    <div style="margin-bottom:14px;padding:12px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
      <div style="font-size:12px;color:var(--text-muted)">Contributing to</div>
      <div style="font-size:15px;font-weight:700;margin-top:2px">${escapeHtml(campaignName)}</div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Select Amount (৳)</div>
      <div class="amount-grid">
        ${[500, 1000, 2500, 5000, 10000, 25000].map(a =>
          `<button type="button" class="amount-btn" aria-pressed="false" onclick="selectAmount(this, ${a})">৳${a.toLocaleString()}</button>`).join('')}
      </div>
      <div class="input-group mt-16">
        <label class="input-label">Or enter a custom amount</label>
        <input type="number" id="custom-amount" class="form-input" min="1" placeholder="e.g. 7500" inputmode="numeric" />
      </div>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">How will you send the payment?</div>
      <!-- These are labels for how the donor intends to pay, not integrated
           rails. No bKash/Nagad/Rocket SDK exists in this codebase and no
           outbound call is made to any of them; presenting them as live
           gateways is what made the old flow misleading. -->
      <div class="gateway-grid">
        ${[['bkash','📱','bKash'],['nagad','📲','Nagad'],['rocket','🚀','Rocket'],['card','💳','Card']].map(([id, icon, label]) =>
          `<button type="button" class="gateway-option" aria-pressed="false" onclick="selectGateway(this, '${id}')">
             <span aria-hidden="true" style="font-size:22px;display:block">${icon}</span><span style="font-size:12px;font-weight:700">${label}</span>
           </button>`).join('')}
      </div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin:14px 0;cursor:pointer">
      <input type="checkbox" id="donate-anonymous" /> Donate anonymously
    </label>
    <!-- Only the numeric id crosses into the handler. The campaign name used to
         be interpolated here as a JS string literal, escaped with
         escapeHtml(...).replace(/'/g,'&#39;') — which does not work: the HTML
         parser decodes the attribute before the JS parser sees it, so &#39;
         becomes a real apostrophe and an admin-chosen campaign name could close
         the string and run script in any donor's session. processDonation never
         read the name, so it is simply not passed. -->
    <button class="btn btn-primary btn-full" onclick="processDonation(${Number(campaignId)})">Continue →</button>
  `);
}

function selectAmount(btn, amount) {
  // Was '.amount-option' — a class this modal does not render — so the previous
  // choice was never cleared and two amounts could appear selected together.
  document.querySelectorAll('.amount-btn').forEach(b => {
    b.classList.remove('selected');
    b.setAttribute('aria-pressed', 'false');
  });
  btn.classList.add('selected');
  btn.setAttribute('aria-pressed', 'true');
  state.selectedAmount = amount;
  const custom = document.getElementById('custom-amount');
  if (custom) custom.value = '';
}

function selectGateway(el, gateway) {
  document.querySelectorAll('.gateway-option').forEach(g => {
    g.classList.remove('selected');
    g.setAttribute('aria-pressed', 'false');
  });
  el.classList.add('selected');
  el.setAttribute('aria-pressed', 'true');
  state.selectedGateway = gateway;
}









// ─── CREATE EVENT (was a toast-only shell) ───
function showCreateEventModal() {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Create Event</div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">You have cross-institutional access to the following alumni networks:</p>
    <!-- The index, not the name, crosses into the handler. This is safe today
         either way — DIC_INSTITUTION is a hardcoded literal in state.js, not a
         database read — but it is the same shape as the vault Decrypt button
         that WAS exploitable, and the next person to point this at real data
         should not have to notice the difference. -->
    ${MOCK_TENANTS.map((t, i) => `
      <div class="tenant-card glass-card" style="cursor:pointer" onclick="switchTenant(${Number(i)})">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700">${escapeHtml(t.name)}</div>
          <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(t.subdomain)}</div>
        </div>
        <span class="tenant-status ${t.status}">${t.status.toUpperCase()}</span>
      </div>
    `).join('')}
  `);
}

function switchTenant(index) {
  const t = MOCK_TENANTS[Number(index)];
  if (!t) return;
  const label = document.getElementById('active-tenant');
  // textContent, not innerHTML — the name is never parsed as markup.
  if (label) label.textContent = t.name;
  closeModal();
  showToast(`🏫 Switched to ${t.name}`);
}

