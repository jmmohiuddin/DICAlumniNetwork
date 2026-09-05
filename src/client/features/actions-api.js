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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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

// campaignName was an unused second parameter. Passing it required embedding an
// admin-controlled string in an inline onclick, which was an XSS sink; the name
// is not needed here, so the parameter is gone. See showDonateModal.
async function processDonation(campaignId) {
  const custom = document.getElementById('custom-amount');
  const amount = state.selectedAmount || (custom && parseFloat(custom.value));

  if (!amount || amount <= 0) { showToast('⚠ Please select or enter a donation amount'); return; }
  if (!state.selectedGateway) { showToast('⚠ Please choose how you will send the payment'); return; }

  const created = await API.createDonation({
    campaignId, amount, gateway: state.selectedGateway,
    isAnonymous: document.getElementById('donate-anonymous')?.checked || false
  });

  if (apiFailed(created)) { showToast(`⚠ ${created?.error || 'Could not record the pledge.'}`); return; }

  const gwNames = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', card: 'Card / Bank' };
  const gwName = gwNames[state.selectedGateway] || state.selectedGateway;
  const donation = created.donation;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">Confirm your pledge</div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
    </div>
    <div class="payment-step">
      <div style="font-size:15px;font-weight:700;margin-bottom:6px">Pledging ৳${Number(amount).toLocaleString()}</div>
      <div style="color:var(--text-secondary);margin-bottom:6px">You intend to pay by <strong>${escapeHtml(gwName)}</strong></div>
      <div style="font-family:monospace;font-size:11px;color:var(--text-muted);margin-bottom:18px">Ref ${escapeHtml(donation.transaction_reference)}</div>

      <div class="pledge-notice">
        <strong>This does not take a payment.</strong>
        The alumni office will contact you with the account details, and your
        pledge is marked received only once the college has confirmed the money
        arrived. Nothing is charged here and no card or wallet details are asked for.
      </div>

      <button class="btn btn-primary btn-full mt-8" onclick="confirmPledge(${donation.id})">Confirm pledge</button>
      <button class="btn btn-ghost btn-full mt-8" onclick="confirmPledge(${donation.id}, false)">Cancel this pledge</button>
    </div>
  `);
}

/* Confirm or withdraw a pledge.
 *
 * This replaced settleDonation(donationId, success), which posted the outcome
 * the browser chose: clicking "Confirm Payment" after typing four digits into a
 * fake PIN box marked the donation SUCCESS, so any signed-in user could record
 * themselves a settled gift of any amount with no money moving. The server no
 * longer accepts that — a pledge reaches SUCCESS only through
 * POST /api/donations/:id/settle, which requires a finance-capable staff role
 * and a real-world transaction reference — and this UI no longer pretends
 * otherwise.
 */
async function confirmPledge(donationId, standing = true) {
  const res = await API.confirmDonation(donationId, {
    success: standing,
    failureReason: standing ? null : 'Withdrawn by donor'
  });

  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not update the pledge.'}`); return; }

  const d = res.donation;

  if (d.status === 'FAILED') {
    closeModal();
    showToast('Pledge cancelled.');
    renderCampaignsEnhanced();
    return;
  }

  showModal(`
    <div class="modal-header">
      <div class="modal-title">Pledge recorded</div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
    </div>
    <div class="payment-step">
      <div class="payment-success">🤝</div>
      <div class="payment-success-title">Thank you — your pledge is recorded</div>
      <div class="payment-success-sub">
        It is awaiting confirmation by the alumni office. The campaign total
        will include it once the payment has been received and verified.
      </div>
      <div class="receipt-preview">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;text-align:center">PLEDGE ACKNOWLEDGEMENT</div>
        <div style="font-size:11px;text-align:center;color:var(--text-muted);margin-bottom:12px">
          Daffodil International College Alumni Association<br />
          Not a tax receipt — a receipt is issued after the payment is confirmed.
        </div>
        <div class="receipt-row"><span>Donor</span><span>${escapeHtml(d.is_anonymous ? 'Anonymous' : d.donor_name)}</span></div>
        <div class="receipt-row"><span>Reference</span><span style="font-family:monospace;font-size:11px">${escapeHtml(d.transaction_reference)}</span></div>
        <div class="receipt-row"><span>Intended method</span><span>${escapeHtml(d.payment_gateway)}</span></div>
        <div class="receipt-row"><span>Amount</span><span>৳${Number(d.amount).toLocaleString()}</span></div>
        <div class="receipt-row"><span>Status</span><span>Awaiting confirmation</span></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-outline" onclick="closeModal()">Done</button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
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


// ─── STAFF: PLEDGE SETTLEMENT ────────────────────────────────
/* The other half of the pledge model.
 *
 * Donations now stay PENDING until a finance-capable staff member states the
 * money arrived and cites the real-world transaction it arrived under. Without
 * this screen that state would be unreachable from the product, so every gift
 * would sit pending forever and campaign totals would never move — which is
 * why it ships alongside the donor-side change rather than after it.
 */
async function renderPendingPledges() {
  const host = document.getElementById('pending-pledges');
  if (!host) return;

  const rows = await API.getPendingDonations();
  if (apiFailed(rows)) {
    host.innerHTML = '<div class="queue-empty">Could not load pending pledges.</div>';
    return;
  }
  if (!rows.length) {
    host.innerHTML = '<div class="queue-empty">No pledges are awaiting confirmation.</div>';
    return;
  }

  host.innerHTML = rows.map(d => {
    const age = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000);
    return `
    <div class="queue-item">
      <div class="queue-info">
        <div class="queue-name">৳${Number(d.amount).toLocaleString()} — ${escapeHtml(d.donor_name || 'Unknown donor')}</div>
        <div class="queue-sub">${escapeHtml([d.campaign_name, 'via ' + d.payment_gateway, d.transaction_reference,
          age === 0 ? 'today' : age + ' day' + (age === 1 ? '' : 's') + ' ago'].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="queue-actions">
        <button class="approve-btn" onclick="showSettlePledgeModal(${Number(d.id)})">Mark received</button>
      </div>
    </div>`;
  }).join('');
}

function showSettlePledgeModal(donationId) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">Confirm a pledge was received</div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
    </div>
    <div class="pledge-notice">
      You are recording that this money actually reached the college. This
      credits the campaign total and issues the donor's receipt, and it is
      written to the audit log against your account.
    </div>
    <div class="input-group mt-16">
      <label class="input-label" for="settle-reference">Transaction reference</label>
      <input type="text" id="settle-reference" class="form-input" maxlength="120"
             placeholder="bKash TrxID, bank slip no., or receipt book no." />
    </div>
    <div class="input-group">
      <label class="input-label" for="settle-method">How it was received</label>
      <select id="settle-method" class="form-select">
        <option value="bkash">bKash</option>
        <option value="nagad">Nagad</option>
        <option value="rocket">Rocket</option>
        <option value="bank">Bank transfer</option>
        <option value="cash">Cash / in person</option>
        <option value="cheque">Cheque</option>
      </select>
    </div>
    <div class="input-group">
      <label class="input-label" for="settle-note">Note (optional)</label>
      <input type="text" id="settle-note" class="form-input" maxlength="500" placeholder="Anything worth recording" />
    </div>
    <button class="btn btn-primary btn-full" onclick="submitPledgeSettlement(${Number(donationId)}, 'received')">Confirm received</button>
    <button class="btn btn-ghost btn-full mt-8" onclick="submitPledgeSettlement(${Number(donationId)}, 'failed')">Close as uncollectable</button>
  `);
}

async function submitPledgeSettlement(donationId, outcome) {
  const reference = (document.getElementById('settle-reference')?.value || '').trim();
  const method = document.getElementById('settle-method')?.value || null;
  const note = (document.getElementById('settle-note')?.value || '').trim() || null;

  // The server enforces this too; checking here just saves a round trip and
  // gives the message next to the field it belongs to.
  if (outcome === 'received' && reference.length < 4) {
    showToast('⚠ A transaction reference is required to mark a pledge received');
    return;
  }

  const res = await API.settleDonationApi(donationId, { reference, method, note, outcome });
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not settle that pledge.'}`); return; }

  closeModal();
  showToast(outcome === 'received' ? '✅ Pledge confirmed and receipt issued' : 'Pledge closed as uncollectable');
  renderPendingPledges();
  renderCampaignsEnhanced();
  renderDonorLeaderboard();
}

/* Donations page headline figures, from live ledger data.
 *
 * Also decides whether the staff settlement queue is visible. That check is a
 * convenience only — GET /api/donations/pending and POST /api/donations/:id/
 * settle are both gated server-side by role, so hiding the panel is not what
 * protects it.
 */
async function renderGivingStats() {
  const s = await API.getPlatformStats();
  if (apiFailed(s)) return;

  const taka = n => n >= 100000
    ? '৳' + (n / 100000).toFixed(1) + 'L'
    : '৳' + Math.round(n).toLocaleString();
  const put = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  put('giving-raised', taka(s.fundsRaised));
  put('giving-donors', Number(s.totalDonors).toLocaleString());
  put('giving-average', s.totalDonors ? taka(s.averageGift) : '—');
  put('giving-pledged', taka(s.pledgedAwaitingConfirmation));

  const isStaff = ['super_admin', 'univ_admin'].includes(state.currentUser?.role);
  const card = document.getElementById('pending-pledges-card');
  if (card) card.classList.toggle('hidden', !isStaff);
  if (!isStaff) return;

  const count = document.getElementById('pending-pledges-count');
  if (count) {
    count.textContent = s.pledgeCount === 1 ? '1 pledge' : `${s.pledgeCount} pledges`;
    count.hidden = s.pledgeCount === 0;
  }
  renderPendingPledges();
}

// ─── RESUME UPLOAD (REQ-07) ──────────────────────────────────
/* The drop zone in the Job Board sidebar has always called
 * triggerResumeUpload(), and the function has never existed — it is the one
 * entry in tools/known-issues.json, a dead click since the page was written.
 * There was also nowhere to put a file: no upload endpoint and no storage.
 *
 * Both halves exist now. Files go to POST /api/resumes as a raw body, stored
 * as bytea (the deployment target has an ephemeral filesystem and no
 * object-storage SDK is permitted), and the server decides the type from the
 * file's magic bytes rather than its extension or declared Content-Type.
 *
 * The file is stored, not read: no resume parsing happens anywhere, because
 * no parser can be added within this project's four-dependency budget.
 */
const RESUME_MAX_BYTES = 1024 * 1024;

function triggerResumeUpload() {
  const input = document.getElementById('resume-input');
  if (input) input.click();
}

async function uploadResumeFile(file) {
  if (!file) return;

  // Checked here as well as on the server so the user finds out before
  // spending upload bandwidth on a connection this product assumes is poor.
  if (file.size > RESUME_MAX_BYTES) {
    showToast(`⚠ That file is ${Math.round(file.size / 1024)} KB. The limit is 1 MB.`);
    return;
  }
  if (file.size === 0) { showToast('⚠ That file is empty.'); return; }

  showToast('Uploading your resume…');
  const res = await API.uploadResume(file);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not upload that file.'}`); return; }

  showToast('✅ Resume uploaded');
  const input = document.getElementById('resume-input');
  if (input) input.value = '';   // so re-picking the same file fires onchange
  renderResumeList();
}

async function renderResumeList() {
  const host = document.getElementById('resume-list');
  if (!host) return;

  const rows = await API.getMyResumes();
  if (apiFailed(rows)) { host.innerHTML = ''; return; }
  if (!rows.length) {
    host.innerHTML = '<div class="card-hint">No resume uploaded yet.</div>';
    return;
  }

  host.innerHTML = rows.map(r => `
    <div class="resume-file-row">
      <div class="resume-file-info">
        <div class="resume-file-name">${escapeHtml(r.filename)}</div>
        <div class="resume-file-meta">${Math.round(r.byte_size / 1024)} KB · ${escapeHtml(new Date(r.created_at).toLocaleDateString('en-GB'))}</div>
      </div>
      <button class="btn btn-sm btn-ghost" onclick="deleteResumeFile(${Number(r.id)})">Remove</button>
    </div>`).join('');
}

async function deleteResumeFile(id) {
  if (!confirm('Remove this resume?')) return;
  const res = await API.deleteResume(id);
  if (apiFailed(res)) { showToast(`⚠ ${res?.error || 'Could not remove that file.'}`); return; }
  showToast('Resume removed');
  renderResumeList();
}

/* Enter/Space on the resume drop zone.
 *
 * A named function rather than an inline `if (...)`: the handler checker reads
 * the first identifier in an on* attribute as the handler name, so an inline
 * conditional registers a handler literally called "if" and fails the build.
 * It also keeps the div operable from the keyboard, which a bare onclick is not.
 */
function resumeZoneKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    triggerResumeUpload();
  }
}
