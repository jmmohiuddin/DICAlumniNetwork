/*
 * chapters-planner-tabs.js — extracted verbatim from the original app.js, lines 5609-5936.
 *
 * Chapters rendering (REQ-13), the notification panel, shared planner
 * table/toolbar renderers, the planner vendors/timeline/logistics tabs, planner
 * analytics, and planner CRUD modals (create/submit/delete).
 */

// ─── CHAPTERS (REQ-13) — single source of truth is PostgreSQL ───
async function renderChapters() {
  const tree = document.getElementById('chapter-tree');
  if (!tree) return;

  tree.innerHTML = renderSkeletonCards(3, 'chapter');
  const rows = await API.getChapters();

  if (rows === null) {
    tree.innerHTML = renderErrorState('Could not load chapters.', 'renderChapters()');
    return;
  }

  chaptersCache = rows.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    icon: c.icon || '🏫',
    description: c.description || '',
    // members_count is the counter the join/leave endpoint maintains.
    members: c.members_count || 0,
    events: c.events_count || 0,
    parent: c.parent_id ?? null
  }));

  // Membership comes from PostgreSQL for the signed-in user.
  USER_CHAPTER_MEMBERSHIPS = new Set(rows.filter(c => c.is_member).map(c => c.id));

  if (chaptersCache.length === 0) {
    tree.innerHTML = renderEmptyState('⬡', 'No chapters yet', 'Create the first regional, batch or interest chapter.');
    const detail = document.getElementById('chapter-detail');
    if (detail) detail.innerHTML = '';
    return;
  }

  const roots = chaptersCache.filter(c => c.parent === null);
  const children = (parentId) => chaptersCache.filter(c => c.parent === parentId);

  tree.innerHTML = roots.map(c => `
    <div class="chapter-node" onclick="selectChapter(${c.id})">
      <span class="chapter-icon">${escapeHtml(c.icon)}</span>
      <span class="chapter-name">${escapeHtml(c.name)}</span>
      <span class="chapter-type ${escapeHtml(c.type)}">${escapeHtml(c.type)}</span>
      <span class="chapter-count">${c.members.toLocaleString()}</span>
    </div>
    ${children(c.id).map(sub => `
      <div class="chapter-node chapter-indent" onclick="selectChapter(${sub.id})">
        <span class="chapter-icon">${escapeHtml(sub.icon)}</span>
        <span class="chapter-name">${escapeHtml(sub.name)}</span>
        <span class="chapter-type ${escapeHtml(sub.type)}">${escapeHtml(sub.type)}</span>
        <span class="chapter-count">${sub.members.toLocaleString()}</span>
      </div>
    `).join('')}
  `).join('');

  if (chaptersCache.length > 0) selectChapter(chaptersCache[chaptersCache.length - 1].id);
}

// ─── NOTIFICATION PANEL ───
function showNotifications() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
  // Pull fresh rows every time the panel opens — it previously toggled a
  // container nothing had rendered into.
  if (!panel.classList.contains('hidden')) renderNotifications();
}

function closeNotifications() {
  const panel = document.getElementById('notif-panel');
  if (panel) panel.classList.add('hidden');
}
// Shared table→card renderer. On mobile every planner table becomes a stack of
// cards (Phase 7) instead of a horizontally scrolling grid.
function plannerTable(columns, rows, rowFn, emptyIcon, emptyText) {
  if (!rows.length) return renderEmptyState(emptyIcon, emptyText);
  return `
    <div class="planner-table">
      <div class="planner-table-head">
        ${columns.map(c => `<div>${escapeHtml(c)}</div>`).join('')}
      </div>
      ${rows.map(r => `<div class="planner-table-row">${rowFn(r).map((cell, i) =>
          `<div data-label="${escapeHtml(columns[i])}">${cell}</div>`).join('')}</div>`).join('')}
    </div>`;
}

function plannerToolbar(kind, label) {
  const canEdit = state.currentUser && ['super_admin', 'univ_admin', 'dept_admin', 'moderator'].includes(state.currentUser.role);
  if (!canEdit) return '';
  return `<button class="btn btn-sm btn-primary" onclick="showPlannerItemModal('${kind}')">➕ Add ${escapeHtml(label)}</button>`;
}

// ─── PLANNER: VENDORS / TIMELINE / LOGISTICS TABS (new in Phase 6) ───
function renderPlannerExtraTab(tab) {
  const container = document.getElementById('planner-tab-content');
  if (!container || !CURRENT_PLANNER_DATA) return;
  const d = CURRENT_PLANNER_DATA;

  if (tab === 'vendors') {
    const committed = (d.vendors || []).reduce((a, v) => a + Number(v.contract_value || 0), 0);
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">🏪 Vendor Management</h3>
          ${plannerToolbar('vendors', 'Vendor')}
        </div>
        <div class="planner-metrics-ribbon mb-16">
          <div class="pmetric-card"><div class="pmetric-val">${(d.vendors || []).length}</div><div class="pmetric-lab">Vendors</div></div>
          <div class="pmetric-card"><div class="pmetric-val" style="color:var(--teal)">৳${committed.toLocaleString()}</div><div class="pmetric-lab">Committed Value</div></div>
          <div class="pmetric-card"><div class="pmetric-val">${(d.vendors || []).filter(v => v.status === 'contracted' || v.status === 'paid').length}</div><div class="pmetric-lab">Contracted</div></div>
        </div>
        ${plannerTable(
          ['Vendor', 'Category', 'Contact', 'Contract', 'Rating', 'Status', ''],
          d.vendors || [],
          v => [
            `<strong>${escapeHtml(v.name)}</strong>`,
            escapeHtml(v.category || '—'),
            `${escapeHtml(v.contact_person || '—')}${v.phone ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(v.phone)}</div>` : ''}`,
            `৳${Number(v.contract_value).toLocaleString()}`,
            '★'.repeat(v.rating || 0) + '☆'.repeat(5 - (v.rating || 0)),
            `<span class="card-badge ${v.status === 'paid' ? 'teal' : v.status === 'contracted' ? '' : 'amber'}">${escapeHtml(v.status)}</span>`,
            `<button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('vendors', ${v.id})">🗑</button>`
          ],
          '🏪', 'No vendors added yet')}
      </div>`;

  } else if (tab === 'timeline') {
    const done = (d.timeline || []).filter(m => m.status === 'done').length;
    const avg = (d.timeline || []).length
      ? Math.round((d.timeline).reduce((a, m) => a + (m.progress || 0), 0) / d.timeline.length) : 0;
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">🗓 Event Timeline</h3>
          ${plannerToolbar('timeline', 'Milestone')}
        </div>
        <div class="planner-metrics-ribbon mb-16">
          <div class="pmetric-card"><div class="pmetric-val">${(d.timeline || []).length}</div><div class="pmetric-lab">Milestones</div></div>
          <div class="pmetric-card"><div class="pmetric-val" style="color:var(--teal)">${done}</div><div class="pmetric-lab">Completed</div></div>
          <div class="pmetric-card"><div class="pmetric-val">${avg}%</div><div class="pmetric-lab">Avg Progress</div></div>
        </div>
        ${(d.timeline || []).length ? `<div class="timeline-track">
          ${d.timeline.map(m => `
            <div class="timeline-item ${escapeHtml(m.status)}">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="timeline-head">
                  <strong>${escapeHtml(m.title)}</strong>
                  <span class="card-badge ${m.status === 'done' ? 'teal' : m.status === 'delayed' ? 'amber' : ''}">${escapeHtml(m.status.replace('_', ' '))}</span>
                </div>
                ${m.description ? `<div class="timeline-desc">${escapeHtml(m.description)}</div>` : ''}
                <div class="timeline-meta">
                  📅 ${escapeHtml(formatDate(m.starts_at))} → ${escapeHtml(formatDate(m.ends_at))}
                  ${m.owner ? ` · 👤 ${escapeHtml(m.owner)}` : ''} · ${escapeHtml(m.phase)}
                </div>
                <div class="progress-track" style="margin-top:8px"><div class="progress-fill" style="width:${m.progress || 0}%"></div></div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
                  <span style="font-size:11px;color:var(--text-muted)">${m.progress || 0}% complete</span>
                  <button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('timeline', ${m.id})">🗑</button>
                </div>
              </div>
            </div>`).join('')}
        </div>` : renderEmptyState('🗓', 'No milestones yet', 'Break the event into phases with owners and dates.')}
      </div>`;

  } else if (tab === 'logistics') {
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">🚚 Logistics &amp; Site Operations</h3>
          ${plannerToolbar('logistics', 'Item')}
        </div>
        ${plannerTable(
          ['Item', 'Category', 'Qty', 'Location', 'Responsible', 'Status', ''],
          d.logistics || [],
          l => [
            `<strong>${escapeHtml(l.item)}</strong>`,
            escapeHtml(l.category || '—'),
            String(l.quantity ?? 1),
            escapeHtml(l.location || '—'),
            escapeHtml(l.responsible || '—'),
            `<span class="card-badge ${l.status === 'on_site' || l.status === 'arranged' ? 'teal' : 'amber'}">${escapeHtml((l.status || '').replace('_', ' '))}</span>`,
            `<button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('logistics', ${l.id})">🗑</button>`
          ],
          '🚚', 'No logistics items yet')}
      </div>`;
  }
}

// ─── PLANNER ANALYTICS — computed server-side from real rows ───
async function renderPlannerAnalytics() {
  const container = document.getElementById('planner-tab-content');
  if (!container) return;

  const a = await API.getPlannerAnalytics(CURRENT_PLANNER_EVENT_ID);
  if (apiFailed(a)) {
    container.innerHTML = renderErrorState(a?.error || 'Could not load analytics.', 'renderPlannerAnalytics()');
    return;
  }

  const roi = a.budget.actual ? (((a.sponsors.secured - a.budget.actual) / a.budget.actual) * 100).toFixed(1) : '0.0';

  container.innerHTML = `
    <div class="glass-card">
      <div class="card-header">
        <h3 class="card-title">📈 Event Analytics</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm btn-primary" onclick="downloadEventReport('full', ${CURRENT_PLANNER_EVENT_ID})">📥 Full report (CSV)</button>
          <button class="btn btn-sm btn-outline" onclick="downloadEventReport('budget', ${CURRENT_PLANNER_EVENT_ID})">💰 Budget only</button>
        </div>
      </div>

      <div class="planner-metrics-ribbon mt-14 mb-16">
        <div class="pmetric-card">
          <div class="pmetric-val" style="color:${roi >= 0 ? 'var(--teal)' : 'var(--red)'}">${roi >= 0 ? '+' : ''}${roi}%</div>
          <div class="pmetric-lab">Sponsor ROI vs Spend</div>
        </div>
        <div class="pmetric-card">
          <div class="pmetric-val">${a.tasks.completionRate}%</div>
          <div class="pmetric-lab">Task Completion (${a.tasks.completed || 0}/${a.tasks.total})</div>
        </div>
        <div class="pmetric-card">
          <div class="pmetric-val">${a.budget.utilisation}%</div>
          <div class="pmetric-lab">Budget Utilisation</div>
        </div>
        <div class="pmetric-card">
          <div class="pmetric-val" style="color:var(--teal)">${a.sponsors.coverage}%</div>
          <div class="pmetric-lab">Sponsor Coverage</div>
        </div>
      </div>

      <div class="field-grid-2">
        <div class="analytics-block">
          <div class="analytics-block-title">💰 Budget</div>
          <div class="analytics-row"><span>Estimated</span><strong>৳${a.budget.estimated.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Actual</span><strong>৳${a.budget.actual.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Variance</span><strong style="color:${a.budget.variance >= 0 ? 'var(--teal)' : 'var(--red)'}">৳${a.budget.variance.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Budget lines</span><strong>${a.budget.lines}</strong></div>
        </div>
        <div class="analytics-block">
          <div class="analytics-block-title">🤝 Sponsorship</div>
          <div class="analytics-row"><span>Secured</span><strong>৳${a.sponsors.secured.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Full pipeline</span><strong>৳${a.sponsors.pipeline.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Sponsors</span><strong>${a.sponsors.count}</strong></div>
        </div>
        <div class="analytics-block">
          <div class="analytics-block-title">📢 Marketing</div>
          <div class="analytics-row"><span>Spend</span><strong>৳${a.marketing.spend.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Reach</span><strong>${a.marketing.reach.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Conversions</span><strong>${a.marketing.conversions.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Cost / conversion</span><strong>৳${a.marketing.costPerConversion.toLocaleString()}</strong></div>
        </div>
        <div class="analytics-block">
          <div class="analytics-block-title">🚦 Delivery</div>
          <div class="analytics-row"><span>Timeline progress</span><strong>${a.timeline.avgProgress}%</strong></div>
          <div class="analytics-row"><span>Milestones done</span><strong>${a.timeline.done}/${a.timeline.milestones}</strong></div>
          <div class="analytics-row"><span>Procurement spend</span><strong>৳${a.procurement.spend.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>Vendors committed</span><strong>৳${a.vendors.committed.toLocaleString()}</strong></div>
          <div class="analytics-row"><span>High-severity risks</span><strong>${a.risks.high || 0}</strong></div>
        </div>
      </div>
    </div>`;
}

// ─── PLANNER CRUD MODALS ───
const PLANNER_FIELDS = {
  vendors:    { label: 'Vendor', fields: [['name','Vendor name','text',true],['category','Category','text'],['contactPerson','Contact person','text'],['phone','Phone','tel'],['email','Email','email'],['contractValue','Contract value (৳)','number'],['rating','Rating (0-5)','number'],['status','Status','select',false,['shortlisted','contracted','paid','rejected']]] },
  timeline:   { label: 'Milestone', fields: [['title','Milestone title','text',true],['description','Description','textarea'],['phase','Phase','text'],['startsAt','Start date','date'],['endsAt','End date','date'],['owner','Owner','text'],['progress','Progress %','number'],['status','Status','select',false,['pending','in_progress','done','delayed']]] },
  logistics:  { label: 'Logistics item', fields: [['item','Item','text',true],['category','Category','text'],['quantity','Quantity','number'],['location','Location','text'],['responsible','Responsible','text'],['status','Status','select',false,['planned','arranged','on_site','returned']]] },
  marketing:  { label: 'Campaign', fields: [['channel','Channel','text',true],['campaignName','Campaign name','text',true],['audience','Audience','text'],['budget','Budget (৳)','number'],['reach','Reach','number'],['conversions','Conversions','number'],['scheduledFor','Scheduled for','date'],['status','Status','select',false,['planned','live','completed','paused']]] },
  meetings:   { label: 'Meeting', fields: [['title','Meeting title','text',true],['agenda','Agenda','textarea'],['meetingDate','Date','date'],['meetingTime','Time','text'],['location','Location','text'],['attendees','Attendees','text'],['status','Status','select',false,['scheduled','held','cancelled']]] },
  committees: { label: 'Committee', fields: [['name','Committee name','text',true],['leaderName','Leader','text',true],['membersCount','Members','number'],['budgetAllocated','Budget (৳)','number']] },
  volunteers: { label: 'Volunteer', fields: [['volunteerName','Volunteer name','text',true],['shiftTime','Shift','text'],['assignedCommittee','Committee','text'],['attendanceStatus','Attendance','select',false,['assigned','checked_in','absent']]] },
  risks:      { label: 'Risk', fields: [['riskTitle','Risk','text',true],['category','Category','text'],['severity','Severity','select',false,['high','medium','low']],['contingencyPlan','Contingency plan','textarea',true]] }
};

function showPlannerItemModal(kind) {
  const spec = PLANNER_FIELDS[kind];
  if (!spec) return;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">➕ Add ${escapeHtml(spec.label)}</div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
    </div>
    <form onsubmit="submitPlannerItem(event, '${kind}')">
      ${spec.fields.map(([key, label, type, required, options]) => {
        if (type === 'textarea') {
          return `<div class="input-group"><label class="input-label">${escapeHtml(label)}</label>
            <textarea id="pf-${key}" class="form-input" rows="3" ${required ? 'required' : ''}></textarea></div>`;
        }
        if (type === 'select') {
          return `<div class="input-group"><label class="input-label">${escapeHtml(label)}</label>
            <select id="pf-${key}" class="form-select">${options.map(o => `<option value="${o}">${o.replace('_', ' ')}</option>`).join('')}</select></div>`;
        }
        return `<div class="input-group"><label class="input-label">${escapeHtml(label)}</label>
          <input type="${type}" id="pf-${key}" class="form-input" ${required ? 'required' : ''} /></div>`;
      }).join('')}
      <button type="submit" class="btn btn-primary btn-full">Save ${escapeHtml(spec.label)}</button>
    </form>
  `);
}

async function submitPlannerItem(e, kind) {
  if (e) e.preventDefault();
  const spec = PLANNER_FIELDS[kind];
  const payload = { eventId: CURRENT_PLANNER_EVENT_ID };
  spec.fields.forEach(([key]) => {
    const el = document.getElementById('pf-' + key);
    if (el && el.value !== '') payload[key] = el.value;
  });

  const res = await API.createPlannerItem(kind, payload);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not save.'}`); return; }

  closeModal();
  showToast(`✅ ${spec.label} added.`);
  await loadEventPlannerWorkspace(CURRENT_PLANNER_EVENT_ID);
}

async function deletePlannerItem(kind, id) {
  if (!confirm('Delete this entry?')) return;
  const res = await API.deletePlannerItem(kind, id);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not delete.'}`); return; }
  showToast('🗑 Deleted.');
  await loadEventPlannerWorkspace(CURRENT_PLANNER_EVENT_ID);
}

