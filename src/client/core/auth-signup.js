/*
 * auth-signup.js — extracted verbatim from the original app.js, lines 6139-6253.
 *
 * Sign-up flow and forced password change: auth-mode switching, signup error
 * display/submit, and the change-password modal + handler. (Sign-in lives
 * separately in core/auth.js — see app.js:134-364.)
 */

/* ============================================================
   SIGN UP  —  the app previously offered sign-in only, so an alumnus who
   was not bulk imported had no route into the system.
   ============================================================ */

function switchAuthMode(mode) {
  const signin = document.getElementById('auth-panel-signin');
  const signup = document.getElementById('auth-panel-signup');
  const tabIn = document.getElementById('auth-tab-signin');
  const tabUp = document.getElementById('auth-tab-signup');
  if (!signin || !signup) return;

  const isSignup = mode === 'signup';
  signup.classList.toggle('hidden', !isSignup);
  signin.classList.toggle('hidden', isSignup);
  tabUp.classList.toggle('active', isSignup);
  tabIn.classList.toggle('active', !isSignup);

  showLoginError('');
  showSignupError('');
}

function showSignupError(message) {
  const el = document.getElementById('signup-error');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('hidden', !message);
}

async function handleSignupSubmit(e) {
  if (e) e.preventDefault();

  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-password2').value;

  showSignupError('');

  if (password !== confirm) { showSignupError('The two passwords do not match.'); return; }
  if (password.length < 8) { showSignupError('Password must be at least 8 characters.'); return; }
  if (!document.getElementById('signup-consent').checked) {
    showSignupError('Please accept the data processing consent to continue.');
    return;
  }

  const btn = document.getElementById('signup-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating your account…';

  const result = await API.register({
    name, email, password,
    hscPassingYear: document.getElementById('signup-hsc-year').value,
    hscGroup: document.getElementById('signup-hsc-group').value,
    mobile: document.getElementById('signup-mobile').value.trim(),
    bloodGroup: document.getElementById('signup-blood-group').value
  });

  btn.disabled = false; btn.textContent = 'Create Account →';

  if (!result || result.error) { showSignupError(result?.error || 'Registration failed.'); return; }

  // Consent is logged server-side with IP and policy version (PDPA 2026).
  await API.recordConsent({ consentType: 'data_processing', granted: true });

  enterAuthenticatedApp(result.user);
  showToast('🎓 Account created. An administrator will verify your alumni status shortly.');
}

// Prompts bulk-imported users to replace the shared initial password.
function showChangePasswordModal(forced = false) {
  showModal(`
    <div class="modal-header">
      <div class="modal-title">🔑 ${forced ? 'Set a New Password' : 'Change Password'}</div>
      ${forced ? '' : '<button class="modal-close" onclick="closeModal()" aria-label="Close dialog"><span aria-hidden="true">✕</span></button>'}
    </div>
    ${forced ? `<p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">
      Your account was created by a bulk import and still uses the shared initial password.
      Please choose your own before continuing.</p>` : ''}
    <form onsubmit="handleChangePassword(event)">
      <div class="input-group">
        <label class="input-label">Current Password</label>
        <input type="password" id="cp-current" class="form-input" autocomplete="current-password" required />
      </div>
      <div class="input-group">
        <label class="input-label">New Password</label>
        <input type="password" id="cp-new" class="form-input" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="input-group">
        <label class="input-label">Confirm New Password</label>
        <input type="password" id="cp-new2" class="form-input" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="login-error hidden" id="cp-error" role="alert"></div>
      <button type="submit" class="btn btn-primary btn-full">Update Password</button>
    </form>
  `);
}

async function handleChangePassword(e) {
  if (e) e.preventDefault();
  const cur = document.getElementById('cp-current').value;
  const nw = document.getElementById('cp-new').value;
  const nw2 = document.getElementById('cp-new2').value;
  const err = document.getElementById('cp-error');

  const fail = (m) => { err.textContent = m; err.classList.remove('hidden'); };
  if (nw !== nw2) return fail('The two passwords do not match.');
  if (nw.length < 8) return fail('Password must be at least 8 characters.');

  const res = await API.changePassword(cur, nw);
  if (apiFailed(res)) return fail(res?.error || 'Could not update the password.');

  closeModal();
  showToast('✅ Password updated.');
}

