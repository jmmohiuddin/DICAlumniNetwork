/*
 * bulk-import-parsing.js — extracted verbatim from the original app.js, lines 5937-6138.
 *
 * Client-side CSV parsing/validation for bulk import: field/header-rule
 * definitions, auto-mapping, RFC 4180 parser, email/blood-group normalizers,
 * file selection, mapping, and row validation. (Import wizard UI lives
 * separately in bulk-import.js — see app.js:3818-4224.)
 */

/* ============================================================
   BULK IMPORT — REAL CSV PARSING
   Replaces simulateFileUploadProcess(), which ignored the chosen file and
   returned 12 hardcoded rows. This reads the actual file, parses it to
   RFC 4180, auto-maps headers, and validates before anything is sent.
   ============================================================ */

// Canonical system fields the importer can populate. `ignore` marks columns
// that must never reach a profile.
const IMPORT_FIELDS = [
  { key: 'ignore',         label: '— Do not import —' },
  { key: 'name',           label: 'Full Name',                       required: true },
  { key: 'email',          label: 'Email Address',                   required: true },
  { key: 'mobile',         label: 'Mobile Number' },
  { key: 'hscPassingYear', label: 'HSC Passing Year / Batch' },
  { key: 'hscGroup',       label: 'HSC Group' },
  { key: 'hscVersion',     label: 'HSC Version' },
  { key: 'bloodGroup',     label: 'Blood Group' },
  { key: 'presentAddress', label: 'Present Address' },
  { key: 'occupation',     label: 'Occupation' },
  { key: 'organization',   label: 'Current Organization / Institution' },
  { key: 'designation',    label: 'Current Designation' },
  { key: 'photoUrl',       label: 'Profile Photo URL' },
  { key: 'facebook',       label: 'Facebook Profile Link' }
];

// Header patterns -> system field. Anything unmatched defaults to "do not
// import", so a new column can never silently land in the wrong place.
const HEADER_RULES = [
  [/^timestamp$/i,                                   'ignore'],
  [/^comm?[ui]nicate\s*with$/i,                      'ignore'],  // CSV header is misspelled "Commicate with"
  [/^(full\s*)?name$/i,                              'name'],
  [/e-?mail/i,                                       'email'],
  [/(mobile|phone|contact\s*number)/i,               'mobile'],
  [/hsc.*(pass|year|batch)|(^|\s)batch(\s|$)/i,      'hscPassingYear'],
  [/^group\s*$|hsc\s*group/i,                        'hscGroup'],
  [/version|medium/i,                                'hscVersion'],
  [/blood/i,                                         'bloodGroup'],
  [/(present|current)\s*address|^address$/i,         'presentAddress'],
  [/occupation|profession/i,                         'occupation'],
  [/institution|organization|organisation|company|workplace/i, 'organization'],
  [/designation|job\s*title|position/i,              'designation'],
  [/photo|image|picture/i,                           'photoUrl'],
  [/facebook|fb\s*profile/i,                         'facebook']
];

function autoMapHeader(header) {
  const h = (header || '').trim();
  for (const [pattern, field] of HEADER_RULES) if (pattern.test(h)) return field;
  return 'ignore';
}

// RFC 4180 parser: handles quoted fields, embedded commas/newlines and "" escapes.
function parseCSVText(text) {
  const rows = [];
  let row = [], cur = '', quoted = false;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // strip BOM

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c === '\r') { /* handled by \n */ }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

// Mirrors the server normaliser so the preview shows what will actually be stored.
function sanitizeEmailClient(raw) {
  if (!raw) return null;
  let s = String(raw).trim().toLowerCase().replace(/[\u00a0\s]+/g, " ");
  const tokens = s.split(" ").filter(Boolean);
  const token = tokens.find(t => t.includes("@"));
  const looksValid = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v || "");
  if (token && tokens.length > 1 && looksValid(token)) return token;
  s = s.replace(/\s+/g, "").replace(/^mailto:/, "").replace(/[,;]+$/, "");
  return s || null;
}

function normalizeBloodGroupClient(raw) {
  if (!raw || !String(raw).trim()) return null;
  let s = String(raw).trim().toUpperCase().replace(/[()'`.\s]/g, '');
  s = s.replace(/POSSATIVE|POSITIVE|POSITIVR|POSTIVE|POS(?![A-Z])|PLUS/g, '+')
       .replace(/NEGATIVE|NEGETIVE|NEG(?![A-Z])|MINUS/g, '-')
       .replace(/VE$/, '')
       .replace(/^0/, 'O')
       .replace(/ABB/g, 'AB')
       .replace(/\++/g, '+').replace(/-+/g, '-');
  const letters = (s.match(/AB|A|B|O/) || [])[0];
  if (!letters) return 'Unknown';
  const sign = s.includes('+') ? '+' : (s.includes('-') ? '-' : null);
  if (!sign) return 'Unknown';   // never guess a rhesus factor
  const candidate = letters + sign;
  return ['A+','A-','B+','B-','AB+','AB-','O+','O-'].includes(candidate) ? candidate : 'Unknown';
}

function handleImportFileSelected(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  if (!/\.(csv|txt)$/i.test(file.name)) {
    showToast('⚠ Please choose a .csv file. XLSX is not supported yet — export it to CSV first.');
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => showToast('⚠ Could not read the file.');
  reader.onload = () => {
    try {
      const rows = parseCSVText(String(reader.result));
      if (rows.length < 2) { showToast('⚠ The file has no data rows.'); return; }

      currentImportState.filename = file.name;
      currentImportState.headers = rows[0].map(h => h.trim());
      currentImportState.rawRows = rows.slice(1);
      currentImportState.totalRows = rows.length - 1;
      currentImportState.mapping = currentImportState.headers.map(autoMapHeader);
      currentImportState.step = 'mapping';

      renderBulkImportPanel();
      showToast(`📄 Parsed "${file.name}" — ${currentImportState.totalRows} rows, ${currentImportState.headers.length} columns.`);
    } catch (e) {
      showToast('⚠ Could not parse the CSV: ' + e.message);
    }
  };
  reader.readAsText(file);
}

function setImportMapping(colIndex, fieldKey) {
  currentImportState.mapping[colIndex] = fieldKey;
  renderBulkImportPanel();
}

// Applies the mapping, then validates and classifies every row.
function validateImportRows() {
  const { headers, rawRows, mapping } = currentImportState;
  const valid = [], invalid = [], duplicates = [];
  const seenEmail = new Set(), seenMobile = new Set();

  rawRows.forEach((cells, i) => {
    const rec = { row: i + 2 };   // +2: 1-based, and row 1 is the header
    mapping.forEach((field, col) => {
      if (field === 'ignore') return;
      rec[field] = (cells[col] || '').trim();
    });

    // Maximum-retention policy: blank optional fields are stored as NULL and
    // never block a row. Only a record that cannot be identified or saved at
    // all is rejected — email is UNIQUE NOT NULL and is the login identifier.
    rec.emailRaw = rec.email;
    rec.email = sanitizeEmailClient(rec.email) || '';

    // A non-4-digit year is dropped rather than failing the row.
    if (rec.hscPassingYear && !/^\d{4}$/.test(rec.hscPassingYear)) {
      rec.hscPassingYearRaw = rec.hscPassingYear;
      rec.hscPassingYear = '';
    }

    const errors = [];
    if (!rec.name) errors.push('Missing name — cannot identify the person');
    if (!rec.email) errors.push('Missing email — required as the unique login identifier');
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(rec.email))
      errors.push('Email could not be recovered: "' + rec.emailRaw + '"');

    if (errors.length) { invalid.push({ ...rec, errorMsg: errors.join(' · ') }); return; }

    // Count blanks for the import summary.
    rec._missing = ['mobile','hscPassingYear','hscGroup','hscVersion','bloodGroup',
                    'presentAddress','occupation','organization','designation',
                    'photoUrl','facebook'].filter(f => !rec[f] || !String(rec[f]).trim());

    const emailKey = rec.email.toLowerCase();
    const mobileKey = (rec.mobile || '').replace(/\D/g, '').slice(-10);
    if (seenEmail.has(emailKey) || (mobileKey && seenMobile.has(mobileKey))) {
      // Same person submitted twice. Keep the later row so its data can enrich
      // the existing profile rather than being thrown away.
      duplicates.push({ ...rec, errorMsg: 'Same person as an earlier row (merged, not discarded)' });
      return;
    }
    seenEmail.add(emailKey);
    if (mobileKey) seenMobile.add(mobileKey);

    rec.bloodGroupNormalized = normalizeBloodGroupClient(rec.bloodGroup);
    valid.push(rec);
  });

  currentImportState.validRecords = valid;
  currentImportState.invalidRecords = invalid;
  currentImportState.duplicateRecords = duplicates;
  currentImportState.step = 2;
  renderBulkImportPanel();
  showToast(`🔍 Validated: ${valid.length} valid · ${duplicates.length} duplicates · ${invalid.length} errors`);
}

