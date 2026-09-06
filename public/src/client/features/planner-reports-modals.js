/*
 * planner-reports-modals.js — extracted verbatim from the original app.js, lines 5424-5608.
 *
 * Event planner report downloads/exports, job location filter,
 * create-event/post-job submit handlers, create-campaign modal (+ submit),
 * broadcast modal, store-identity modal, and vault access log viewer.
 */

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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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

