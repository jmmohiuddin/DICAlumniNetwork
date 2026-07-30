/* ============================================================
   DAFFODIL INTERNATIONAL COLLEGE (DIC) ALUMNI PLATFORM
   Frontend PostgreSQL API Client Module with Fast Fallback
   ============================================================ */

const API_BASE_URL = window.location.origin;

async function fetchWithTimeout(url, options = {}, timeoutMs = 1500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

const API = {
  async health() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/health`);
      return await res.json();
    } catch (e) {
      return { status: 'offline', database: 'IndexedDB & Local State' };
    }
  },

  async getAlumni(search = '') {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/alumni?search=${encodeURIComponent(search)}`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null; // Fallback to local data
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

  async joinChapter(chapterId, userId) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/chapters/${chapterId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
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

  async getNotifications() {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/notifications`);
      if (!res.ok) throw new Error('API Error');
      return await res.json();
    } catch (e) {
      return null;
    }
  },

  async postBulkImport(data) {
    try {
      const res = await fetchWithTimeout(`${API_BASE_URL}/api/bulk-import`, {
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
