/*
 * profile-editor.js — extracted verbatim from the original app.js, lines 6254-6352.
 *
 * Profile option constants (blood group/occupation/HSC group/version) and the
 * full profile editor modal (v2) with its save handler. (The rest of the profile
 * hub lives separately in profile-community.js — see app.js:4225-4888.)
 */

/* ============================================================
   PROFILE EDITOR — includes the fields added for the reunion CSV:
   Blood Group, Occupation, Current Organization / Institution,
   Current Designation, HSC Passing Year / Group / Version.
   ============================================================ */

const BLOOD_GROUP_OPTIONS = ['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown','Prefer not to say'];
const OCCUPATION_OPTIONS = ['Student','Job','Business','Others'];
const HSC_GROUP_OPTIONS = ['Science','Business Studies','Humanities'];
const HSC_VERSION_OPTIONS = ['Bangla','English'];

async function showEditProfileV2() {
  const p = await API.getMyProfile();
  if (apiFailed(p)) { showToast(`⚠ ${p?.error || 'Could not load your profile.'}`); return; }

  const sel = (id, label, options, value, allowBlank = true) => `
    <div class="input-group">
      <label class="input-label">${escapeHtml(label)}</label>
      <select id="${id}" class="form-select">
        ${allowBlank ? `<option value="">Not specified</option>` : ''}
        ${options.map(o => `<option ${String(value) === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
      </select>
    </div>`;

  const txt = (id, label, value, type = 'text', placeholder = '') => `
    <div class="input-group">
      <label class="input-label">${escapeHtml(label)}</label>
      <input type="${type}" id="${id}" class="form-input" placeholder="${escapeHtml(placeholder)}"
             value="${escapeHtml(value ?? '')}" />
    </div>`;

  showModal(`
    <div class="modal-header">
      <div class="modal-title">✏️ Edit My Profile</div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>
    </div>
    <form onsubmit="handleSaveProfileV2(event)">
      <div class="modal-section-title">Identity</div>
      ${txt('pf-name', 'Full Name', p.full_name)}
      ${txt('pf-mobile', 'Mobile Number', p.mobile_number, 'tel', '01XXXXXXXXX')}
      ${sel('pf-bloodGroup', 'Blood Group', BLOOD_GROUP_OPTIONS, p.blood_group)}

      <div class="modal-section-title mt-16">Academic</div>
      <div class="field-grid-2">
        ${txt('pf-hscPassingYear', 'HSC Passing Year / Batch', p.passing_year, 'number')}
        ${sel('pf-hscGroup', 'HSC Group', HSC_GROUP_OPTIONS, p.hsc_group)}
      </div>
      ${sel('pf-hscVersion', 'HSC Version', HSC_VERSION_OPTIONS, p.hsc_version)}

      <div class="modal-section-title mt-16">Professional</div>
      ${sel('pf-occupation', 'Occupation', OCCUPATION_OPTIONS, p.occupation)}
      ${txt('pf-organization', 'Current Organization / Institution', p.current_company, 'text', 'e.g. NZ Tex Group')}
      ${txt('pf-designation', 'Current Designation', p.job_title, 'text', 'e.g. AGM')}

      <div class="modal-section-title mt-16">Contact &amp; Links</div>
      ${txt('pf-presentAddress', 'Present Address', p.present_address)}
      ${txt('pf-facebook', 'Facebook Profile Link', p.facebook, 'url')}
      ${txt('pf-linkedin', 'LinkedIn', p.linkedin, 'url')}

      <div class="login-error hidden" id="pf-error" role="alert"></div>
      <button type="submit" class="btn btn-primary btn-full mt-16">Save Profile</button>
    </form>
  `);
}

async function handleSaveProfileV2(e) {
  if (e) e.preventDefault();
  const v = (id) => document.getElementById(id)?.value ?? '';

  const res = await API.updateMyProfile({
    name: v('pf-name'),
    mobile: v('pf-mobile'),
    bloodGroup: v('pf-bloodGroup'),
    hscPassingYear: v('pf-hscPassingYear'),
    hscGroup: v('pf-hscGroup'),
    hscVersion: v('pf-hscVersion'),
    occupation: v('pf-occupation'),
    organization: v('pf-organization'),
    designation: v('pf-designation'),
    presentAddress: v('pf-presentAddress'),
    facebook: v('pf-facebook'),
    linkedin: v('pf-linkedin')
  });

  if (apiFailed(res)) {
    const err = document.getElementById('pf-error');
    if (err) { err.textContent = res?.error || 'Could not save.'; err.classList.remove('hidden'); }
    return;
  }

  closeModal();
  showToast('✅ Profile updated.');
  if (state.currentUser && v('pf-name')) state.currentUser.name = v('pf-name').trim();
  updateUserUI();
  if (typeof render10SectionProfile === 'function') render10SectionProfile();
  renderAlumniGrid();
}

function showEditProfile() { return showEditProfileV2(); }
