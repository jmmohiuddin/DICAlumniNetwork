/*
 * mentorship-events.js — extracted verbatim from the original app.js, lines 1212-1372.
 *
 * Mentorship list rendering (REQ-04) and events & ticketing list rendering
 * (REQ-06), including filterEvents (original declaration — wrapped later in
 * gap-fixes-req.js).
 */

// ─── MENTORSHIP (REQ-04) ───
async function renderMentorships() {
  const list = document.getElementById('mentorship-list');
  const pending = document.getElementById('pending-requests');
  const suggested = document.getElementById('suggested-mentors');

  if (list) list.innerHTML = renderSkeletonCards(2, 'mentor');

  const [data, suggestions] = await Promise.all([API.getMentorships(), API.getMentorSuggestions()]);

  if (list) {
    if (apiFailed(data)) {
      list.innerHTML = renderErrorState(data?.error || 'Could not load mentorships.', 'renderMentorships()');
    } else {
      const active = [...data.asMentor, ...data.asMentee].filter(m => m.status === 'accepted');
      list.innerHTML = active.length ? active.map(m => {
        const isMentor = m.mentor_id === state.currentUser.id;
        const other = isMentor ? m.mentee_name : m.mentor_name;
        const initials = isMentor ? m.mentee_initials : m.mentor_initials;
        return `
        <div class="mentorship-connection">
          <div class="alumni-avatar" style="width:44px;height:44px;background:linear-gradient(135deg,rgba(108,99,255,0.3),rgba(0,212,170,0.3));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">${escapeHtml(initials || '??')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:14px">${escapeHtml(other)}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(m.subject)}</div>
          </div>
          <span class="mentorship-type-badge ${isMentor ? 'mentor' : 'mentee'}">${isMentor ? '🎓 Mentoring' : '📚 Learning'}</span>
          <button class="btn btn-ghost btn-sm" onclick="respondToMentorship(${m.id}, 'complete')">Complete</button>
        </div>`;
      }).join('') : renderEmptyState('🤝', 'No active mentorships', 'Accepted mentorship connections will appear here.');
    }
  }

  if (pending) {
    if (apiFailed(data)) {
      pending.innerHTML = '';
    } else if (data.incoming.length === 0) {
      pending.innerHTML = renderEmptyState('📭', 'No pending requests');
    } else {
      pending.innerHTML = data.incoming.map(r => {
        const daysLeft = Math.max(0, Math.ceil((new Date(r.expires_at) - Date.now()) / 86400000));
        return `
        <div class="pending-request">
          <div class="alumni-avatar" style="width:40px;height:40px;background:linear-gradient(135deg,rgba(255,140,66,0.3),rgba(192,132,252,0.2));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;">${escapeHtml(r.mentee_initials || '??')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px">${escapeHtml(r.mentee_name)}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml(r.subject)}</div>
          </div>
          <span class="expiry-badge">⏱ ${daysLeft}d left</span>
          <button class="btn btn-sm btn-primary" onclick="respondToMentorship(${r.id}, 'accept')">Accept</button>
          <button class="btn btn-sm btn-ghost" onclick="respondToMentorship(${r.id}, 'decline')">Decline</button>
        </div>`;
      }).join('');
    }
  }

  if (suggested) {
    if (apiFailed(suggestions)) {
      suggested.innerHTML = renderErrorState('Could not load mentor suggestions.', 'renderMentorships()');
    } else if (suggestions.length === 0) {
      suggested.innerHTML = renderEmptyState('✨', 'No mentor matches yet');
    } else {
      suggested.innerHTML = suggestions.map(m => `
        <div class="suggested-mentor-card">
          <div class="alumni-avatar" style="width:40px;height:40px;background:linear-gradient(135deg,${m.color || '#00A859'}40,${m.color || '#00A859'}20);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:${m.color || '#00A859'}">${escapeHtml(m.initials)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">${escapeHtml(m.name)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${escapeHtml([m.role, m.company].filter(Boolean).join(' · ') || 'DIC Alumni')}</div>
          </div>
          <span class="match-score-badge">${m.match_score}%</span>
          <button class="btn btn-sm btn-primary" onclick="showMentorModal('${escapeHtml(m.name).replace(/'/g, '&#39;')}', ${m.id}, ${m.match_score})">Request</button>
        </div>`).join('');
    }
  }
}



// ─── EVENTS & TICKETING (REQ-06) ───
// Reads from PostgreSQL, shows the signed-in user's ticket state, and drives
// registration / cancellation / QR check-in through the real endpoints.
async function renderEvents(filter = 'upcoming') {
  const containers = renderTargets('events-grid');
  if (!containers.length) return;
  const container = { set innerHTML(v) { containers.forEach(c => c.innerHTML = v); } };

  if (filter === 'checkin') {
    container.innerHTML = `
      <div class="glass-card" style="grid-column:1/-1;padding:28px">
        <div style="text-align:center;font-size:44px;margin-bottom:12px">📷</div>
        <div style="text-align:center;font-size:19px;font-weight:800;margin-bottom:6px">QR Check-In Scanner</div>
        <div style="text-align:center;color:var(--text-secondary);margin-bottom:20px">Scan or type an attendee ticket code to check them in.</div>
        <form onsubmit="handleCheckIn(event)" style="max-width:420px;margin:0 auto">
          <div class="input-group">
            <label class="input-label">Ticket Code</label>
            <input type="text" id="checkin-code" class="form-input" placeholder="DIC-TKT-XXXXX-XXXXXX" autocomplete="off" required />
          </div>
          <button type="submit" class="btn btn-primary btn-full">✓ Check In Attendee</button>
        </form>
        <div id="checkin-result" style="max-width:420px;margin:16px auto 0"></div>
      </div>`;
    return;
  }

  container.innerHTML = renderSkeletonCards(3, 'event');
  const events = await API.getEvents();

  if (apiFailed(events)) {
    container.innerHTML = renderErrorState(events?.error || 'Could not load events.', `renderEvents('${filter}')`);
    return;
  }

  const list = events.filter(e => filter === 'past' ? e.status === 'past' : e.status !== 'past');

  if (list.length === 0) {
    container.innerHTML = renderEmptyState('📅',
      filter === 'past' ? 'No past events' : 'No upcoming events',
      filter === 'past' ? 'Completed events will be archived here.' : 'New events will appear here once published.');
    return;
  }

  const canManage = state.currentUser && ['super_admin', 'univ_admin', 'dept_admin', 'moderator'].includes(state.currentUser.role);

  container.innerHTML = list.map(e => {
    const registered = e.registered_live ?? e.registered_count ?? 0;
    const pct = e.capacity ? Math.min(100, Math.round((registered / e.capacity) * 100)) : 0;
    const full = registered >= e.capacity;
    return `
    <div class="event-card">
      <div class="event-card-banner" style="background: linear-gradient(135deg, rgba(108,99,255,0.15), rgba(0,212,170,0.1))">
        ${escapeHtml(e.emoji || '🎓')}
        <span class="event-status ${full ? 'sold-out' : e.status}">${full ? '🔴 Full' : '🟢 Open'}</span>
      </div>
      <div class="event-card-body">
        <div style="font-size:10px;font-weight:700;color:var(--primary-light);margin-bottom:4px;text-transform:uppercase">${escapeHtml(e.type || 'Event')}</div>
        <div class="event-title">${escapeHtml(e.title)}</div>
        <div class="event-meta">📅 ${escapeHtml(e.event_date || 'TBA')}${e.event_time ? ` · ${escapeHtml(e.event_time)}` : ''}</div>
        <div class="event-meta">📍 ${escapeHtml(e.venue)}</div>
        <div class="event-capacity-track"><div class="event-capacity-fill" style="width:${pct}%"></div></div>
        <div class="event-capacity-meta">
          <span>${registered.toLocaleString()} / ${Number(e.capacity).toLocaleString()} registered</span>
          <span>${escapeHtml(e.price || 'Free')}</span>
        </div>
        <div class="event-card-actions">
          ${e.is_registered
            ? `<button class="btn btn-outline btn-sm" onclick="viewMyTicket(${e.id})">🎫 View Ticket</button>
               <button class="btn btn-ghost btn-sm" onclick="cancelTicket(${e.id}, '${escapeHtml(e.title).replace(/'/g, '&#39;')}')">Cancel</button>`
            : `<button class="btn btn-primary btn-sm" onclick="registerForEvent(${e.id}, '${escapeHtml(e.title).replace(/'/g, '&#39;')}', ${full})">${full ? '⏳ Join Waitlist' : '🎫 Get Ticket'}</button>`}
          ${canManage ? `<button class="btn btn-ghost btn-sm" onclick="showAttendeesModal(${e.id})">👥 Attendees</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterEvents(filter, btn) {
  document.querySelectorAll('#public-events-view .events-tabs .chart-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderEvents(filter);
}

