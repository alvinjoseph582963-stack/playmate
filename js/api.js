/* =====================================================
   PlayMate – Frontend API Client
   Replaces data.js — all calls go to Flask backend
   ===================================================== */

const API_BASE = 'http://localhost:5000/api';
const TOKEN_KEY = 'pm_token';
const USER_KEY  = 'pm_user';

const API = {

  // ─── TOKEN MANAGEMENT ──────────────────────────────
  getToken()          { return localStorage.getItem(TOKEN_KEY); },
  setToken(t)         { localStorage.setItem(TOKEN_KEY, t); },
  clearToken()        { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); },
  getCachedUser()     { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } },
  setCachedUser(u)    { localStorage.setItem(USER_KEY, JSON.stringify(u)); },

  // ─── HTTP HELPER ───────────────────────────────────
  async _req(method, path, body = null, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth || this.getToken()) {
      const t = this.getToken();
      if (t) headers['Authorization'] = `Bearer ${t}`;
    }
    const opts = { method, headers };
    if (body !== null) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  },

  get(path, auth = false)          { return this._req('GET',    path, null, auth); },
  post(path, body, auth = false)   { return this._req('POST',   path, body, auth); },
  put(path, body, auth = false)    { return this._req('PUT',    path, body, auth); },
  del(path, auth = false)          { return this._req('DELETE', path, null, auth); },

  // ─── AUTH ──────────────────────────────────────────
  async register(name, email, phone, password, profilePhoto = null) {
    const data = await this.post('/auth/register', { name, email, phone, password, profile_photo: profilePhoto });
    this.setToken(data.token);
    this.setCachedUser(data.user);
    return data.user;
  },

  async login(email, password) {
    const data = await this.post('/auth/login', { email, password });
    this.setToken(data.token);
    this.setCachedUser(data.user);
    return data.user;
  },

  async getMe() {
    if (!this.getToken()) return null;
    try {
      const data = await this.get('/auth/me', true);
      this.setCachedUser(data.user);
      return data.user;
    } catch {
      return null;
    }
  },

  logout() {
    this.clearToken();
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  // ─── USERS ─────────────────────────────────────────
  async updateProfile(updates) {
    const data = await this.put('/users/me', updates, true);
    this.setCachedUser(data.user);
    return data.user;
  },

  async getMySlots() {
    const data = await this.get('/users/me/slots', true);
    return data.slots;
  },

  async getMyVenues() {
    const data = await this.get('/users/me/venues', true);
    return data.venues;
  },

  // ─── VENUES ────────────────────────────────────────
  async getVenues(q = '', sport = 'all') {
    const params = new URLSearchParams();
    if (q)              params.set('q', q);
    if (sport !== 'all') params.set('sport', sport);
    const qs = params.toString() ? `?${params}` : '';
    const data = await this.get(`/venues${qs}`);
    return data.venues;
  },

  async getVenue(id) {
    const data = await this.get(`/venues/${id}`);
    return data.venue;
  },

  async createVenue(venueData) {
    const data = await this.post('/venues', venueData, true);
    return data.venue;
  },

  async deleteVenue(id) {
    return this.del(`/venues/${id}`, true);
  },

  // ─── SLOTS ─────────────────────────────────────────
  async getSlots(venueId) {
    const data = await this.get(`/venues/${venueId}/slots`);
    return data.slots;
  },

  async createSlot(venueId, slotData) {
    const data = await this.post(`/venues/${venueId}/slots`, slotData, true);
    return data.slot;
  },

  async deleteSlot(slotId) {
    return this.del(`/slots/${slotId}`, true);
  },

  async joinSlot(slotId) {
    const data = await this.post(`/slots/${slotId}/join`, {}, true);
    return data.slot;
  },

  async leaveSlot(slotId) {
    const data = await this.post(`/slots/${slotId}/leave`, {}, true);
    return data.slot;
  },

  async getSlotMembers(slotId) {
    const data = await this.get(`/slots/${slotId}/members`, true);
    return data.slot;
  },

  // ─── STATS ─────────────────────────────────────────
  async getStats() {
    const data = await this.get('/stats');
    return data;
  },
};

/* =====================================================
   Backward-compat shim: expose DB-like helpers
   so ui.js keeps working without changes
===================================================== */
const DB = {
  getCurrentUser() { return API.getCachedUser(); },
  logout()         { API.logout(); },
};
