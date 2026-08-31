/*
 * dashboards-vault.js — extracted verbatim from the original app.js, lines 3640-3817.
 *
 * "Remaining feature implementations" #1-3: donor leaderboard, mentorship-health
 * & event-ROI analytics (wraps switchAnalytics), and the REQ-14 NID/BRC identity
 * vault panel.
 */

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
    el.innerHTML = renderEmptyState('🏆', 'No donations yet', 'The top contributors will be listed here.');
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
    ? `<div class="vault-banner ok">🔐 AES-256-GCM encryption active. Values are decryptable only with a logged reason.</div>`
    : `<div class="vault-banner warn">⚠ ENCRYPTION_KEY is not configured — the vault is refusing to store identity data.</div>`;

  el.innerHTML = `
    ${banner}
    <div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="showStoreIdentityModal()">➕ Encrypt a field</button>
      <button class="btn btn-ghost btn-sm" onclick="showVaultAccessLogs()">📜 Access log</button>
    </div>
    ${data.entries.length === 0
      ? renderEmptyState('🔐', 'No identity fields stored', 'Encrypted NID / BRC records will be listed here, masked.')
      : `<div style="display:flex;flex-direction:column;gap:8px">
          ${data.entries.map(v => `
            <div class="vault-row">
              <div class="vault-icon">🪪</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:13px">${escapeHtml(v.owner_name)}</div>
                <div style="font-size:12px;color:var(--text-secondary)">
                  ${escapeHtml(v.field_type.toUpperCase())} · <span style="font-family:monospace">•••• •••• ${escapeHtml(v.last_four || '••••')}</span>
                </div>
              </div>
              <button class="btn btn-sm btn-outline" onclick="decryptVaultField(${v.id}, '${escapeHtml(v.owner_name).replace(/'/g, '&#39;')}')">🔓 Decrypt</button>
            </div>`).join('')}
        </div>`}
  `;
}



