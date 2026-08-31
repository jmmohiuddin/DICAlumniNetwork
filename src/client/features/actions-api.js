/*
 * actions-api.js — extracted verbatim from the original app.js, lines 4889-5423.
 *
 * v2 action handlers that replace the old toast-only stubs: event
 * registration/tickets, donations (incl. settlement/receipts), mentorship
 * request/response, job apply/referral, broadcasts, and compliance DSAR
 * export/account deletion/identity-vault reveal/consent recording.
 */

/* ============================================================
   v2 ACTION HANDLERS
   Replace the toast-only stubs (buyTicket, applyJob, simulateCheckin,
   acceptRequest, sendBroadcast, exportUserData, downloadReceipt,
   decryptVaultField, showDeleteAccount, downloadEventReport …) with calls
   to the real endpoints.
   ============================================================ */

// ─── EVENT REGISTRATION & TICKETS ───

async function registerForEvent(eventId, title, isFull) {
  showToast(isFull ? '⏳ Joining the waitlist…' : '🎫 Reserving your ticket…');

  // A client mutation id makes an offline replay idempotent server-side.
  const res = await API.registerForEvent(eventId, {
    clientMutationId: `reg-${eventId}-${state.currentUser.id}-${Date.now()}`
  });

  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Registration failed.'}`); return; }

  showToast(res.status === 'waitlisted'
    ? `⏳ "${title}" is full — you are on the waitlist.`
    : `✅ Ticket confirmed for "${title}".`);

  renderEvents(state.eventFilter || 'upcoming');
  renderNotifications();
  if (res.status === 'confirmed') viewMyTicket(eventId);
}

async function cancelTicket(eventId, title) {
  if (!confirm(`Cancel your ticket for "${title}"?`)) return;
  const res = await API.cancelRegistration(eventId);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not cancel.'}`); return; }
  showToast(`✓ Ticket cancelled${res.promoted ? ' — a waitlisted alumnus was promoted.' : '.'}`);
  renderEvents(state.eventFilter || 'upcoming');
}

async function viewMyTicket(eventId) {
  const ticket = await API.getMyTicket(eventId);
  if (apiFailed(ticket) || !ticket) { showToast('⚠ No ticket found for this event.'); return; }

  showModal(`
    <div class="modal-header">
      <div class="modal-title">🎫 Your Ticket</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="text-align:center;padding:8px 0">
      <div id="ticket-qr" style="display:flex;justify-content:center;margin-bottom:14px"></div>
      <div style="font-family:monospace;font-size:15px;font-weight:800;letter-spacing:0.06em;color:var(--teal)">${escapeHtml(ticket.ticket_code)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">
        ${escapeHtml(ticket.status === 'waitlisted' ? 'Waitlisted — you will be notified if a seat opens' : 'Confirmed')}
        ${ticket.checked_in ? ' · ✅ Checked in' : ''}
      </div>
      ${Number(ticket.amount_paid) > 0
        ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Paid ৳${Number(ticket.amount_paid).toLocaleString()}${ticket.payment_gateway ? ` via ${escapeHtml(ticket.payment_gateway)}` : ''}</div>`
        : ''}
      <div style="font-size:11px;color:var(--text-muted);margin-top:14px">Present this QR code at the venue entrance.</div>
    </div>
  `);

  // Render the signed payload as a scannable QR.
  if (typeof QRCode !== 'undefined') {
    try {
      new QRCode(document.getElementById('ticket-qr'), {
        text: ticket.qr_payload, width: 168, height: 168,
        colorDark: '#0B3897', colorLight: '#ffffff'
      });
    } catch (e) {
      document.getElementById('ticket-qr').innerHTML = '<div style="font-size:52px">🎫</div>';
    }
  } else {
    document.getElementById('ticket-qr').innerHTML = '<div style="font-size:52px">🎫</div>';
  }
}

async function handleCheckIn(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('checkin-code');
  const box = document.getElementById('checkin-result');
  const code = input.value.trim();
  if (!code) return;

  const res = await API.checkInTicket(code);

  if (apiFailed(res)) {
    box.innerHTML = `<div class="state-panel state-error" style="padding:18px">
        <div class="state-title">${escapeHtml(res?.error || 'Check-in failed')}</div>
      </div>`;
    return;
  }

  box.innerHTML = `<div class="state-panel" style="padding:18px;border-color:rgba(52,211,153,0.4);background:rgba(52,211,153,0.08)">
      <div class="state-icon">✅</div>
      <div class="state-title">${escapeHtml(res.attendee)} checked in</div>
      ${res.batch ? `<div class="state-subtitle">Batch ${res.batch}</div>` : ''}
    </div>`;
  input.value = '';
  input.focus();
}

async function showAttendeesModal(eventId) {
  const rows = await API.getAttendees(eventId);
  if (apiFailed(rows)) { showToast(`⚠ ${rows?.error || 'Could not load attendees.'}`); return; }

  const confirmed = rows.filter(r => r.status === 'confirmed');
  const waitlisted = rows.filter(r => r.status === 'waitlisted');
  const checkedIn = rows.filter(r => r.checked_in).length;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">👥 Attendees</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <span class="card-badge teal">${confirmed.length} confirmed</span>
      <span class="card-badge amber">${waitlisted.length} waitlisted</span>
      <span class="card-badge">${checkedIn} checked in</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto">
      ${rows.length ? rows.map(a => `
        <div class="glass-card" style="display:flex;align-items:center;gap:10px;padding:10px 12px">
          <div class="alumni-avatar" style="width:36px;height:36px;font-size:12px;background:var(--teal);flex-shrink:0"><span>${escapeHtml(a.initials || '??')}</span></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:13px">${escapeHtml(a.name)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${escapeHtml([a.dept, a.batch && `Batch ${a.batch}`, a.company].filter(Boolean).join(' · ') || '—')}</div>
            <div style="font-size:10px;color:var(--text-muted);font-family:monospace">${escapeHtml(a.ticket_code)}</div>
          </div>
          <span class="card-badge ${a.checked_in ? 'teal' : a.status === 'waitlisted' ? 'amber' : ''}">${a.checked_in ? '✅ In' : a.status === 'waitlisted' ? 'Waitlist' : 'Confirmed'}</span>
        </div>`).join('')
      : renderEmptyState('👤', 'No registrations yet')}
    </div>
  `);
}

// ─── DONATIONS ───

async function processDonation(campaignId, campaignName) {
  const custom = document.getElementById('custom-amount');
  const amount = state.selectedAmount || (custom && parseFloat(custom.value));

  if (!amount || amount <= 0) { showToast('⚠ Please select or enter a donation amount'); return; }
  if (!state.selectedGateway) { showToast('⚠ Please select a payment gateway'); return; }

  // Phase 1: write the PENDING ledger row before contacting the gateway.
  const created = await API.createDonation({
    campaignId, amount, gateway: state.selectedGateway,
    isAnonymous: document.getElementById('donate-anonymous')?.checked || false
  });

  if (apiFailed(created)) { showToast(`⚠ ${created?.error || 'Could not start the donation.'}`); return; }

  const gwNames = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', card: 'Visa/Mastercard' };
  const gwName = gwNames[state.selectedGateway] || state.selectedGateway;
  const donation = created.donation;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔐 Authorize Payment</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="payment-step">
      <div style="font-size:44px;margin-bottom:10px">${state.selectedGateway === 'bkash' ? '📱' : state.selectedGateway === 'nagad' ? '📲' : state.selectedGateway === 'rocket' ? '🚀' : '💳'}</div>
      <div style="font-size:17px;font-weight:800;margin-bottom:6px">Authorising via ${escapeHtml(gwName)}</div>
      <div style="color:var(--text-secondary);margin-bottom:6px">Amount: <strong style="color:var(--teal)">৳${Number(amount).toLocaleString()}</strong></div>
      <div style="font-family:monospace;font-size:11px;color:var(--text-muted);margin-bottom:18px">Ref ${escapeHtml(donation.transaction_reference)}</div>
      <div style="background:var(--bg-glass);border:1px solid var(--border-glass);border-radius:var(--radius-sm);padding:16px;margin-bottom:18px">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">Enter your ${escapeHtml(gwName)} PIN</div>
        <div class="otp-inputs" style="justify-content:center">
          ${[0,1,2,3].map(() => '<input type="password" class="otp-box" maxlength="1" inputmode="numeric" />').join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-full" onclick="settleDonation(${donation.id}, true)">✓ Confirm Payment</button>
      <button class="btn btn-ghost btn-full mt-8" onclick="settleDonation(${donation.id}, false)">Simulate a failed payment</button>
      <div style="font-size:11px;color:var(--text-muted);margin-top:10px">A PENDING ledger entry has already been recorded. The campaign total updates only on confirmation.</div>
    </div>
  `);
}

async function settleDonation(donationId, success) {
  const res = await API.confirmDonation(donationId, {
    success, failureReason: success ? null : 'Simulated gateway decline'
  });

  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not settle the transaction.'}`); return; }

  const d = res.donation;

  if (d.status === 'FAILED') {
    showModal(`
      <div class="modal-header">
        <div class="modal-title">❌ Payment Failed</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="payment-step">
        <div style="font-size:44px;margin-bottom:10px">⚠️</div>
        <div style="font-size:16px;font-weight:800;margin-bottom:6px">The transaction was declined</div>
        <div style="color:var(--text-secondary);margin-bottom:8px">${escapeHtml(d.failure_reason || 'The gateway rejected the payment.')}</div>
        <div style="font-family:monospace;font-size:11px;color:var(--text-muted);margin-bottom:18px">Ref ${escapeHtml(d.transaction_reference)}</div>
        <button class="btn btn-primary btn-full" onclick="closeModal(); showPage('donations')">Try again</button>
      </div>
    `);
    renderCampaignsEnhanced();
    return;
  }

  const date = new Date(d.completed_at || Date.now()).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' });

  showModal(`
    <div class="modal-header">
      <div class="modal-title">🎉 Payment Successful</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="payment-step">
      <div class="payment-success">✅</div>
      <div class="payment-success-title">Thank you for your donation!</div>
      <div class="payment-success-sub">Your contribution has been recorded in the ledger.</div>
      <div class="receipt-preview">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;text-align:center">OFFICIAL TAX RECEIPT</div>
        <div style="font-size:11px;text-align:center;color:var(--text-muted);margin-bottom:12px">Daffodil International College Alumni Association</div>
        <div class="receipt-row"><span>Donor</span><span>${escapeHtml(d.is_anonymous ? 'Anonymous' : d.donor_name)}</span></div>
        <div class="receipt-row"><span>Receipt No.</span><span style="font-family:monospace;font-size:11px">${escapeHtml(d.receipt_code)}</span></div>
        <div class="receipt-row"><span>Transaction</span><span style="font-family:monospace;font-size:11px">${escapeHtml(d.transaction_reference)}</span></div>
        <div class="receipt-row"><span>Gateway</span><span>${escapeHtml(d.payment_gateway)}</span></div>
        <div class="receipt-row"><span>Date</span><span style="font-size:11px">${escapeHtml(date)}</span></div>
        <div class="receipt-row"><span>Amount</span><span>৳${Number(d.amount).toLocaleString()}</span></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="downloadReceipt(${d.id})">📄 Download Receipt</button>
        <button class="btn btn-outline" onclick="closeModal()">✓ Done</button>
      </div>
    </div>
  `);

  state.selectedAmount = null;
  state.selectedGateway = null;
  renderCampaignsEnhanced();
  renderDonorLeaderboard();
  renderNotifications();
}

// Generates a real downloadable receipt from the ledger row.
async function downloadReceipt(donationId) {
  const rows = await API.getMyDonations();
  if (apiFailed(rows)) { showToast('⚠ Could not load your receipt.'); return; }

  const d = rows.find(r => r.id === donationId) || rows[0];
  if (!d) { showToast('⚠ Receipt not found.'); return; }

  const lines = [
    'DAFFODIL INTERNATIONAL COLLEGE — ALUMNI ASSOCIATION',
    'OFFICIAL DONATION RECEIPT (Tax Deductible)',
    '',
    `Receipt No.      : ${d.receipt_code || '—'}`,
    `Transaction Ref  : ${d.transaction_reference}`,
    `Donor            : ${d.is_anonymous ? 'Anonymous' : d.donor_name}`,
    `Campaign         : ${d.campaign_name || '—'}`,
    `Amount           : BDT ${Number(d.amount).toLocaleString()}`,
    `Payment Gateway  : ${d.payment_gateway}`,
    `Status           : ${d.status}`,
    `Date             : ${new Date(d.completed_at || d.created_at).toLocaleString('en-GB')}`,
    '',
    'This receipt was generated from the institutional donation ledger.',
    'Verify at: alumni.dic.edu.bd/verify/' + (d.receipt_code || '')
  ];

  downloadTextFile(`DIC_Receipt_${d.receipt_code || d.id}.txt`, lines.join('\n'));
  showToast('📄 Receipt downloaded.');
}

async function deleteCampaignPrompt(id, name) {
  if (!confirm(`Delete the campaign "${name}"? Donations already recorded are retained in the ledger.`)) return;
  const res = await API.deleteCampaign(id);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not delete.'}`); return; }
  showToast('🗑 Campaign deleted.');
  renderCampaignsEnhanced();
}

// ─── MENTORSHIP ───

async function submitMentorRequest(mentorId, matchScore) {
  const subject = document.getElementById('mentor-subject')?.value.trim();
  const message = document.getElementById('mentor-message')?.value.trim();
  if (!subject) { showToast('⚠ Please describe what you need help with.'); return; }

  const res = await API.requestMentorship({ mentorId, subject, message, matchScore });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Request failed.'}`); return; }

  closeModal();
  showToast('🤝 Mentorship request sent — it expires in 5 days if unanswered.');
  renderMentorships();
  renderNotifications();
}

async function respondToMentorship(id, action) {
  const res = await API.respondMentorship(id, action);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not update the request.'}`); return; }
  const verb = { accept: 'accepted', decline: 'declined', complete: 'marked complete' }[action];
  showToast(`✓ Mentorship ${verb}.`);
  renderMentorships();
  renderNotifications();
}

// ─── JOBS ───

async function applyJob(jobId, title) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">📄 Apply — ${escapeHtml(title)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <form onsubmit="submitJobApplication(event, ${jobId})">
      <div class="input-group">
        <label class="input-label">Cover note</label>
        <textarea id="apply-note" class="form-input" rows="4" placeholder="Why are you a good fit for this role?"></textarea>
      </div>
      <div class="input-group">
        <label class="input-label">Resume / portfolio URL (optional)</label>
        <input type="url" id="apply-resume" class="form-input" placeholder="https://…" />
      </div>
      <button type="submit" class="btn btn-primary btn-full">Submit Application</button>
    </form>
  `);
}

async function submitJobApplication(e, jobId) {
  if (e) e.preventDefault();
  const res = await API.applyToJob(jobId, {
    coverNote: document.getElementById('apply-note')?.value.trim(),
    resumeUrl: document.getElementById('apply-resume')?.value.trim()
  });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Application failed.'}`); return; }
  closeModal();
  showToast('✅ Application submitted.');
  renderJobsEnhanced();
}

async function showJobApplicants(jobId, title) {
  const rows = await API.getJobApplicants(jobId);
  if (apiFailed(rows)) { showToast(`⚠ ${rows?.error || 'Could not load applicants.'}`); return; }

  showModal(`
    <div class="modal-header">
      <div class="modal-title">👥 Applicants — ${escapeHtml(title)}</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto">
      ${rows.length ? rows.map(a => `
        <div class="glass-card" style="padding:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="alumni-avatar" style="width:36px;height:36px;font-size:12px;background:var(--teal);flex-shrink:0"><span>${escapeHtml(a.initials || '??')}</span></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:13px">${escapeHtml(a.name)}</div>
              <div style="font-size:11px;color:var(--text-secondary)">${escapeHtml([a.dept, a.batch && `Batch ${a.batch}`, a.company].filter(Boolean).join(' · ') || '—')}</div>
            </div>
            <span class="card-badge">${escapeHtml(a.status)}</span>
          </div>
          ${a.cover_note ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;padding-top:8px;border-top:1px solid var(--border-glass)">${escapeHtml(a.cover_note)}</div>` : ''}
        </div>`).join('')
      : renderEmptyState('📭', 'No applications yet')}
    </div>
  `);
}

async function submitReferralRequest(jobId) {
  const message = document.getElementById('referral-message')?.value.trim();
  const res = await API.requestReferral(jobId, message);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not send the request.'}`); return; }
  closeModal();
  showToast('🤝 Referral request sent to the poster.');
}

async function deleteJobPrompt(id, title) {
  if (!confirm(`Delete the posting "${title}"?`)) return;
  const res = await API.deleteJob(id);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not delete.'}`); return; }
  showToast('🗑 Job posting deleted.');
  renderJobsEnhanced();
}

// ─── BROADCASTS ───

async function sendBroadcast() {
  const title = document.getElementById('broadcast-title')?.value.trim();
  const body = document.getElementById('broadcast-body')?.value.trim();
  const targetRole = document.getElementById('broadcast-target')?.value || 'all';
  const channels = [...document.querySelectorAll('.broadcast-channel.active')].map(c => c.dataset.channel);

  if (!title) { showToast('⚠ Enter a broadcast title.'); return; }
  if (!body) { showToast('⚠ Enter the message body.'); return; }

  const res = await API.sendBroadcastApi({ title, body, channels: channels.length ? channels : ['push'], targetRole });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Broadcast failed.'}`); return; }

  closeModal();
  showToast(`📢 Broadcast delivered to ${res.recipients} recipient${res.recipients === 1 ? '' : 's'} via ${(channels.length ? channels : ['push']).join(' + ')}.`);
  if (typeof renderBroadcastHistory === 'function') renderBroadcastHistory();
  renderNotifications();
}

// ─── COMPLIANCE: DSAR & IDENTITY VAULT ───

function downloadTextFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Downloads through fetch so the Authorization header is attached.
async function exportUserData(format = 'json') {
  showToast(`📦 Preparing your ${format.toUpperCase()} export…`);
  try {
    const res = await fetch(API.dsarExportUrl(format), {
      headers: { Authorization: `Bearer ${localStorage.getItem('dic_session_token')}` }
    });
    if (!res.ok) throw new Error('export failed');
    const text = await res.text();
    downloadTextFile(`dic_my_data.${format}`, text, format === 'csv' ? 'text/csv' : 'application/json');
    showToast('✅ Your data export has been downloaded.');
  } catch {
    showToast('⚠ Could not generate the export. Please try again.');
  }
}

async function exportProfileDSAR() {
  return exportUserData('json');
}

async function showDeleteAccount() {
  const pending = await API.getDeletionRequest();
  const hasPending = !apiFailed(pending) && pending;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">⚠ Delete Account</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    ${hasPending ? `
      <div class="state-panel" style="border-color:rgba(255,140,66,0.4);background:rgba(255,140,66,0.08)">
        <div class="state-icon">⏳</div>
        <div class="state-title">Deletion already scheduled</div>
        <div class="state-subtitle">Your account will be permanently purged on ${escapeHtml(formatDate(pending.purge_after))}. You can cancel until then.</div>
      </div>
      <button class="btn btn-primary btn-full mt-16" onclick="cancelAccountDeletion()">↩ Cancel deletion request</button>
    ` : `
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
        Under PDPA 2026 your account enters a <strong>30-day grace period</strong> before permanent deletion.
        You can cancel at any point during that window. We recommend exporting your data first.
      </p>
      <button class="btn btn-outline btn-full" onclick="exportUserData('json')">📦 Export my data first</button>
      <div class="input-group mt-16">
        <label class="input-label">Reason (optional)</label>
        <textarea id="delete-reason" class="form-input" rows="3" placeholder="Help us understand why you are leaving…"></textarea>
      </div>
      <button class="btn btn-danger btn-full" onclick="confirmAccountDeletion()">Request account deletion</button>
    `}
  `);
}

async function confirmAccountDeletion() {
  if (!confirm('Schedule your account for deletion in 30 days?')) return;
  const res = await API.requestDeletion(document.getElementById('delete-reason')?.value.trim());
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not submit the request.'}`); return; }
  closeModal();
  showToast(`⚠ Account deletion scheduled for ${formatDate(res.request.purge_after)}. You can cancel until then.`);
  renderNotifications();
}

async function cancelAccountDeletion() {
  const res = await API.cancelDeletion();
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not cancel.'}`); return; }
  closeModal();
  showToast('✓ Deletion request cancelled — your account is active.');
}

// Decrypts a real AES-256-GCM field; the reason is mandatory and audited.
async function decryptVaultField(vaultId, ownerName) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔓 Decrypt Identity Field</div>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
      Decrypting ${escapeHtml(ownerName)}'s identity data is a privileged action. Your name, the reason
      and a timestamp are written to the immutable access log.
    </p>
    <div class="input-group">
      <label class="input-label">Reason for access (required)</label>
      <input type="text" id="vault-reason" class="form-input" placeholder="e.g. Scholarship eligibility verification" required />
    </div>
    <button class="btn btn-primary btn-full" onclick="performVaultReveal(${vaultId})">🔓 Decrypt & Log Access</button>
    <div id="vault-reveal-result" class="mt-16"></div>
  `);
}

async function performVaultReveal(vaultId) {
  const reason = document.getElementById('vault-reason')?.value.trim();
  const box = document.getElementById('vault-reveal-result');

  const res = await API.revealVaultField(vaultId, reason);
  if (apiFailed(res)) {
    box.innerHTML = `<div class="state-panel state-error" style="padding:16px"><div class="state-title">${escapeHtml(res?.error || 'Decryption failed')}</div></div>`;
    return;
  }

  box.innerHTML = `
    <div class="state-panel" style="padding:18px;border-color:rgba(52,211,153,0.4);background:rgba(52,211,153,0.08)">
      <div class="state-title" style="font-family:monospace;font-size:18px;letter-spacing:0.08em">${escapeHtml(res.value)}</div>
      <div class="state-subtitle">${escapeHtml(res.fieldType.toUpperCase())} · ${escapeHtml(res.owner)} · access logged</div>
    </div>`;
  if (typeof renderAuditLog === 'function') renderAuditLog();
}

async function storeIdentityField() {
  const fieldType = document.getElementById('vault-field-type')?.value;
  const value = document.getElementById('vault-field-value')?.value.trim();
  if (!value) { showToast('⚠ Enter a value to encrypt.'); return; }

  const res = await API.storeVaultField({ fieldType, value });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not store the field.'}`); return; }
  closeModal();
  showToast(`🔐 ${fieldType.toUpperCase()} encrypted with AES-256-GCM and stored.`);
  if (typeof renderNIDVaultPanel === 'function') renderNIDVaultPanel();
}

// Records consent with IP + policy version (PDPA 2026).
async function recordConsent(consentType, granted = true) {
  const res = await API.recordConsent({ consentType, granted });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not record consent.'}`); return; }
  showToast(granted ? '✓ Consent recorded.' : '✓ Consent withdrawn.');
}

