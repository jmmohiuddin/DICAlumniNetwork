/*
 * bulk-import.js — extracted verbatim from the original app.js, lines 3818-4224.
 *
 * Bulk user import & automatic profile creation engine: import history, wizard
 * state, sample/error CSV downloads, wizard step rendering, reset, and the
 * execute-import submission. (CSV parsing/validation lives separately in
 * bulk-import-parsing.js — see app.js:5937-6138.)
 */

// ─── 4. BULK USER IMPORT & AUTOMATIC PROFILE CREATION ENGINE ──
// Import audit rows, loaded from PostgreSQL by loadImportHistory().
let importHistory = [];

// Fetches the audit trail then re-renders the panel with the real rows.
async function loadImportHistory() {
  const rows = await API.getImportHistory();
  if (rows === null) return;
  importHistory = rows;
  renderBulkImportPanel();
}

let currentImportState = {
  step: 1,
  filename: '',
  strategy: 'no-password',
  dupResolution: 'update',   // retain data by enriching existing profiles
  totalRows: 0,
  headers: [],        // raw CSV header cells
  rawRows: [],        // raw CSV data cells
  mapping: [],        // per-column system field key (or 'ignore')
  validRecords: [],
  invalidRecords: [],
  duplicateRecords: [],
  lastResult: null
};

function downloadSampleImportCSV() {
  const headers = [
    'FullName', 'StudentID', 'RollNumber', 'RegistrationNumber', 'Batch', 'PassingYear', 'Department', 'Program', 'Section',
    'CGPA', 'CurrentStatus', 'Degree', 'GraduationDate', 'CurrentCompany', 'JobTitle', 'Industry', 'EmploymentStatus',
    'YearsExperience', 'Skills', 'LinkedIn', 'Portfolio', 'Email', 'MobileNumber', 'AltPhone', 'DateOfBirth', 'Gender',
    'BloodGroup', 'PresentAddress', 'PermanentAddress', 'Hometown', 'District', 'Country', 'Facebook', 'GitHub', 'Twitter',
    'EmergencyName', 'EmergencyPhone', 'EmergencyRelation', 'AreasOfExpertise', 'CanMentor', 'LookingForJob', 'Hiring', 'Networking'
  ];
  
  const sampleRow1 = [
    'Rafiqul Islam', 'DIC-2020-101', '101', 'REG-2020-001', '2020', '2020', 'CSE', 'BSc CSE', 'A',
    '3.85', 'Alumni', 'BSc CSE', '2020-12-15', 'Brain Station 23', 'Software Engineer', 'Technology', 'Full-time',
    '4', 'React; Node.js; AWS', 'https://linkedin.com/in/rafiqul', 'https://rafiqul.dev', 'rafiqul@gmail.com', '+8801711223344', '+8801811223344', '1998-05-12', 'Male',
    'O+', 'Dhanmondi, Dhaka', 'Comilla', 'Comilla', 'Dhaka', 'Bangladesh', 'https://fb.com/rafiqul', 'https://github.com/rafiqul', 'https://x.com/rafiqul',
    'Abul Islam', '+8801911223344', 'Father', 'Software Architecture; Cloud', 'Yes', 'No', 'Yes', 'Yes'
  ];

  const sampleRow2 = [
    'Nusrat Jahan Rima', 'DIC-2020-102', '102', 'REG-2020-002', '2020', '2020', 'SWE', 'BSc SWE', 'B',
    '3.92', 'Alumni', 'BSc SWE', '2020-12-15', 'Pathao', 'Data Analyst', 'Tech', 'Full-time',
    '3', 'Python; SQL; Tableau', 'https://linkedin.com/in/nusrat', 'https://nusrat.io', 'nusrat.rima@gmail.com', '+8801722334455', '', '1999-02-20', 'Female',
    'AB+', 'Gulshan, Dhaka', 'Noakhali', 'Noakhali', 'Dhaka', 'Bangladesh', '', 'https://github.com/nusrat', '',
    'Mariam Begum', '+8801922334455', 'Mother', 'Data Science; Machine Learning', 'Yes', 'Yes', 'No', 'Yes'
  ];

  const csvContent = "data:text/csv;charset=utf-8," 
    + headers.join(",") + "\n" 
    + sampleRow1.join(",") + "\n" 
    + sampleRow2.join(",");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "sample_alumni_import_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('📥 Downloaded sample_alumni_import_template.csv');
}

function renderBulkImportPanel() {
  const el = document.getElementById('bulk-import-panel');
  if (!el) return;

  el.innerHTML = `
    <div class="glass-card">
      <div class="card-header">
        <div>
          <h3 class="card-title">📥 Bulk User Import &amp; Automatic Profile Generation</h3>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:2px">Upload CSV or Excel files to import hundreds of student/alumni records simultaneously with automated login accounts &amp; email notifications.</p>
        </div>
        <button class="btn btn-outline btn-sm" onclick="downloadSampleImportCSV()">📄 Download CSV Template</button>
      </div>

      <!-- WIZARD STEPS INDICATOR -->
      <div class="import-wizard-steps">
        <div class="wizard-step-item ${currentImportState.step === 1 ? 'active' : ''}">
          <span class="wizard-step-num">1</span> 📁 Upload File
        </div>
        <div class="wizard-step-item ${currentImportState.step === 2 ? 'active' : ''}">
          <span class="wizard-step-num">2</span> 🔍 Validation Engine
        </div>
        <div class="wizard-step-item ${currentImportState.step === 3 ? 'active' : ''}">
          <span class="wizard-step-num">3</span> ⚡ Preview &amp; Duplicates
        </div>
        <div class="wizard-step-item ${currentImportState.step === 4 ? 'active' : ''}">
          <span class="wizard-step-num">4</span> 🎉 Accounts Created
        </div>
      </div>

      <div id="wizard-step-container">
        ${renderWizardStepContent()}
      </div>
    </div>

    <!-- HISTORICAL IMPORT AUDIT LOG -->
    <div class="glass-card mt-16">
      <div class="card-header">
        <h3 class="card-title">📜 Import Activity History &amp; Audit Trail</h3>
        <span class="card-badge teal">Write-Once System Log</span>
      </div>
      <div class="table-scroll">
        <table class="rbac-table">
          <thead>
            <tr><th>Batch ID</th><th>Filename</th><th>Total Records</th><th>Successful</th><th>Failed</th><th>Duplicates</th><th>Date &amp; Admin</th><th>Speed</th></tr>
          </thead>
          <tbody>
            ${importHistory.map(h => `
              <tr>
                <td><strong>${escapeHtml(h.batch_code)}</strong></td>
                <td>📄 ${escapeHtml(h.filename)}</td>
                <td>${escapeHtml(h.total_records)}</td>
                <td><span class="card-badge teal">${escapeHtml(h.success_count)}</span></td>
                <td>${h.failed_count > 0 ? `<span class="card-badge amber">${escapeHtml(h.failed_count)}</span>` : '0'}</td>
                <td>${escapeHtml(h.duplicate_count)}</td>
                <td>${escapeHtml(formatDate(h.created_at))} (${escapeHtml(h.admin_name)})</td>
                <td>${escapeHtml(h.processing_time)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderWizardStepContent() {
  if (currentImportState.step === 1) {
    return `
      <input type="file" id="import-file-input" accept=".csv,text/csv" style="display:none"
             onchange="handleImportFileSelected(this)" />
      <div class="dropzone" onclick="document.getElementById('import-file-input').click()">
        <div class="dropzone-icon">📄</div>
        <div class="dropzone-title">Click to choose a CSV file</div>
        <div class="dropzone-sub">Headers are detected and mapped automatically. Timestamp and
          &ldquo;Commicate with&rdquo; are excluded by default.</div>
      </div>

      <div class="field-grid-2" style="margin-top:16px">
        <div class="input-group">
          <label class="input-label">Initial Password Policy</label>
          <select class="form-select" id="password-strategy-select" onchange="currentImportState.strategy = this.value">
            <option value="no-password">No password set &mdash; provisioned separately</option>
          </select>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
            Imported accounts are created without a usable password and stay unverified
            until one is provisioned for them. No shared credential is issued.
          </div>
        </div>
        <div class="input-group">
          <label class="input-label">If an account already exists</label>
          <select class="form-select" onchange="currentImportState.dupResolution = this.value">
            <option value="update">Update / enrich the existing profile (recommended)</option>
            <option value="skip">Skip the duplicate</option>
          </select>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">
            Matched on email address, then mobile number.
          </div>
        </div>
      </div>

      <button class="btn btn-outline btn-full mt-16" onclick="downloadSampleImportCSV()">📥 Download a sample template</button>
    `;
  }

  // Column-mapping review — the administrator confirms every header before import.
  if (currentImportState.step === 'mapping') {
    const { headers, mapping, rawRows, totalRows, filename } = currentImportState;
    const mappedCount = mapping.filter(m => m !== 'ignore').length;
    const ignoredCount = mapping.filter(m => m === 'ignore').length;
    const hasName = mapping.includes('name');
    const hasEmail = mapping.includes('email');

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <div style="font-weight:700;font-size:14px">📄 ${escapeHtml(filename)} — ${totalRows} rows, ${headers.length} columns</div>
        <button class="btn btn-outline btn-sm" onclick="resetImportWizard()">← Choose a different file</button>
      </div>

      <div class="validation-summary-bar mb-16">
        <div class="vstat-card"><div class="vstat-num">${totalRows}</div><div class="vstat-label">Rows</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--teal)">${mappedCount}</div><div class="vstat-label">Mapped</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--text-muted)">${ignoredCount}</div><div class="vstat-label">Excluded</div></div>
      </div>

      ${(!hasName || !hasEmail) ? `<div class="login-error" style="margin-bottom:12px">Full Name and Email must both be mapped before importing.</div>` : ''}

      <div class="mapping-list">
        ${headers.map((h, i) => {
          const sample = ((rawRows[0] && rawRows[0][i]) || '').trim().slice(0, 40);
          const isIgnored = mapping[i] === 'ignore';
          return `
          <div class="mapping-row${isIgnored ? ' excluded' : ''}">
            <div class="mapping-col">
              <div class="mapping-header">${escapeHtml(h)}</div>
              <div class="mapping-sample">${sample ? 'e.g. ' + escapeHtml(sample) : 'empty'}</div>
            </div>
            <div class="mapping-arrow">→</div>
            <select class="form-select" onchange="setImportMapping(${i}, this.value)">
              ${IMPORT_FIELDS.map(f => `<option value="${f.key}" ${mapping[i] === f.key ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
            </select>
          </div>`;
        }).join('')}
      </div>

      <button class="btn btn-primary btn-full mt-16" ${(!hasName || !hasEmail) ? 'disabled' : ''}
              onclick="validateImportRows()">✓ Confirm mapping and validate ${totalRows} rows</button>
    `;
  }

  if (currentImportState.step === 2 || currentImportState.step === 3) {
    const validCount = currentImportState.validRecords.length;
    const invalidCount = currentImportState.invalidRecords.length;
    const dupCount = currentImportState.duplicateRecords.length;

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-weight:700;font-size:14px;color:var(--text-primary)">
          📄 Parsed File: <strong>"${escapeHtml(currentImportState.filename)}"</strong> (${escapeHtml(currentImportState.totalRows)} Total Records)
        </div>
        <button class="btn btn-outline btn-sm" onclick="resetImportWizard()">← Upload Different File</button>
      </div>

      <!-- VALIDATION STATS -->
      <div class="validation-summary-bar">
        <div class="vstat-card"><div class="vstat-num">${currentImportState.totalRows}</div><div class="vstat-label">Total Rows</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--teal)">${validCount}</div><div class="vstat-label">Valid Records</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--amber)">${dupCount}</div><div class="vstat-label">Duplicates Found</div></div>
        <div class="vstat-card"><div class="vstat-num" style="color:var(--red)">${invalidCount}</div><div class="vstat-label">Validation Errors</div></div>
      </div>

      <!-- DUPLICATE RESOLUTION STRATEGY -->
      ${dupCount > 0 ? `
        <div class="duplicate-strategy-box">
          <div style="font-weight:700;color:var(--amber);margin-bottom:6px">⚠️ ${dupCount} Duplicate Records Detected (Priority: StudentID &gt; Roll &gt; Email &gt; Phone)</div>
          <div style="display:flex;gap:16px;font-size:12px">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="dup-strat" value="skip" checked onchange="currentImportState.dupResolution = this.value" />
              <span>Skip Duplicates (Recommended)</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="dup-strat" value="update" onchange="currentImportState.dupResolution = this.value" />
              <span>Update Existing Profiles</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="radio" name="dup-strat" value="merge" onchange="currentImportState.dupResolution = this.value" />
              <span>Merge Records</span>
            </label>
          </div>
        </div>
      ` : ''}

      <!-- PREVIEW TABLE -->
      <div class="table-scroll" style="max-height:260px">
        <table class="rbac-table">
          <thead>
            <tr><th>Row</th><th>Full Name</th><th>Student ID</th><th>Email</th><th>Passing Year</th><th>Dept</th><th>Status</th><th>Validation Message</th></tr>
          </thead>
          <tbody>
            ${currentImportState.validRecords.map(r => `
              <tr>
                <td>#${escapeHtml(r.row)}</td>
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td>${escapeHtml(r.studentId)}</td>
                <td>${escapeHtml(r.email)}</td>
                <td>${escapeHtml(r.year)}</td>
                <td>${escapeHtml(r.dept)}</td>
                <td><span class="card-badge teal">Valid</span></td>
                <td style="color:var(--teal);font-size:11px">✓ Ready for Account Creation</td>
              </tr>
            `).join('')}
            ${currentImportState.duplicateRecords.map(r => `
              <tr>
                <td>#${escapeHtml(r.row)}</td>
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td>${escapeHtml(r.studentId)}</td>
                <td>${escapeHtml(r.email)}</td>
                <td>${escapeHtml(r.year)}</td>
                <td>${escapeHtml(r.dept)}</td>
                <td><span class="card-badge amber">Duplicate</span></td>
                <td style="color:var(--amber);font-size:11px">⚠ Matches existing alumni ID ${escapeHtml(r.studentId)}</td>
              </tr>
            `).join('')}
            ${currentImportState.invalidRecords.map(r => `
              <tr>
                <td>#${escapeHtml(r.row)}</td>
                <td><strong>${escapeHtml(r.name || 'N/A')}</strong></td>
                <td>${escapeHtml(r.studentId || 'Missing')}</td>
                <td>${escapeHtml(r.email || 'Missing')}</td>
                <td>${escapeHtml(r.year || 'N/A')}</td>
                <td>${escapeHtml(r.dept || 'N/A')}</td>
                <td><span class="card-badge red">Invalid</span></td>
                <td style="color:var(--red);font-size:11px">❌ ${escapeHtml(r.errorMsg)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
        ${invalidCount > 0 ? `
          <button class="btn btn-outline btn-sm" onclick="downloadImportErrorReportCSV()">📥 Download Error Report (${invalidCount} rows)</button>
        ` : '<div></div>'}
        <button class="btn btn-primary" onclick="executeBulkImportProcess()">🚀 Confirm &amp; Create ${validCount} Accounts →</button>
      </div>
    `;
  }

  if (currentImportState.step === 4) {
    return `
      <div style="text-align:center;padding:24px 0">
        <div style="font-size:48px;margin-bottom:8px">🎉</div>
        <h2 style="color:var(--teal);font-size:22px;font-weight:800">Bulk Import &amp; Profile Generation Complete!</h2>
        <p style="color:var(--text-secondary);font-size:13px;max-width:500px;margin:8px auto 20px">
          Successfully created <strong>${currentImportState.validRecords.length} User Accounts &amp; Alumni Profiles</strong> in the database. Account activation emails &amp; temporary credentials have been dispatched.
        </p>

        <div style="display:inline-flex;gap:12px;justify-content:center">
          <button class="btn btn-primary" onclick="showPage('directory')">◉ View Alumni Directory</button>
          <button class="btn btn-outline" onclick="resetImportWizard()">📥 Import Another File</button>
        </div>
      </div>
    `;
  }
}



function resetImportWizard() {
  Object.assign(currentImportState, {
    step: 1, filename: '', totalRows: 0,
    headers: [], rawRows: [], mapping: [],
    validRecords: [], invalidRecords: [], duplicateRecords: [], lastResult: null
  });
  const input = document.getElementById('import-file-input');
  if (input) input.value = '';
  renderBulkImportPanel();
}

// Excel, LibreOffice and Sheets evaluate a cell that opens with = + - @ TAB or
// CR as a formula, so text pasted into an uploaded CSV can execute on whichever
// machine opens this error report. Prefix those with a literal apostrophe, then
// quote per RFC 4180: wrap in double quotes and double any embedded quote (the
// original built cells with no quote-doubling at all, so a `"` in a name also
// broke the column structure).
function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadImportErrorReportCSV() {
  const headers = ['RowNumber', 'Name', 'StudentID', 'Email', 'ErrorType', 'SuggestedFix'];
  const rows = currentImportState.invalidRecords.map(r => [
    csvCell(r.row), csvCell(r.name || ''), csvCell(r.studentId || ''), csvCell(r.email || ''),
    csvCell(r.errorMsg), csvCell('Provide required valid Student ID, Email, and Full Name')
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "bulk_import_error_report.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('📥 Downloaded bulk_import_error_report.csv');
}

// Sends the parsed rows to POST /api/bulk-import, which inserts real users +
// alumni_profiles and writes an import_history audit row. This previously
// pushed objects into an in-memory array, which is why import_history stayed
// empty even though the endpoint worked.
async function executeBulkImportProcess() {
  currentImportState.step = 4;

  // Maximum retention: send the in-file duplicates as well. The server matches
  // them to the existing account and enriches that profile instead of dropping
  // the second submission on the floor.
  const records = [...currentImportState.validRecords, ...currentImportState.duplicateRecords];
  const startedAt = Date.now();

  showToast(`⏳ Importing ${records.length} record${records.length === 1 ? '' : 's'} into PostgreSQL…`);

  const result = await API.postBulkImport({
    records,
    filename: currentImportState.filename,
    adminName: state.currentUser ? state.currentUser.name : 'Admin',
    dupResolution: currentImportState.dupResolution,
    failedCount: currentImportState.invalidRecords.length,
    duplicateCount: currentImportState.duplicateRecords.length,
    processingTime: `${((Date.now() - startedAt) / 1000).toFixed(1)}s`
  });

  if (!result || result.error) {
    currentImportState.step = 3;
    renderBulkImportPanel();
    showToast(`⚠ Import failed: ${result?.error || 'the server did not respond.'}`);
    return;
  }

  // Keep the server's own tallies — the client's in-file counts do not include
  // duplicates found against existing accounts.
  currentImportState.lastResult = result;

  loadImportHistory(); // re-renders the panel including the new audit row
  showToast(`🎉 Import complete — ${result.created} created, ${result.updated} updated, ` +
            `${result.skipped} duplicates skipped, ${result.rejected} rejected.`);

  // Reflect the new alumni immediately wherever they appear.
  state.directory.offset = 0;
  renderAlumniGrid();
}

