/*
 * compliance-audit.js — extracted verbatim from the original app.js, lines 2263-2450.
 *
 * Immutable audit log, compliance grid (REQ-14), tenant list, notifications
 * rendering/read state, internship drives, analytics metrics, and the geo
 * heatmap.
 */

// ─── IMMUTABLE AUDIT LOG ───
async function renderAuditLog() {
  const el = document.getElementById('audit-log');
  if (!el) return;

  const rows = await API.getAuditLogs();
  if (apiFailed(rows)) {
    el.innerHTML = renderErrorState(rows?.error || 'Could not load audit logs.', 'renderAuditLog()');
    return;
  }
  if (rows.length === 0) {
    el.innerHTML = renderEmptyState('🛡', 'No audit entries yet', 'Privileged actions are recorded here as they happen.');
    return;
  }

  el.innerHTML = rows.map(l => `
    <div class="audit-entry">
      <div class="audit-icon" style="background:${escapeHtml(l.bg_color || 'rgba(0,168,89,0.15)')}">${escapeHtml(l.icon || '🛡')}</div>
      <div style="flex:1;min-width:0">
        <div class="audit-action">${escapeHtml(l.action)}</div>
        <div class="audit-meta">${escapeHtml(l.meta)} · ${escapeHtml(formatRelativeTime(l.created_at))}</div>
      </div>
      <div class="audit-hash" title="Hash-chained to the previous entry">${escapeHtml(l.hash)}</div>
    </div>`).join('');
}

// ─── COMPLIANCE GRID (REQ-14) ───
// Reports actual encryption / consent / audit state instead of fixed green pills.
async function renderComplianceGrid() {
  const el = document.getElementById('compliance-grid');
  if (!el) return;

  const items = await API.getComplianceStatus();
  if (apiFailed(items)) {
    el.innerHTML = renderErrorState(items?.error || 'Could not load compliance status.', 'renderComplianceGrid()');
    return;
  }

  const labels = { compliant: '✓ Compliant', pending: '◐ No data yet', at_risk: '⚠ Action required' };
  el.innerHTML = items.map(c => `
    <div class="compliance-card ${c.status}">
      <div class="compliance-icon">${c.icon}</div>
      <div class="compliance-title">${escapeHtml(c.title)}</div>
      <div class="compliance-desc">${escapeHtml(c.desc)}</div>
      <span class="compliance-status ${c.status}">${labels[c.status] || c.status}</span>
    </div>`).join('');
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

async function renderNotifications() {
  const el = document.getElementById('notif-list');
  if (!el) return;

  el.innerHTML = renderSkeletonCards(3, 'notif');

  const items = await API.getNotifications();

  if (items === null) {
    el.innerHTML = renderErrorState('Could not load notifications.', 'renderNotifications()');
    updateNotifBadge(0);
    return;
  }
  if (items.length === 0) {
    el.innerHTML = renderEmptyState('🔔', 'You are all caught up', 'New activity will show up here.');
    updateNotifBadge(0);
    return;
  }

  el.innerHTML = items.map(n => `
    <div class="notif-item${n.is_unread ? ' unread' : ''}" onclick="markNotificationRead(${n.id})">
      <div class="notif-item-icon">${escapeHtml(n.icon || '🔔')}</div>
      <div class="notif-item-body">
        <div class="notif-item-title">${escapeHtml(n.title)}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(n.subtitle || '')}</div>
        <div class="notif-item-time">${escapeHtml(formatRelativeTime(n.created_at))}</div>
      </div>
      ${n.is_unread ? '<div class="notif-item-unread"></div>' : ''}
    </div>
  `).join('');

  updateNotifBadge(items.filter(n => n.is_unread).length);
}

// Keeps the topbar bell count honest instead of the hardcoded "7".
function updateNotifBadge(count) {
  document.querySelectorAll('.notif-count').forEach(badge => {
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  });
}

async function markNotificationRead(id) {
  const res = await API.markNotificationRead(id);
  if (res) renderNotifications();
}

async function markAllNotificationsRead() {
  const res = await API.markAllNotificationsRead();
  if (res) {
    showToast(`✓ ${res.updated} notification${res.updated === 1 ? '' : 's'} marked as read`);
    renderNotifications();
  } else {
    showToast('⚠ Could not update notifications — please retry.');
  }
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
      <button class="btn btn-sm btn-outline" onclick="showPage('jobs')">View Board</button>
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

