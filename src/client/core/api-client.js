/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE (DIC) ALUMNI PLATFORM
   Frontend PostgreSQL API Client Module with Fast Fallback
   ============================================================ */

const API_BASE_URL = window.location.origin;
const TOKEN_KEY = 'dic_session_token';

// ─── SESSION TOKEN STORAGE ───
function getSessionToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setSessionToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

// Every request carries the bearer token when one exists, so the server can
// resolve the caller's identity and role instead of trusting the request body.
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const token = getSessionToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const response = await fetch(url, { ...options, headers, signal: controller.signal });
    clearTimeout(timeoutId);
    // An expired or tampered token drops the client back to the login screen.
    // Auth endpoints are exempt: a 401 from /login or /change-password means
    // "wrong credentials", not "your session died", and treating it as the
    // latter logged the user out mid-flow.
    const isAuthEndpoint = /\/api\/auth\//.test(url);
    if (response.status === 401 && token && !isAuthEndpoint && typeof onSessionExpired === 'function') {
      onSessionExpired();
    }
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

const API = {
  // ─── AUTHENTICATION ───
  async login(email, password) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Login failed' };
      setSessionToken(data.token);
      return data;
    } catch (e) {
      return { error: 'Cannot reach the server. Check your connection and try again.' };
    }
  },

  async register(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const body = await res.json();
      if (!res.ok) return { error: body.error || "Registration failed" };
      setSessionToken(body.token);
      return body;
    } catch (e) {
      return { error: "Cannot reach the server. Check your connection and try again." };
    }
  },

  async me() {
    if (!getSessionToken()) return null;
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/auth/me`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.user;
    } catch (e) {
      return null;
    }
  },

  logout() {
    setSessionToken(null);
  },

  async health() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/health`);
      return await res.json();
    } catch (e) {
      return { status: 'offline', database: 'IndexedDB & Local State' };
    }
  },

  // Returns { alumni, total, limit, offset } or null when the request fails.
  async getAlumni({ search = '', dept = '', batch = '', domain = '', mentor = false,
                    sort = 'name', limit = 12, offset = 0 } = {}) {
    try {
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (dept) qs.set('dept', dept);
      if (batch) qs.set('batch', batch);
      if (domain) qs.set('domain', domain);
      if (mentor) qs.set('mentor', 'true');
      qs.set('sort', sort);
      qs.set('limit', limit);
      qs.set('offset', offset);

      const res = await fetchWithTimeout(`${API_BASE_URL}/api/alumni?${qs}`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async getAlumniProfile(id) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/alumni/${id}`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async getChapters() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/chapters`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async submitChapter(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/chapters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  // The membership user is resolved from the session token server-side.
  async joinChapter(chapterId) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/chapters/${chapterId}/join`, {
        method: 'POST'
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async getChapterMembers(chapterId) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/chapters/${chapterId}/members`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async getStories() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/stories`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async submitStory(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/stories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async getModerationQueue() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/moderation`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async moderateChapter(id, action) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/moderation/chapter/${id}/${action}`, {
        method: 'POST'
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async moderateStory(id, action) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/moderation/story/${id}/${action}`, {
        method: 'POST'
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  // Scope is derived from the session token server-side.
  async getNotifications() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/notifications`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async markNotificationRead(id) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/notifications/${id}/read`, { method: 'PUT' });
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async markAllNotificationsRead() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/notifications/read-all`, { method: 'PUT' });
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async moderateProposal(id, action) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/moderation/proposal/${id}/${action}`, {
        method: 'POST'
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async getImportHistory() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/import-history`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async postBulkImport(data) {
    try {
      // Large imports insert hundreds of rows over a cloud database and take
      // far longer than the 10s default. Aborting client-side used to report a
      // failure while the transaction had already committed server-side.
      const timeoutMs = Math.max(120000, (data.records?.length || 0) * 800);
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }, timeoutMs);
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  // ─── EVENT PLANNER API HELPERS ───
  async getEventPlanner(id = 1) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/events/planner/${id}`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async submitEventProposal(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/events/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async addEventBudget(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/events/budgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async addEventSponsor(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/events/sponsors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async addEventTask(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/events/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async updateTaskStatus(taskId, status) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/events/tasks/${taskId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async addEventProcurement(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/events/procurement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async getEventAIEstimate(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/events/ai-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await res.json();
    } catch (e) {
      return null;
    }
  }
};

/* ============================================================
   API v2 — events/ticketing, jobs, campaigns/donations, custom fields,
   mentorship, polls, broadcasts, planner and compliance.

   These share one request helper instead of repeating the same
   try/catch/JSON block per endpoint. On failure they return
   { error: '…' } so callers can show the real reason rather than
   silently falling back to placeholder data.
   ============================================================ */

async function apiRequest(method, path, body) {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      return { error: (data && data.error) || `Request failed (${res.status})`, status: res.status, data };
    }
    return data;
  } catch (e) {
    return { error: 'Cannot reach the server. Check your connection.', offline: true };
  }
}

// True when a helper returned a failure envelope rather than data.
function apiFailed(result) {
  return !result || (typeof result === 'object' && !Array.isArray(result) && 'error' in result);
}

Object.assign(API, {
  // ─── EVENTS & TICKETING ───
  getEvents:        (status)        => apiRequest('GET',    `/api/events${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  createEvent:      (d)             => apiRequest('POST',   '/api/events', d),
  updateEvent:      (id, d)         => apiRequest('PUT',    `/api/events/${id}`, d),
  deleteEvent:      (id)            => apiRequest('DELETE', `/api/events/${id}`),
  registerForEvent: (id, d)         => apiRequest('POST',   `/api/events/${id}/register`, d || {}),
  cancelRegistration:(id)           => apiRequest('DELETE', `/api/events/${id}/register`),
  getMyTicket:      (id)            => apiRequest('GET',    `/api/events/${id}/my-ticket`),
  getAttendees:     (id)            => apiRequest('GET',    `/api/events/${id}/attendees`),
  checkInTicket:    (ticketCode)    => apiRequest('POST',   '/api/events/checkin', { ticketCode }),

  // ─── JOBS ───
  getJobs:          (q = {})        => apiRequest('GET',    `/api/jobs?${new URLSearchParams(q)}`),
  createJob:        (d)             => apiRequest('POST',   '/api/jobs', d),
  updateJob:        (id, d)         => apiRequest('PUT',    `/api/jobs/${id}`, d),
  deleteJob:        (id)            => apiRequest('DELETE', `/api/jobs/${id}`),
  applyToJob:       (id, d)         => apiRequest('POST',   `/api/jobs/${id}/apply`, d || {}),
  getJobApplicants: (id)            => apiRequest('GET',    `/api/jobs/${id}/applicants`),
  requestReferral:  (id, message)   => apiRequest('POST',   `/api/jobs/${id}/refer`, { message }),

  // ─── CAMPAIGNS & DONATIONS ───
  getCampaigns:     ()              => apiRequest('GET',    '/api/campaigns'),
  createCampaign:   (d)             => apiRequest('POST',   '/api/campaigns', d),
  updateCampaign:   (id, d)         => apiRequest('PUT',    `/api/campaigns/${id}`, d),
  deleteCampaign:   (id)            => apiRequest('DELETE', `/api/campaigns/${id}`),
  createDonation:   (d)             => apiRequest('POST',   '/api/donations', d),
  confirmDonation:  (id, d)         => apiRequest('POST',   `/api/donations/${id}/confirm`, d || { success: true }),
  getMyDonations:   ()              => apiRequest('GET',    '/api/donations/mine'),
  getDonorLeaderboard: ()           => apiRequest('GET',    '/api/donations/leaderboard'),
  // Staff settlement. A pledge only becomes a SUCCESS row here, against a real
  // transaction reference — the donor's own confirm can no longer do it.
  getPendingDonations: ()           => apiRequest('GET',    '/api/donations/pending'),
  settleDonationApi: (id, d)        => apiRequest('POST',   `/api/donations/${id}/settle`, d),

  // ─── CUSTOM FIELDS ───
  getCustomFields:  ()              => apiRequest('GET',    '/api/custom-fields'),
  createCustomField:(d)             => apiRequest('POST',   '/api/custom-fields', d),
  deleteCustomFieldApi: (id)        => apiRequest('DELETE', `/api/custom-fields/${id}`),

  // ─── MENTORSHIP ───
  getMentorships:   ()              => apiRequest('GET',    '/api/mentorships'),
  getMentorSuggestions: ()          => apiRequest('GET',    '/api/mentorships/suggestions'),
  requestMentorship:(d)             => apiRequest('POST',   '/api/mentorships', d),
  respondMentorship:(id, action)    => apiRequest('PUT',    `/api/mentorships/${id}/${action}`),

  // ─── CONNECTIONS ───
  getConnections:   ()              => apiRequest('GET',    '/api/connections'),
  connectWith:      (userId)        => apiRequest('POST',   `/api/connections/${userId}`),

  // ─── POLLS ───
  getActivePoll:    ()              => apiRequest('GET',    '/api/polls/active'),
  votePoll:         (id, optionIndex) => apiRequest('POST', `/api/polls/${id}/vote`, { optionIndex }),

  // ─── BROADCASTS & AUDIT ───
  getBroadcasts:    ()              => apiRequest('GET',    '/api/broadcasts'),
  sendBroadcastApi: (d)             => apiRequest('POST',   '/api/broadcasts', d),
  getAuditLogs:     ()              => apiRequest('GET',    '/api/audit-logs'),

  // ─── PLATFORM STATS ───
  // Live figures for the dashboards. These replaced hardcoded literals; if one
  // of these calls fails the caller must show nothing rather than fall back to
  // a placeholder number, or the fabricated-metrics problem comes straight back.
  // ─── ALUMNI VERIFICATION ───
  // The queue that turns a bulk-imported row into an account someone can use.
  getVerificationQueue: ()          => apiRequest('GET',    '/api/verification/queue'),
  approveVerification: (id)         => apiRequest('POST',   `/api/verification/${id}/approve`),
  rejectVerification: (id, reason)  => apiRequest('POST',   `/api/verification/${id}/reject`, { reason }),

  // ─── RESUMES (REQ-07) ───
  // The file is sent as a RAW body, not multipart and not JSON: no multipart
  // parser exists (four-dependency budget) so the server reads req.body as a
  // Buffer and decides the type from the magic bytes. The filename travels in a
  // header because there is no form to carry it.
  async uploadResume(file) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/resumes`, {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120)
        },
        body: file
      }, 60000);   // a 1 MB upload on 2G needs far longer than the 10s default
      const data = await res.json().catch(() => null);
      if (!res.ok) return { error: (data && data.error) || `Upload failed (${res.status})` };
      return data;
    } catch (e) {
      return { error: 'Cannot reach the server. Check your connection.', offline: true };
    }
  },
  getMyResumes:     ()              => apiRequest('GET',    '/api/resumes/mine'),
  deleteResume:     (id)            => apiRequest('DELETE', `/api/resumes/${id}`),

  // ─── CAREER PROGRESSION (REQ-08) ───
  // Self-reported employment history. Nothing populates these automatically.
  getMyCareer:      ()              => apiRequest('GET',    '/api/careers/mine'),
  getUserCareer:    (id)            => apiRequest('GET',    `/api/careers/user/${id}`),
  createCareerEntry:(d)             => apiRequest('POST',   '/api/careers', d),
  updateCareerEntry:(id, d)         => apiRequest('PUT',    `/api/careers/${id}`, d),
  deleteCareerEntry:(id)            => apiRequest('DELETE', `/api/careers/${id}`),

  getPlatformStats: ()              => apiRequest('GET',    '/api/stats/platform'),
  getSystemStats:   ()              => apiRequest('GET',    '/api/stats/system'),
  getGeoStats:      ()              => apiRequest('GET',    '/api/stats/geo'),
  getCapabilities:  ()              => apiRequest('GET',    '/api/stats/capabilities'),

  // ─── EVENT PLANNER ───
  getPlannerWorkspace: (eventId = 1) => apiRequest('GET',   `/api/planner/workspace/${eventId}`),
  getPlannerAnalytics: (eventId = 1) => apiRequest('GET',   `/api/planner/analytics/${eventId}`),
  getPlannerList:   (kind, eventId = 1) => apiRequest('GET', `/api/planner/${kind}?eventId=${eventId}`),
  createPlannerItem:(kind, d)       => apiRequest('POST',   `/api/planner/${kind}`, d),
  updatePlannerItem:(kind, id, d)   => apiRequest('PUT',    `/api/planner/${kind}/${id}`, d),
  deletePlannerItem:(kind, id)      => apiRequest('DELETE', `/api/planner/${kind}/${id}`),
  getProposals:     ()              => apiRequest('GET',    '/api/planner/proposals'),
  setProposalStatus:(id, status)    => apiRequest('PUT',    `/api/planner/proposals/${id}/status`, { status }),
  plannerReportUrl: (eventId = 1, type = 'full') => `${API_BASE_URL}/api/planner/report/${eventId}?type=${type}`,

  // ─── COMPLIANCE ───
  recordConsent:    (d)             => apiRequest('POST',   '/api/consent', d),
  getConsentHistory:()              => apiRequest('GET',    '/api/consent'),
  getVault:         ()              => apiRequest('GET',    '/api/vault'),
  storeVaultField:  (d)             => apiRequest('POST',   '/api/vault', d),
  revealVaultField: (id, reason)    => apiRequest('POST',   `/api/vault/${id}/reveal`, { reason }),
  getVaultAccessLogs:()             => apiRequest('GET',    '/api/vault/access-logs'),
  getComplianceStatus:()            => apiRequest('GET',    '/api/compliance/status'),
  getDeletionRequest:()             => apiRequest('GET',    '/api/dsar/delete'),
  requestDeletion:  (reason)        => apiRequest('POST',   '/api/dsar/delete', { reason }),
  cancelDeletion:   ()              => apiRequest('DELETE', '/api/dsar/delete'),
  dsarExportUrl:    (format = 'json') => `${API_BASE_URL}/api/dsar/export?format=${format}`,

  // Import history (admin panel audit trail)
  getImportHistoryV2: ()            => apiRequest('GET',    '/api/import-history')
});

Object.assign(API, {
  changePassword: (currentPassword, newPassword) =>
    apiRequest('POST', '/api/auth/change-password', { currentPassword, newPassword }),
  getMyProfile: () => apiRequest('GET', '/api/profile/me'),
  updateMyProfile: (data) => apiRequest('PUT', '/api/profile/me', data)
});
