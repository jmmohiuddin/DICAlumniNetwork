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
      <div class="modal-section-title">How will you send the payment?</div>
      <!-- These are labels for how the donor intends to pay, not integrated
           rails. No bKash/Nagad/Rocket SDK exists in this codebase and no
           outbound call is made to any of them; presenting them as live
           gateways is what made the old flow misleading. -->
      <div class="gateway-grid">
        ${[['bkash','📱','bKash'],['nagad','📲','Nagad'],['rocket','🚀','Rocket'],['card','💳','Card']].map(([id, icon, label]) =>
          `<div class="gateway-option" role="button" tabindex="0" onclick="selectGateway(this, '${id}')">
             <div style="font-size:22px">${icon}</div><div style="font-size:12px;font-weight:700">${label}</div>
           </div>`).join('')}
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

