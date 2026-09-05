/*
 * runtime.js — extracted verbatim from the original app.js, lines 2772-2898.
 *
 * Admin section switching (switchAdmin — original declaration, wrapped later in
 * gap-fixes-req.js), global search, toast notifications (+ injected keyframes),
 * offline simulation, mobile progressive-disclosure helper, and the DOM boot
 * sequence (initAppOnce / DOMContentLoaded).
 */

// ─── ADMIN SECTIONS ─────────────────────────────────────────
function switchAdmin(section, btn) {
  document.querySelectorAll('.admin-tabs .chart-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
  document.getElementById('admin-' + section).classList.remove('hidden');
}

// ─── MISC ACTIONS ────────────────────────────────────────────









function handleGlobalSearch(value) {
  if (value.length > 2) {
    setTimeout(() => {
      if (state.currentPage !== 'directory') {
        showPage('directory');
        document.getElementById('dir-search').value = value;
        filterDirectory(value);
      }
    }, 300);
  }
}

// ─── TOAST NOTIFICATION ──────────────────────────────────────
/* Toasts are this app's only feedback channel — pledge recorded, job applied,
 * mentorship requested, event check-in, and every "could not reach the server".
 *
 * Two things were wrong with them.
 *
 * 1. Nothing was announced. There was no aria-live anywhere in the codebase, so
 *    a screen-reader user completed a donation and got no indication at all
 *    that anything had happened. The container carries role="status" and
 *    aria-live="polite" now; it is created once and reused, because a live
 *    region has to exist in the DOM *before* text is put into it or the
 *    insertion is not announced.
 * 2. It was still dark. The colours were written inline in JS — near-black
 *    panel, white ink, backdrop blur — so the stylesheet's light-theme
 *    conversion could not reach them, and the toast was the last dark surface
 *    in the app.
 *
 * The dwell time went from 3s to 5s: 3s is not long enough to hear a sentence
 * read aloud, and now that these are announced that matters. A close button
 * makes it dismissible, which is what WCAG 2.2.1 asks for.
 */
function showToast(message) {
  let host = document.getElementById('toast-container');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-container';
    host.className = 'toast-container';
    // The live region is the container, not the message: assistive tech has to
    // be watching an element that already exists to notice a child appearing.
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'false');
    document.body.appendChild(host);
  }

  const t = document.createElement('div');
  t.className = 'toast';

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  t.appendChild(text);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = '\u2715';
  close.onclick = () => dismiss();
  t.appendChild(close);

  host.appendChild(t);

  let done = false;
  function dismiss() {
    if (done) return;
    done = true;
    t.classList.add('is-leaving');
    setTimeout(() => t.remove(), 300);
  }
  setTimeout(dismiss, 5000);
}

// Add toast keyframes
const style = document.createElement('style');
style.textContent = `
@keyframes slideInRight { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100px); opacity: 0; } }
`;
document.head.appendChild(style);

// ─── OFFLINE SIMULATION ──────────────────────────────────────
let isOnline = true;
function simulateOffline() {
  isOnline = !isOnline;
  const el = document.getElementById('offline-status');
  if (isOnline) {
    el.className = 'offline-status online';
    el.innerHTML = '<span class="status-dot"></span><span class="status-text">Online</span>';
    showToast('🟢 Connection restored. Syncing 247 records…');
  } else {
    el.className = 'offline-status offline';
    el.innerHTML = '<span class="status-dot"></span><span class="status-text">Offline Queue Active</span>';
    showToast('🟡 Offline mode. Changes will sync when connected.');
  }
}

// Click offline status to toggle
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('offline-status');
  if (el) el.addEventListener('click', simulateOffline);
});

// ─── MOBILE PROGRESSIVE DISCLOSURE HELPER ───
function toggleProgressiveDisclosure(targetId, btn) {
  const target = document.getElementById(targetId);
  if (!target) return;
  const isHidden = target.classList.contains('hidden');
  if (isHidden) {
    target.classList.remove('hidden');
    if (btn) btn.innerHTML = '▲ Show Less';
  } else {
    target.classList.add('hidden');
    if (btn) btn.innerHTML = '▼ Show More';
  }
}

// ─── INSTANT MOBILE & DESKTOP DOM INITIALIZER ────────────────
let __appInitialized = false;
// Boot: restore an existing session if the stored token is still valid,
// otherwise show the login screen. This previously called enterApp()
// unconditionally, which walked straight past authentication.
async function initAppOnce() {
  if (__appInitialized) return;
  __appInitialized = true;

  initAppTheme();

  const user = await API.me();
  if (user) {
    enterAuthenticatedApp(user);
  } else {
    API.logout();
    showLoginScreen();
  }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initAppOnce, 1);
} else {
  document.addEventListener('DOMContentLoaded', initAppOnce);
  window.addEventListener('load', initAppOnce);
}

// ============================================================
// GAP-FIX ADDITIONS — REQ-01, REQ-03, REQ-05, REQ-07, REQ-08
//                     REQ-09, REQ-10, REQ-12, REQ-18
// ============================================================

