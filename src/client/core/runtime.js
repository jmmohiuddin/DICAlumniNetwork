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
function showToast(message) {
  let toast = document.getElementById('toast-container');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-container';
    toast.style.cssText = 'position:fixed;bottom:90px;right:20px;z-index:2000;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
    document.body.appendChild(toast);
  }

  const t = document.createElement('div');
  t.style.cssText = 'background:rgba(17,27,46,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px 18px;font-size:13px;font-weight:600;color:#F1F5FF;backdrop-filter:blur(20px);box-shadow:0 8px 30px rgba(0,0,0,0.4);animation:slideInRight 0.3s ease;max-width:320px;pointer-events:auto;';
  t.textContent = message;
  toast.appendChild(t);

  setTimeout(() => {
    t.style.animation = 'slideOutRight 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
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

