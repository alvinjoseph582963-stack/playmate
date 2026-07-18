/* =====================================================
   PlayMate - Data Layer (localStorage)
   ===================================================== */

const DB = {
  // ─── KEYS ───────────────────────────────────────────
  KEYS: {
    USERS: 'pm_users',
    VENUES: 'pm_venues',
    SLOTS: 'pm_slots',
    BOOKINGS: 'pm_bookings',
    CURRENT_USER: 'pm_current_user',
  },

  // ─── HELPERS ────────────────────────────────────────
  _get(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  },
  _set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  _getObj(key) {
    try { return JSON.parse(localStorage.getItem(key)) || null; }
    catch { return null; }
  },
  _id() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  // ─── CURRENT USER ───────────────────────────────────
  getCurrentUser() {
    const id = localStorage.getItem(this.KEYS.CURRENT_USER);
    if (!id) return null;
    return this.getUserById(id);
  },
  setCurrentUser(id) {
    localStorage.setItem(this.KEYS.CURRENT_USER, id);
  },
  logout() {
    localStorage.removeItem(this.KEYS.CURRENT_USER);
  },

  // ─── USERS ──────────────────────────────────────────
  getUsers() { return this._get(this.KEYS.USERS); },
  getUserById(id) { return this.getUsers().find(u => u.id === id) || null; },
  getUserByEmail(email) {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  },
  createUser(data) {
    const users = this.getUsers();
    if (users.find(u => u.email.toLowerCase() === data.email.toLowerCase())) {
      throw new Error('Email already registered');
    }
    const user = {
      id: this._id(),
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: data.password,
      profilePhoto: data.profilePhoto || null,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    this._set(this.KEYS.USERS, users);
    return user;
  },
  updateUser(id, updates) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('User not found');
    users[idx] = { ...users[idx], ...updates };
    this._set(this.KEYS.USERS, users);
    return users[idx];
  },
  loginUser(email, password) {
    const user = this.getUserByEmail(email);
    if (!user) throw new Error('No account found with this email');
    if (user.password !== password) throw new Error('Incorrect password');
    this.setCurrentUser(user.id);
    return user;
  },

  // ─── VENUES ─────────────────────────────────────────
  getVenues() { return this._get(this.KEYS.VENUES); },
  getVenueById(id) { return this.getVenues().find(v => v.id === id) || null; },
  getVenuesByOwner(ownerId) { return this.getVenues().filter(v => v.ownerId === ownerId); },
  createVenue(data) {
    const venues = this.getVenues();
    const venue = {
      id: this._id(),
      ownerId: data.ownerId,
      name: data.name,
      sportType: data.sportType,
      location: data.location,
      description: data.description,
      photos: data.photos || [],
      amenities: data.amenities || [],
      pricePerSlot: data.pricePerSlot || 0,
      createdAt: new Date().toISOString(),
    };
    venues.push(venue);
    this._set(this.KEYS.VENUES, venues);
    return venue;
  },
  updateVenue(id, updates) {
    const venues = this.getVenues();
    const idx = venues.findIndex(v => v.id === id);
    if (idx === -1) throw new Error('Venue not found');
    venues[idx] = { ...venues[idx], ...updates };
    this._set(this.KEYS.VENUES, venues);
    return venues[idx];
  },
  deleteVenue(id) {
    const venues = this.getVenues().filter(v => v.id !== id);
    this._set(this.KEYS.VENUES, venues);
    // also delete slots
    const slots = this.getSlots().filter(s => s.venueId !== id);
    this._set(this.KEYS.SLOTS, slots);
  },
  searchVenues(query, sportType) {
    let venues = this.getVenues();
    if (query) {
      const q = query.toLowerCase();
      venues = venues.filter(v =>
        v.name.toLowerCase().includes(q) ||
        v.location.toLowerCase().includes(q) ||
        v.sportType.toLowerCase().includes(q)
      );
    }
    if (sportType && sportType !== 'all') {
      venues = venues.filter(v => v.sportType === sportType);
    }
    return venues;
  },

  // ─── SLOTS ──────────────────────────────────────────
  getSlots() { return this._get(this.KEYS.SLOTS); },
  getSlotById(id) { return this.getSlots().find(s => s.id === id) || null; },
  getSlotsByVenue(venueId) { return this.getSlots().filter(s => s.venueId === venueId); },
  createSlot(data) {
    const slots = this.getSlots();
    const slot = {
      id: this._id(),
      venueId: data.venueId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      minMembers: parseInt(data.minMembers),
      maxMembers: parseInt(data.maxMembers),
      price: parseFloat(data.price) || 0,
      status: 'open', // open | locked | cancelled | completed
      members: [],    // array of userIds
      createdAt: new Date().toISOString(),
    };
    slots.push(slot);
    this._set(this.KEYS.SLOTS, slots);
    return slot;
  },
  updateSlot(id, updates) {
    const slots = this.getSlots();
    const idx = slots.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Slot not found');
    slots[idx] = { ...slots[idx], ...updates };
    this._set(this.KEYS.SLOTS, slots);
    return slots[idx];
  },
  deleteSlot(id) {
    const slots = this.getSlots().filter(s => s.id !== id);
    this._set(this.KEYS.SLOTS, slots);
  },
  joinSlot(slotId, userId) {
    const slots = this.getSlots();
    const idx = slots.findIndex(s => s.id === slotId);
    if (idx === -1) throw new Error('Slot not found');
    const slot = slots[idx];
    if (slot.status === 'cancelled') throw new Error('This slot has been cancelled');
    if (slot.status === 'locked') throw new Error('This slot is fully booked');
    if (slot.members.includes(userId)) throw new Error('You have already joined this slot');
    if (slot.members.length >= slot.maxMembers) throw new Error('Slot is full');
    slot.members.push(userId);
    // Check if min members reached → lock
    if (slot.members.length >= slot.minMembers) {
      slot.status = slot.members.length >= slot.maxMembers ? 'locked' : 'open';
    }
    if (slot.members.length >= slot.maxMembers) {
      slot.status = 'locked';
    }
    slots[idx] = slot;
    this._set(this.KEYS.SLOTS, slots);
    return slot;
  },
  leaveSlot(slotId, userId) {
    const slots = this.getSlots();
    const idx = slots.findIndex(s => s.id === slotId);
    if (idx === -1) throw new Error('Slot not found');
    const slot = slots[idx];
    if (slot.status === 'locked') throw new Error('Cannot leave a locked slot. Contact the venue owner.');
    slot.members = slot.members.filter(id => id !== userId);
    if (slot.status === 'locked' && slot.members.length < slot.minMembers) {
      slot.status = 'open';
    }
    slots[idx] = slot;
    this._set(this.KEYS.SLOTS, slots);
    return slot;
  },
  getUserSlots(userId) {
    return this.getSlots().filter(s => s.members.includes(userId));
  },
  // Auto-cancel expired slots
  processPastSlots() {
    const slots = this.getSlots();
    const now = new Date();
    let changed = false;
    slots.forEach(slot => {
      if (slot.status === 'open') {
        const slotDateTime = new Date(`${slot.date}T${slot.endTime}`);
        if (slotDateTime < now) {
          if (slot.members.length < slot.minMembers) {
            slot.status = 'cancelled';
          } else {
            slot.status = 'completed';
          }
          changed = true;
        }
      }
    });
    if (changed) this._set(this.KEYS.SLOTS, slots);
  },

  // ─── SEED DATA ──────────────────────────────────────
  seed() {
    if (this.getVenues().length > 0) return; // already seeded

    // Create demo users
    const u1 = this.createUser({ name: 'Arjun Mehta', email: 'arjun@demo.com', phone: '9876543210', password: 'demo123' });
    const u2 = this.createUser({ name: 'Priya Sharma', email: 'priya@demo.com', phone: '9123456789', password: 'demo123' });
    const u3 = this.createUser({ name: 'Karan Singh', email: 'karan@demo.com', phone: '9988776655', password: 'demo123' });
    const u4 = this.createUser({ name: 'Neha Patel', email: 'neha@demo.com', phone: '9871234567', password: 'demo123' });

    // Create demo venues
    const v1 = this.createVenue({
      ownerId: u1.id, name: 'GoalPost Turf Arena', sportType: 'Football',
      location: 'Koramangala, Bangalore',
      description: 'Premium 5-a-side and 7-a-side football turf with floodlights, changing rooms, and equipment rental. The best turf experience in Bangalore!',
      photos: [
        'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&q=80',
        'https://images.unsplash.com/photo-1459865264687-595d652de67e?w=800&q=80',
        'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=800&q=80',
      ],
      amenities: ['Floodlights', 'Changing Rooms', 'Parking', 'Equipment Rental', 'Canteen'],
      pricePerSlot: 500,
    });

    const v2 = this.createVenue({
      ownerId: u2.id, name: 'Smash Point Badminton Club',
      sportType: 'Badminton',
      location: 'Indiranagar, Bangalore',
      description: 'Olympic-grade synthetic courts with LED lighting. Perfect for casual matches and competitive players alike.',
      photos: [
        'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&q=80',
        'https://images.unsplash.com/photo-1553778263-73a83bab9b0c?w=800&q=80',
      ],
      amenities: ['LED Lighting', 'Shuttle Service', 'Racket Rental', 'Water Cooler'],
      pricePerSlot: 300,
    });

    const v3 = this.createVenue({
      ownerId: u3.id, name: 'Slam Dunk Basketball Court',
      sportType: 'Basketball',
      location: 'HSR Layout, Bangalore',
      description: 'Full-size NBA-standard hardwood basketball court. Open for pickup games and serious training sessions.',
      photos: [
        'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
        'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=800&q=80',
      ],
      amenities: ['Score Board', 'Water Cooler', 'Parking', 'First Aid'],
      pricePerSlot: 400,
    });

    const v4 = this.createVenue({
      ownerId: u4.id, name: 'Cricket Premier Ground',
      sportType: 'Cricket',
      location: 'Whitefield, Bangalore',
      description: 'Well-maintained cricket pitch with nets, practice area, and spectator seating. Great for box cricket and full matches.',
      photos: [
        'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=800&q=80',
        'https://images.unsplash.com/photo-1540747913346-19212a4b423e?w=800&q=80',
      ],
      amenities: ['Practice Nets', 'Equipment Rental', 'Seating', 'Parking'],
      pricePerSlot: 600,
    });

    // Create future slots
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const day3 = new Date(today); day3.setDate(today.getDate() + 2);
    const day4 = new Date(today); day4.setDate(today.getDate() + 3);
    const day5 = new Date(today); day5.setDate(today.getDate() + 4);

    const fmt = d => d.toISOString().split('T')[0];

    const s1 = this.createSlot({ venueId: v1.id, date: fmt(tomorrow), startTime: '06:00', endTime: '07:00', minMembers: 6, maxMembers: 10, price: 500 });
    const s2 = this.createSlot({ venueId: v1.id, date: fmt(tomorrow), startTime: '18:00', endTime: '19:00', minMembers: 6, maxMembers: 10, price: 500 });
    const s3 = this.createSlot({ venueId: v1.id, date: fmt(day3), startTime: '07:00', endTime: '08:00', minMembers: 6, maxMembers: 14, price: 500 });

    const s4 = this.createSlot({ venueId: v2.id, date: fmt(tomorrow), startTime: '08:00', endTime: '09:00', minMembers: 2, maxMembers: 4, price: 300 });
    const s5 = this.createSlot({ venueId: v2.id, date: fmt(day3), startTime: '10:00', endTime: '11:00', minMembers: 2, maxMembers: 4, price: 300 });

    const s6 = this.createSlot({ venueId: v3.id, date: fmt(day3), startTime: '07:00', endTime: '08:30', minMembers: 5, maxMembers: 10, price: 400 });
    const s7 = this.createSlot({ venueId: v3.id, date: fmt(day4), startTime: '17:00', endTime: '18:30', minMembers: 5, maxMembers: 10, price: 400 });

    const s8 = this.createSlot({ venueId: v4.id, date: fmt(day4), startTime: '06:00', endTime: '08:00', minMembers: 10, maxMembers: 22, price: 600 });
    const s9 = this.createSlot({ venueId: v4.id, date: fmt(day5), startTime: '16:00', endTime: '18:00', minMembers: 10, maxMembers: 22, price: 600 });

    // Add some members to slots
    this.joinSlot(s1.id, u2.id);
    this.joinSlot(s1.id, u3.id);
    this.joinSlot(s1.id, u4.id);
    this.joinSlot(s4.id, u1.id);
    this.joinSlot(s6.id, u2.id);
    this.joinSlot(s6.id, u4.id);
  },
};

// Run seed on load
DB.seed();
DB.processPastSlots();
