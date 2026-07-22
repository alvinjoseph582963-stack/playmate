/* =====================================================
   PlayMate – Hybrid API & Data Layer Client
   Supports both Flask Backend API and LocalStorage Fallback
   ===================================================== */

const API_BASE  = 'http://localhost:5000/api';
const TOKEN_KEY = 'pm_token';
const USER_KEY  = 'pm_user';

const API = {

  // ─── TOKEN & USER CACHE MANAGEMENT ─────────────────
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  },

  getCachedUser() {
    // Check pm_user or fallback to DB.getCurrentUser()
    try {
      const u = localStorage.getItem(USER_KEY);
      if (u) return JSON.parse(u);
    } catch {}
    if (typeof DB !== 'undefined' && DB.getCurrentUser) {
      return DB.getCurrentUser();
    }
    return null;
  },

  setCachedUser(user) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      if (typeof DB !== 'undefined' && DB.setCurrentUser) {
        DB.setCurrentUser(user.id);
      } else {
        localStorage.setItem('pm_current_user', user.id);
      }
    } else {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('pm_current_user');
      if (typeof DB !== 'undefined' && DB.logout) {
        DB.logout();
      }
    }
  },

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    this.setCachedUser(null);
  },

  isLoggedIn() {
    return !!(this.getToken() || this.getCachedUser());
  },

  // ─── HTTP REQUEST WITH FALLBACK ─────────────────────
  async _req(method, path, body = null, auth = false) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (auth || token) {
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const opts = { method, headers };
    if (body !== null) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${API_BASE}${path}`, opts);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Request failed with status ${res.status}`);
      }
      return data;
    } catch (err) {
      // If error is network/offline error, rethrow or allow caller fallback
      if (err.message.includes('fetch') || err.message.includes('NetworkError') || err.name === 'TypeError') {
        throw new Error('SERVER_OFFLINE');
      }
      throw err;
    }
  },

  // ─── AUTHENTICATION ────────────────────────────────
  async login(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    
    // Try Flask API first
    try {
      const data = await this._req('POST', '/auth/login', { email: cleanEmail, password });
      if (data && data.user) {
        this.setToken(data.token || 'demo_jwt_token_' + Date.now());
        // Standardize properties
        const u = {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          phone: data.user.phone,
          profilePhoto: data.user.profile_photo || data.user.profilePhoto || null,
        };
        this.setCachedUser(u);
        return u;
      }
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') {
        throw err; // Backend returned 401 invalid password, pass it up
      }
    }

    // Offline / Standalone LocalStorage Fallback
    if (typeof DB !== 'undefined') {
      const user = DB.loginUser(cleanEmail, password);
      this.setToken('local_session_' + user.id);
      this.setCachedUser(user);
      return user;
    }

    throw new Error('Could not connect to server or local database');
  },

  async register(name, email, phone, password, profilePhoto = null) {
    const cleanEmail = email.trim().toLowerCase();

    // Try Flask API
    try {
      const data = await this._req('POST', '/auth/register', {
        name, email: cleanEmail, phone, password, profile_photo: profilePhoto
      });
      if (data && data.user) {
        this.setToken(data.token || 'demo_jwt_token_' + Date.now());
        const u = {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          phone: data.user.phone,
          profilePhoto: data.user.profile_photo || data.user.profilePhoto || null,
        };
        this.setCachedUser(u);
        return u;
      }
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') {
        throw err;
      }
    }

    // Offline Fallback
    if (typeof DB !== 'undefined') {
      const user = DB.createUser({
        name, email: cleanEmail, phone, password, profilePhoto
      });
      DB.setCurrentUser(user.id);
      this.setToken('local_session_' + user.id);
      this.setCachedUser(user);
      return user;
    }

    throw new Error('Registration failed');
  },

  async getMe() {
    const cached = this.getCachedUser();
    if (!cached) return null;

    try {
      const data = await this._req('GET', '/auth/me', null, true);
      if (data && data.user) {
        const u = {
          id: data.user.id,
          name: data.user.name,
          email: data.user.email,
          phone: data.user.phone,
          profilePhoto: data.user.profile_photo || data.user.profilePhoto || cached.profilePhoto || null,
        };
        this.setCachedUser(u);
        return u;
      }
    } catch (err) {
      // Return cached user if offline
    }

    return cached;
  },

  logout() {
    this.clearToken();
  },

  // ─── USER PROFILE & DATA ────────────────────────────
  async updateProfile(updates) {
    const cached = this.getCachedUser();
    if (!cached) throw new Error('Not logged in');

    try {
      const data = await this._req('PUT', '/users/me', updates, true);
      if (data && data.user) {
        const updated = {
          ...cached,
          name: data.user.name || cached.name,
          phone: data.user.phone || cached.phone,
          profilePhoto: data.user.profile_photo || data.user.profilePhoto || updates.profile_photo || cached.profilePhoto,
        };
        this.setCachedUser(updated);
        return updated;
      }
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    // Fallback
    if (typeof DB !== 'undefined') {
      const updated = DB.updateUser(cached.id, {
        name: updates.name || cached.name,
        phone: updates.phone || cached.phone,
        profilePhoto: updates.profile_photo || updates.profilePhoto || cached.profilePhoto
      });
      this.setCachedUser(updated);
      return updated;
    }

    return cached;
  },

  async getMySlots() {
    const cached = this.getCachedUser();
    if (!cached) return [];

    try {
      const data = await this._req('GET', '/users/me/slots', null, true);
      if (data && data.slots) return data.slots;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const slots = DB.getUserSlots(cached.id);
      return slots.map(s => {
        const v = DB.getVenueById(s.venueId);
        return {
          ...s,
          venueId: s.venueId,
          venueName: v ? v.name : 'Venue',
          venueLocation: v ? v.location : '',
          sportType: v ? v.sportType : 'Other',
          memberCount: s.members ? s.members.length : 0,
        };
      });
    }

    return [];
  },

  async getMyVenues() {
    const cached = this.getCachedUser();
    if (!cached) return [];

    try {
      const data = await this._req('GET', '/users/me/venues', null, true);
      if (data && data.venues) return data.venues;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const venues = DB.getVenuesByOwner(cached.id);
      return venues.map(v => {
        const slots = DB.getSlotsByVenue(v.id);
        const open = slots.filter(s => s.status === 'open');
        return {
          ...v,
          openSlots: open.length,
          totalSlots: slots.length,
        };
      });
    }

    return [];
  },

  // ─── VENUES ─────────────────────────────────────────
  async getVenues(q = '', sport = 'all') {
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (sport !== 'all') params.set('sport', sport);
      const qs = params.toString() ? `?${params}` : '';
      const data = await this._req('GET', `/venues${qs}`);
      if (data && data.venues) return data.venues;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const venues = DB.searchVenues(q, sport);
      return venues.map(v => {
        const slots = DB.getSlotsByVenue(v.id);
        const open = slots.filter(s => s.status === 'open');
        return {
          ...v,
          openSlots: open.length,
          totalSlots: slots.length,
        };
      });
    }

    return [];
  },

  async getVenue(id) {
    try {
      const data = await this._req('GET', `/venues/${id}`);
      if (data && data.venue) return data.venue;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const v = DB.getVenueById(id);
      if (!v) throw new Error('Venue not found');
      const owner = DB.getUserById(v.ownerId);
      return {
        ...v,
        owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
        ownerPhone: owner ? owner.phone : null,
        ownerEmail: owner ? owner.email : null,
      };
    }

    throw new Error('Venue not found');
  },

  async createVenue(venueData) {
    const cached = this.getCachedUser();
    if (!cached) throw new Error('Must be logged in');

    try {
      const data = await this._req('POST', '/venues', venueData, true);
      if (data && data.venue) return data.venue;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      return DB.createVenue({
        ownerId: cached.id,
        name: venueData.name,
        sportType: venueData.sport_type || venueData.sportType,
        location: venueData.location,
        description: venueData.description,
        photos: venueData.photos || [],
        amenities: venueData.amenities || [],
        pricePerSlot: venueData.price_per_slot || venueData.pricePerSlot || 0,
      });
    }

    throw new Error('Could not create venue');
  },

  async deleteVenue(id) {
    try {
      await this._req('DELETE', `/venues/${id}`, null, true);
      return true;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      DB.deleteVenue(id);
      return true;
    }

    return false;
  },

  // ─── SLOTS ──────────────────────────────────────────
  async getSlots(venueId) {
    const cached = this.getCachedUser();
    const uid = cached ? cached.id : null;

    try {
      const data = await this._req('GET', `/venues/${venueId}/slots`);
      if (data && data.slots) return data.slots;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      DB.processPastSlots();
      const slots = DB.getSlotsByVenue(venueId);
      return slots.map(s => ({
        ...s,
        memberCount: s.members ? s.members.length : 0,
        isJoined: uid && s.members ? s.members.includes(uid) : false,
      }));
    }

    return [];
  },

  async createSlot(venueId, slotData) {
    try {
      const data = await this._req('POST', `/venues/${venueId}/slots`, slotData, true);
      if (data && data.slot) return data.slot;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      return DB.createSlot({
        venueId,
        date: slotData.date,
        startTime: slotData.start_time || slotData.startTime,
        endTime: slotData.end_time || slotData.endTime,
        minMembers: slotData.min_members || slotData.minMembers,
        maxMembers: slotData.max_members || slotData.maxMembers,
        price: slotData.price || 0,
      });
    }

    throw new Error('Could not create slot');
  },

  async deleteSlot(slotId) {
    try {
      await this._req('DELETE', `/slots/${slotId}`, null, true);
      return true;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      DB.deleteSlot(slotId);
      return true;
    }

    return false;
  },

  async joinSlot(slotId) {
    const cached = this.getCachedUser();
    if (!cached) throw new Error('Must be logged in to join slots');

    try {
      const data = await this._req('POST', `/slots/${slotId}/join`, {}, true);
      if (data && data.slot) return data.slot;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const slot = DB.joinSlot(slotId, cached.id);
      return {
        ...slot,
        memberCount: slot.members.length,
        isJoined: true,
      };
    }

    throw new Error('Could not join slot');
  },

  async leaveSlot(slotId) {
    const cached = this.getCachedUser();
    if (!cached) throw new Error('Must be logged in');

    try {
      const data = await this._req('POST', `/slots/${slotId}/leave`, {}, true);
      if (data && data.slot) return data.slot;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const slot = DB.leaveSlot(slotId, cached.id);
      return {
        ...slot,
        memberCount: slot.members.length,
        isJoined: false,
      };
    }

    throw new Error('Could not leave slot');
  },

  async getSlotMembers(slotId) {
    const cached = this.getCachedUser();

    try {
      const data = await this._req('GET', `/slots/${slotId}/members`, null, true);
      if (data && data.slot) return data.slot;
    } catch (err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const slot = DB.getSlotById(slotId);
      if (!slot) throw new Error('Slot not found');
      const memberDetails = (slot.members || []).map(mid => {
        const u = DB.getUserById(mid);
        return u ? {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          profile_photo: u.profilePhoto || null,
        } : null;
      }).filter(Boolean);

      return {
        ...slot,
        memberDetails,
      };
    }

    return { memberDetails: [] };
  },

  // ─── STATS ──────────────────────────────────────────
  async getStats() {
    try {
      const data = await this._req('GET', '/stats');
      if (data) return data;
    } catch (err) {}

    if (typeof DB !== 'undefined') {
      const venues = DB.getVenues();
      const slots = DB.getSlots();
      const openSlots = slots.filter(s => s.status === 'open');
      const users = DB.getUsers();
      return {
        venues: venues.length,
        open_slots: openSlots.length,
        players: users.length,
      };
    }

    return { venues: 4, open_slots: 9, players: 4 };
  },

  // ─── ADMIN MANAGEMENT ──────────────────────────────
  async getAdminOverview() {
    try {
      const data = await this._req('GET', '/admin/overview');
      if (data) return data;
    } catch(err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const users  = DB.getUsers();
      const venues = DB.getVenues();
      const slots  = DB.getSlots();
      let totalJoins = 0;
      slots.forEach(s => totalJoins += (s.members ? s.members.length : 0));

      return {
        users: users.length,
        venues: venues.length,
        slots: slots.length,
        bookings: totalJoins,
        open_slots: slots.filter(s => s.status === 'open').length,
        locked_slots: slots.filter(s => s.status === 'locked').length,
        cancelled: slots.filter(s => s.status === 'cancelled').length,
        completed: slots.filter(s => s.status === 'completed').length,
      };
    }
    return { users: 0, venues: 0, slots: 0, bookings: 0, open_slots: 0, locked_slots: 0, cancelled: 0, completed: 0 };
  },

  async getAdminUsers() {
    try {
      const data = await this._req('GET', '/admin/users');
      if (data && data.users) return data.users;
    } catch(err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const users  = DB.getUsers();
      const venues = DB.getVenues();
      const slots  = DB.getSlots();
      return users.map(u => ({
        ...u,
        is_active: u.is_active !== false,
        venue_count: venues.filter(v => v.ownerId === u.id).length,
        slot_joins: slots.filter(s => s.members && s.members.includes(u.id)).length,
      }));
    }
    return [];
  },

  async toggleUserStatus(userId) {
    try {
      const data = await this._req('PUT', `/admin/users/${userId}/toggle-status`);
      if (data) return data;
    } catch(err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const users = DB.getUsers();
      const idx = users.findIndex(u => u.id === userId);
      if (idx !== -1) {
        users[idx].is_active = !users[idx].is_active;
        DB._set(DB.KEYS.USERS, users);
        return { is_active: users[idx].is_active };
      }
    }
    return { is_active: true };
  },

  async deleteUser(userId) {
    try {
      await this._req('DELETE', `/admin/users/${userId}`);
      return true;
    } catch(err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const users = DB.getUsers().filter(u => u.id !== userId);
      DB._set(DB.KEYS.USERS, users);
      return true;
    }
    return false;
  },

  async getAdminVenues() {
    try {
      const data = await this._req('GET', '/admin/venues');
      if (data && data.venues) return data.venues;
    } catch(err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const venues = DB.getVenues();
      const users  = DB.getUsers();
      const slots  = DB.getSlots();
      return venues.map(v => {
        const owner = users.find(u => u.id === v.ownerId);
        const vSlots = slots.filter(s => s.venueId === v.id);
        return {
          ...v,
          is_active: v.is_active !== false,
          owner_name: owner ? owner.name : 'Unknown',
          owner_email: owner ? owner.email : '',
          totalSlots: vSlots.length,
          openSlots: vSlots.filter(s => s.status === 'open').length,
        };
      });
    }
    return [];
  },

  async toggleVenueStatus(venueId) {
    try {
      const data = await this._req('PUT', `/admin/venues/${venueId}/toggle-status`);
      if (data) return data;
    } catch(err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const venues = DB.getVenues();
      const idx = venues.findIndex(v => v.id === venueId);
      if (idx !== -1) {
        venues[idx].is_active = !venues[idx].is_active;
        DB._set(DB.KEYS.VENUES, venues);
        return { is_active: venues[idx].is_active };
      }
    }
    return { is_active: true };
  },

  async getAdminSlots() {
    try {
      const data = await this._req('GET', '/admin/slots');
      if (data && data.slots) return data.slots;
    } catch(err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const slots  = DB.getSlots();
      const venues = DB.getVenues();
      const users  = DB.getUsers();
      return slots.map(s => {
        const v = venues.find(x => x.id === s.venueId);
        const owner = v ? users.find(u => u.id === v.ownerId) : null;
        const memberDetails = (s.members || []).map(mid => {
          const u = users.find(x => x.id === mid);
          return u ? { id: u.id, name: u.name, email: u.email, phone: u.phone, profile_photo: u.profilePhoto } : null;
        }).filter(Boolean);

        return {
          ...s,
          memberCount: s.members ? s.members.length : 0,
          venueName: v ? v.name : 'Unknown Venue',
          venueLocation: v ? v.location : '',
          sportType: v ? v.sportType : 'Other',
          ownerName: owner ? owner.name : 'Unknown',
          memberDetails,
        };
      });
    }
    return [];
  },

  async updateSlotStatus(slotId, status) {
    try {
      const data = await this._req('PUT', `/admin/slots/${slotId}/status`, { status });
      if (data) return data;
    } catch(err) {
      if (err.message !== 'SERVER_OFFLINE') throw err;
    }

    if (typeof DB !== 'undefined') {
      const slot = DB.updateSlot(slotId, { status });
      return { status: slot.status };
    }
    return { status };
  },

  async processExpiredSlots() {
    try {
      await this._req('POST', '/admin/process-slots');
      return true;
    } catch(err) {}

    if (typeof DB !== 'undefined') {
      DB.processPastSlots();
      return true;
    }
    return false;
  },
};
