/*
 * helpers.js — extracted verbatim from the original app.js, lines 60-133.
 *
 * Shared view helpers used across every feature: renderTargets, escapeHtml,
 * formatDate, formatRelativeTime, renderSkeletonCards, renderEmptyState,
 * renderErrorState.
 */

// A few widgets appear both on their own page and on the alumni dashboard.
// Returns every live container so both stay in sync — previously the duplicate
// ids meant getElementById only ever found the dashboard copy.
function renderTargets(id) {
  return [document.getElementById(id), document.getElementById("dash-" + id)].filter(Boolean);
}

// ─── SHARED VIEW HELPERS ────────────────────────────────────
// Every value rendered from PostgreSQL passes through escapeHtml — user-authored
// story titles, chapter names and notification text all reach innerHTML.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRelativeTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d)) return String(value);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

function renderSkeletonCards(count, variant = 'card') {
  return Array.from({ length: count }, () => `
    <div class="skeleton-card skeleton-${variant}" aria-hidden="true">
      <div class="skeleton-line skeleton-line-lg"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line skeleton-line-sm"></div>
    </div>
  `).join('');
}

function renderEmptyState(icon, title, subtitle = '') {
  return `
    <div class="state-panel state-empty">
      <div class="state-icon">${icon}</div>
      <div class="state-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="state-subtitle">${escapeHtml(subtitle)}</div>` : ''}
    </div>
  `;
}

// Surfaces backend failures instead of silently falling back to mock data.
function renderErrorState(message, retryFn) {
  return `
    <div class="state-panel state-error">
      <div class="state-icon">⚠️</div>
      <div class="state-title">${escapeHtml(message)}</div>
      <div class="state-subtitle">The server or database did not respond.</div>
      ${retryFn ? `<button class="btn btn-secondary state-retry" onclick="${retryFn}">↻ Retry</button>` : ''}
    </div>
  `;
}

