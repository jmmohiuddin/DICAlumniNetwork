/*
 * planner-workspace.js — extracted verbatim from the original app.js, lines 1373-2262.
 *
 * Event management planner workspace engine: mode/tab switching, tab content
 * rendering, kanban cards, task status, AI estimate,
 * create-proposal/add-budget/add-sponsor/add-task modals and their submit
 * handlers — plus, contiguously trailing in the same original section, job
 * filters, chapter selection/join/members modal, news feed, spotlight alumni,
 * map clusters, career timeline preview, and the RBAC table renderer.
 */

// ─── EVENT MANAGEMENT PLANNER WORKSPACE ENGINE ───
let CURRENT_PLANNER_DATA = null;
let CURRENT_PLANNER_EVENT_ID = 1;
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
  const container = document.getElementById("planner-tab-content");
  if (container) container.innerHTML = renderSkeletonCards(3, "planner");

  // One bundled call returns all thirteen planner sections from PostgreSQL.
  // This previously fell back to ~80 lines of hardcoded sample data whenever
  // the request failed, which made an outage look like a populated workspace.
  const data = await API.getPlannerWorkspace(eventId);

  if (apiFailed(data)) {
    if (container) container.innerHTML = renderErrorState(data?.error || "Could not load the planner workspace.", "loadEventPlannerWorkspace(" + eventId + ")");
    return;
  }

  CURRENT_PLANNER_DATA = data;
  CURRENT_PLANNER_EVENT_ID = eventId;
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

  // Modules added in Phase 6 render through their own function.
  if (['vendors', 'timeline', 'logistics'].includes(tab)) {
    renderPlannerExtraTab(tab);
    return;
  }

  const p = CURRENT_PLANNER_DATA.proposal;
  const b = CURRENT_PLANNER_DATA.budgets;
  const s = CURRENT_PLANNER_DATA.sponsors;
  const t = CURRENT_PLANNER_DATA.tasks;
  const c = CURRENT_PLANNER_DATA.committees || [];
  const vendors = CURRENT_PLANNER_DATA.vendors || [];
  const timeline = CURRENT_PLANNER_DATA.timeline || [];
  const logistics = CURRENT_PLANNER_DATA.logistics || [];
  const marketing = CURRENT_PLANNER_DATA.marketing || [];
  const meetings = CURRENT_PLANNER_DATA.meetings || [];

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
          <div class="pmetric-val">${escapeHtml(p.expected_attendance)}</div>
          <div class="pmetric-lab">Expected Pax</div>
        </div>
      </div>

      <div class="dashboard-split">
        <div class="glass-card">
          <div class="card-header">
            <h3 class="card-title">🚀 Proposal Charter &amp; Executive Summary</h3>
            <span class="card-badge teal">APPROVED</span>
          </div>
          <div style="font-size:14px;font-weight:700;margin-bottom:8px">${escapeHtml(p.name)}</div>
          <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:14px">${escapeHtml(p.description)}</p>
          <div class="field-grid-2">
            <div><div class="field-label">Target Audience</div><div class="field-val">${escapeHtml(p.target_audience)}</div></div>
            <div><div class="field-label">Venue &amp; Date</div><div class="field-val">📍 ${escapeHtml(p.venue)} · 📅 ${escapeHtml(p.event_date)}</div></div>
            <div><div class="field-label">Event Organizer</div><div class="field-val">${escapeHtml(p.organizer_name)}</div></div>
            <div><div class="field-label">Department</div><div class="field-val">${escapeHtml(p.department)}</div></div>
          </div>
        </div>

        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">👥 Event Committees</h3></div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${c.map(comm => `
              <div style="padding:10px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
                <div style="font-weight:700;font-size:13px;color:var(--teal)">${escapeHtml(comm.name)}</div>
                <div style="font-size:12px;color:var(--text-secondary)">Lead: ${escapeHtml(comm.leader_name)} · ${escapeHtml(comm.members_count)} Members</div>
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
                <td style="padding:8px;font-weight:600">${escapeHtml(item.category)}</td>
                <td style="padding:8px;color:var(--text-secondary)">${escapeHtml(item.vendor_name)}</td>
                <td style="padding:8px">৳${Number(item.estimated_cost).toLocaleString()}</td>
                <td style="padding:8px;font-weight:700">৳${Number(item.actual_cost).toLocaleString()}</td>
                <td style="padding:8px;color:${item.estimated_cost >= item.actual_cost ? 'var(--teal)' : 'var(--red)'}">
                  ৳${(item.estimated_cost - item.actual_cost).toLocaleString()}
                </td>
                <td style="padding:8px"><span class="card-badge teal">${escapeHtml(item.payment_status.toUpperCase())}</span></td>
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
        <div class="campaigns-grid" style="margin-top:12px">
          ${s.map(sp => `
            <div class="glass-card sponsor-tier-card ${escapeHtml(sp.package_tier)}-tier">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <span class="priority-tag critical" style="text-transform:uppercase;background:var(--primary-glow)">${escapeHtml(sp.package_tier)} SPONSOR</span>
                <span class="card-badge teal">${escapeHtml(sp.pipeline_status.toUpperCase())}</span>
              </div>
              <div style="font-size:16px;font-weight:800">${escapeHtml(sp.company)}</div>
              <div style="font-size:12px;color:var(--text-secondary)">👤 ${escapeHtml(sp.contact_person)}</div>
              <div style="font-size:18px;font-weight:800;color:var(--teal);margin:8px 0">৳${Number(sp.contribution_amount).toLocaleString()}</div>
              <div style="font-size:11px;color:var(--text-muted)">📋 ${escapeHtml(sp.deliverables)}</div>
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
                <td style="padding:8px;font-weight:700">${escapeHtml(item.item_name)}</td>
                <td style="padding:8px">${escapeHtml(item.category)}</td>
                <td style="padding:8px">${escapeHtml(item.quantity)}</td>
                <td style="padding:8px">৳${Number(item.estimated_price).toLocaleString()}</td>
                <td style="padding:8px">৳${Number(item.actual_price).toLocaleString()}</td>
                <td style="padding:8px;color:var(--text-secondary)">${escapeHtml(item.vendor_name)}</td>
                <td style="padding:8px"><span class="card-badge teal">${escapeHtml(item.delivery_status.toUpperCase())}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } else if (tab === 'volunteers') {
    container.innerHTML = `
      <div class="field-grid-2" style="gap:16px">
        <div class="glass-card">
          <div class="card-header"><h3 class="card-title">🛡 Volunteer Roster &amp; Shifts</h3></div>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
            ${CURRENT_PLANNER_DATA.volunteers.map(v => `
              <div style="padding:10px;background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm)">
                <div style="font-weight:700;font-size:13px">${escapeHtml(v.volunteer_name)}</div>
                <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(v.assigned_committee)} · ⏱ ${escapeHtml(v.shift_time)}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">
                  <span class="card-badge teal">${escapeHtml(v.attendance_status.toUpperCase())}</span>
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
                  <span style="font-weight:700;font-size:13px">${escapeHtml(r.risk_title)}</span>
                  <span class="priority-tag critical">${escapeHtml(r.severity.toUpperCase())}</span>
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">🛡 Contingency: ${escapeHtml(r.contingency_plan)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
  } else if (tab === 'marketing') {
    container.innerHTML = `
      <div class="glass-card">
        <div class="card-header">
          <h3 class="card-title">📢 Marketing Campaigns</h3>
          ${plannerToolbar('marketing', 'Campaign')}
        </div>
        ${plannerTable(
          ['Channel', 'Campaign', 'Audience', 'Budget', 'Reach', 'Conversions', 'Status', ''],
          marketing,
          m => [
            escapeHtml(m.channel),
            `<strong>${escapeHtml(m.campaign_name)}</strong>`,
            escapeHtml(m.audience || '—'),
            `৳${Number(m.budget).toLocaleString()}`,
            Number(m.reach).toLocaleString(),
            `${Number(m.conversions).toLocaleString()}${Number(m.reach) ? ` (${((m.conversions / m.reach) * 100).toFixed(1)}%)` : ''}`,
            `<span class="card-badge ${m.status === 'live' ? 'teal' : m.status === 'completed' ? '' : 'amber'}">${escapeHtml(m.status)}</span>`,
            `<button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('marketing', ${Number(m.id)})">🗑</button>`
          ],
          '📢', 'No marketing campaigns planned yet')}
        <button class="btn btn-sm btn-outline mt-14" onclick="showBroadcastModal()">📣 Send a broadcast now</button>
      </div>

      <div class="glass-card mt-16">
        <div class="card-header">
          <h3 class="card-title">📝 Committee Meetings &amp; Minutes</h3>
          ${plannerToolbar('meetings', 'Meeting')}
        </div>
        ${plannerTable(
          ['Meeting', 'Date', 'Location', 'Attendees', 'Status', ''],
          meetings,
          mt => [
            `<strong>${escapeHtml(mt.title)}</strong>${mt.agenda ? `<div style="font-size:11px;color:var(--text-muted)">${escapeHtml(mt.agenda)}</div>` : ''}`,
            `${escapeHtml(formatDate(mt.meeting_date))}${mt.meeting_time ? ` · ${escapeHtml(mt.meeting_time)}` : ''}`,
            escapeHtml(mt.location || '—'),
            escapeHtml(mt.attendees || '—'),
            `<span class="card-badge ${mt.status === 'held' ? 'teal' : 'amber'}">${escapeHtml(mt.status)}</span>`,
            `<button class="btn btn-sm btn-ghost" onclick="deletePlannerItem('meetings', ${Number(mt.id)})">🗑</button>`
          ],
          '📝', 'No meetings scheduled yet')}
      </div>`;
  } else if (tab === 'analytics') {
    container.innerHTML = renderSkeletonCards(2, 'analytics');
    renderPlannerAnalytics();
    return;
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
        <span class="priority-tag ${escapeHtml(task.priority)}">${escapeHtml(task.priority)}</span>
        <span style="font-size:10px;color:var(--text-muted)">📅 ${escapeHtml(task.deadline)}</span>
      </div>
      <div style="font-size:13px;font-weight:700;margin-bottom:4px">${escapeHtml(task.title)}</div>
      <div style="font-size:11px;color:var(--text-secondary)">👤 Assigned: ${escapeHtml(task.assigned_to)}</div>
      <div style="display:flex;gap:4px;margin-top:8px">
        ${task.status !== 'todo' ? `<button class="btn btn-xs btn-outline" onclick="moveTaskStatus(${Number(task.id)}, 'todo')">◀ To Do</button>` : ''}
        ${task.status !== 'in_progress' ? `<button class="btn btn-xs btn-outline" onclick="moveTaskStatus(${Number(task.id)}, 'in_progress')">⚡ In Prog</button>` : ''}
        ${task.status !== 'completed' ? `<button class="btn btn-xs btn-primary" onclick="moveTaskStatus(${Number(task.id)}, 'completed')">✓ Done</button>` : ''}
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
          <div><div class="field-label">Recommended Total Budget</div><div class="field-val" style="font-size:18px;color:var(--teal);font-weight:800">৳${escapeHtml(res.recommendedBudget.toLocaleString())}</div></div>
          <div><div class="field-label">Catering (Food 40%)</div><div class="field-val">৳${escapeHtml(res.breakdown.food.toLocaleString())}</div></div>
          <div><div class="field-label">Venue &amp; Hall (25%)</div><div class="field-val">৳${escapeHtml(res.breakdown.venue.toLocaleString())}</div></div>
          <div><div class="field-label">Stage &amp; Tech (15%)</div><div class="field-val">৳${escapeHtml(res.breakdown.stageTech.toLocaleString())}</div></div>
        </div>

        <div style="font-weight:700;font-size:13px;margin-bottom:6px">📅 Suggested Milestone Timeline</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${res.suggestedTimeline.map(item => `
            <div style="font-size:12px;padding:6px 10px;background:var(--bg-glass);border-radius:4px"><strong>${escapeHtml(item.week)}:</strong> ${escapeHtml(item.milestone)}</div>
          `).join('')}
        </div>
      </div>`;
  }
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



function filterJobs(value) { renderJobsEnhanced(value); }
function filterJobType(v) {
  state.jobFilters = { ...(state.jobFilters || {}), type: v === 'all' ? '' : v };
  renderJobsEnhanced();
}

function selectChapter(id) {
  document.querySelectorAll('.chapter-node').forEach(n => n.classList.remove('active'));
  const c = chaptersCache.find(ch => ch.id === id);
  if (!c) return;

  const isJoined = USER_CHAPTER_MEMBERSHIPS.has(c.id);
  const detail = document.getElementById('chapter-detail');
  if (!detail) return;

  detail.innerHTML = `
    <div class="chapter-detail-content">
      <div class="chapter-detail-header">
        <div class="chapter-detail-icon">${escapeHtml(c.icon)}</div>
        <div>
          <div class="chapter-detail-title">${escapeHtml(c.name)}</div>
          <div class="chapter-detail-sub">${escapeHtml(c.type.charAt(0).toUpperCase() + c.type.slice(1))} Chapter · Est. 2020 · PostgreSQL Synced</div>
        </div>
      </div>
      <div class="chapter-stats-grid">
        <div class="chapter-stat"><div class="chapter-stat-val" id="chap-member-count-${Number(c.id)}">${escapeHtml(c.members.toLocaleString())}</div><div class="chapter-stat-lab">Members</div></div>
        <div class="chapter-stat"><div class="chapter-stat-val">${escapeHtml(c.events)}</div><div class="chapter-stat-lab">Events</div></div>
        <div class="chapter-stat"><div class="chapter-stat-val">94%</div><div class="chapter-stat-lab">Active Rate</div></div>
      </div>
      <div style="font-size:14px;font-weight:700;margin-bottom:12px">Chapter Leadership &amp; Officers</div>
      ${['President: Rafiq Hossain (CSE 2018)', 'VP: Meher Nisha (SWE 2019)', 'Secretary: Tanvir Chowdhury (BBA 2020)'].map(m => `
        <div class="chapter-member"><span style="font-size:20px">👤</span><span>${m}</span></div>
      `).join('')}
      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn ${isJoined ? 'btn-outline' : 'btn-primary'} btn-sm" id="btn-join-${Number(c.id)}" onclick="toggleJoinChapter(${Number(c.id)})">
          ${isJoined ? '✓ Joined Chapter' : '+ Join Chapter'}
        </button>
        <button class="btn btn-outline btn-sm" onclick="showChapterMembersModal(${Number(c.id)})">👥 View Members</button>
      </div>
    </div>`;
}

async function toggleJoinChapter(id) {
  const c = chaptersCache.find(ch => ch.id === id);
  if (!c) return;

  // The server owns membership state and returns the resulting flag; the
  // client no longer guesses or maintains a parallel counter.
  const res = await API.joinChapter(id);

  if (!res || res.error) {
    showToast('⚠ Could not update your membership — please try again.');
    return;
  }

  showToast(res.joined ? `🎉 You have joined ${c.name}!` : `ℹ Left chapter ${c.name}.`);

  await renderChapters();
  selectChapter(id);
}

async function showChapterMembersModal(id) {
  const c = chaptersCache.find(ch => ch.id === id);
  let members = [];

  if (typeof API !== 'undefined') {
    const res = await API.getChapterMembers(id);
    if (res && Array.isArray(res)) members = res;
  }

  // An empty chapter shows an empty state — it used to display four unrelated
  // alumni as though they were members.
  if (members.length === 0) {
    openModal(`
      <div class="onboarding-header">
        <div class="onboarding-title">👥 Chapter Enrolled Members</div>
        <div class="onboarding-sub">${escapeHtml(c ? c.name : 'DIC Alumni Chapter')}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      ${renderEmptyState('👤', 'No members yet', 'Be the first to join this chapter.')}
    `);
    return;
  }

  openModal(`
    <div class="onboarding-header">
      <div class="onboarding-title">👥 Chapter Enrolled Members</div>
      <div class="onboarding-sub">${escapeHtml(c ? c.name : 'DIC Alumni Chapter')} · ${members.length} Enrolled Member${members.length === 1 ? '' : 's'}</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;max-height:55vh;overflow-y:auto">
      ${members.map(m => `
        <div class="glass-card" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="alumni-avatar" style="width:36px;height:36px;font-size:13px;background:var(--teal)">
              <span>${escapeHtml(m.initials || (m.name ? m.name.slice(0,2).toUpperCase() : 'AL'))}</span>
            </div>
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${escapeHtml(m.name)}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml([m.role, m.company].filter(Boolean).join(" · ") || "Profile incomplete")}</div>
              <div style="font-size:11px;color:var(--text-muted)">Batch ${escapeHtml(m.batch || "—")} · ${escapeHtml(m.dept || "—")}</div>
            </div>
          </div>
          <button class="btn btn-outline btn-sm" onclick="closeModal(); viewAlumniProfile(${Number(m.id) || 5})">View Profile</button>
        </div>
      `).join('')}
    </div>
  `);
}

async function renderNewsFeed() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;

  feed.innerHTML = renderSkeletonCards(2, 'news');

  const stories = await API.getStories();

  if (stories === null) {
    feed.innerHTML = renderErrorState('Could not load the news feed.', 'renderNewsFeed()');
    return;
  }
  if (stories.length === 0) {
    feed.innerHTML = renderEmptyState('📰', 'No stories published yet',
      'Approved alumni stories and college announcements will appear here.');
    return;
  }

  feed.innerHTML = stories.map(n => {
    const author = n.author_name || 'DIC Press Office';
    const date = n.published_date || formatDate(n.created_at);
    return `
    <div class="news-card">
      <div class="news-banner" style="background:linear-gradient(135deg, rgba(108,99,255,0.12), rgba(0,212,170,0.08))">${escapeHtml(n.emoji || '🌟')}</div>
      <div class="news-card-body">
        <div class="news-category">${escapeHtml(n.category)}</div>
        <div class="news-title">${escapeHtml(n.title)}</div>
        <div class="news-excerpt">${escapeHtml(n.excerpt || '')}</div>
        <div class="news-footer">
          <div class="news-author">
            <div class="news-author-avatar">${escapeHtml(author.slice(0,2).toUpperCase())}</div>
            <div>
              <div style="font-weight:600">${escapeHtml(author)}</div>
              <div class="news-meta">${escapeHtml(date)}</div>
            </div>
          </div>
          <span class="moderated-badge">✓ Published</span>
        </div>
      </div>
    </div>
  `;
  }).join('');
}

async function renderSpotlightAlumni() {
  const el = document.getElementById('spotlight-alumni');
  if (!el) return;

  el.innerHTML = renderSkeletonCards(2, 'spotlight');
  const result = await API.getAlumni({ mentor: true, limit: 5 });

  if (result === null) {
    el.innerHTML = renderErrorState('Could not load alumni spotlights.', 'renderSpotlightAlumni()');
    return;
  }
  const spotlights = result.alumni;
  if (spotlights.length === 0) {
    el.innerHTML = renderEmptyState('✨', 'No mentors available yet');
    return;
  }

  el.innerHTML = spotlights.map(a => `
    <div class="spotlight-card">
      <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,${escapeHtml(a.color)}40,${escapeHtml(a.color)}20);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${escapeHtml(a.color)};flex-shrink:0">${escapeHtml(a.initials)}</div>
      <div class="spotlight-info">
        <div class="spotlight-name">${escapeHtml(a.name)}</div>
        <div class="spotlight-sub">${escapeHtml(a.company || "—")} · Batch ${escapeHtml(a.batch || "—")}</div>
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

