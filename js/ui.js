/* =====================================================
   PlayMate - UI Utilities
   ===================================================== */

const UI = {
  // ─── TOAST ──────────────────────────────────────────
  toast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3100);
  },

  // ─── MODAL ──────────────────────────────────────────
  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  },
  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  },
  closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.style.display = 'none';
    });
    document.body.style.overflow = '';
  },

  // ─── AVATAR ─────────────────────────────────────────
  avatarHTML(user, size = 36) {
    if (user?.profilePhoto) {
      return `<img src="${user.profilePhoto}" alt="${user.name}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;">`;
    }
    const initial = (user?.name || '?').charAt(0).toUpperCase();
    const colors = ['#00ff88', '#7c3aed', '#ff6b35', '#00b4d8', '#f59e0b'];
    const color = colors[initial.charCodeAt(0) % colors.length];
    return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color}20;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${size * 0.4}px;color:${color};flex-shrink:0;">${initial}</div>`;
  },

  // ─── SPORT ICONS ────────────────────────────────────
  sportEmoji(sport) {
    const map = {
      'Football': '⚽', 'Cricket': '🏏', 'Basketball': '🏀',
      'Badminton': '🏸', 'Tennis': '🎾', 'Volleyball': '🏐',
      'Table Tennis': '🏓', 'Swimming': '🏊', 'Kabaddi': '🤼',
      'Hockey': '🏑', 'Rugby': '🏉', 'Baseball': '⚾',
      'Boxing': '🥊', 'Cycling': '🚴', 'Running': '🏃',
      'Other': '🏅',
    };
    return map[sport] || '🏅';
  },

  // ─── FORMAT DATE ────────────────────────────────────
  formatDate(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  },
  formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    return `${displayHour}:${m} ${ampm}`;
  },
  formatPrice(price) {
    if (!price || price === 0) return 'Free';
    return `₹${parseFloat(price).toLocaleString('en-IN')}`;
  },
  isSlotPast(slot) {
    const slotDateTime = new Date(`${slot.date}T${slot.endTime}`);
    return slotDateTime < new Date();
  },

  // ─── SLOT STATUS ────────────────────────────────────
  slotStatusBadge(slot) {
    if (slot.status === 'cancelled') return `<span class="badge badge-cancelled">❌ Cancelled</span>`;
    if (slot.status === 'completed') return `<span class="badge badge-locked">✅ Completed</span>`;
    if (slot.status === 'locked') return `<span class="badge badge-locked">🔒 Locked</span>`;
    const pct = slot.members.length / slot.maxMembers;
    if (pct >= 1) return `<span class="badge badge-full">⚡ Full</span>`;
    return `<span class="badge badge-open">🟢 Open</span>`;
  },

  // ─── PROGRESS BAR ───────────────────────────────────
  progressBar(current, max) {
    const pct = Math.min((current / max) * 100, 100);
    let cls = pct >= 100 ? 'full' : pct >= 60 ? 'warning' : '';
    return `<div class="progress-bar"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>`;
  },

  // ─── FILE → BASE64 ──────────────────────────────────
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  // ─── IMAGE PREVIEW ──────────────────────────────────
  async handleImageUpload(input, previewContainer, maxImages = 5) {
    const files = Array.from(input.files);
    const images = [];
    for (const file of files.slice(0, maxImages)) {
      const b64 = await this.fileToBase64(file);
      images.push(b64);
    }
    if (previewContainer) {
      previewContainer.innerHTML = images.map((src, i) => `
        <div class="image-preview-item" data-idx="${i}">
          <img src="${src}" alt="Preview">
          <span class="image-preview-remove" onclick="this.parentElement.remove()">×</span>
        </div>
      `).join('');
    }
    return images;
  },

  // ─── REQUIRE AUTH ───────────────────────────────────
  requireAuth() {
    const user = DB.getCurrentUser();
    if (!user) {
      window.location.href = 'login.html?redirect=' + encodeURIComponent(window.location.href);
      return null;
    }
    return user;
  },

  // ─── UPDATE NAVBAR ──────────────────────────────────
  updateNavbar() {
    const user = API ? API.getCachedUser() : (DB ? DB.getCurrentUser() : null);
    const navActions = document.getElementById('nav-actions');
    if (!navActions) return;
    if (user) {
      const photo = user.profile_photo || user.profilePhoto;
      const name  = user.name || '?';
      navActions.innerHTML = `
        <a href="add-venue.html" class="btn btn-secondary btn-sm">+ Add Venue</a>
        <a href="profile.html" class="nav-avatar" title="${name}">
          ${photo
            ? `<img src="${photo}" alt="${name}">`
            : `<span>${name.charAt(0).toUpperCase()}</span>`}
        </a>
      `;
    } else {
      navActions.innerHTML = `
        <a href="login.html" class="btn btn-ghost btn-sm">Sign In</a>
        <a href="login.html#register" class="btn btn-primary btn-sm">Join Free</a>
      `;
    }
  },

  // ─── NAVBAR SCROLL ──────────────────────────────────
  initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    };
    window.addEventListener('scroll', onScroll);
    onScroll();
  },

  // ─── ACTIVE NAV LINK ────────────────────────────────
  setActiveNavLink() {
    const current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href === current || (current === '' && href === 'index.html')) {
        link.classList.add('active');
      }
    });
  },

  // ─── CONFIRM DIALOG ─────────────────────────────────
  confirm(message) {
    return window.confirm(message);
  },

  // ─── RENDER MEMBERS AVATARS ─────────────────────────
  renderMemberAvatars(memberIds, maxShow = 4) {
    const members = memberIds.slice(0, maxShow).map(id => DB.getUserById(id));
    const extra = memberIds.length - maxShow;
    let html = `<div style="display:flex;align-items:center;gap:0;">`;
    members.forEach(u => {
      html += `<div class="member-avatar-sm" title="${u?.name || 'User'}" style="margin-left:-8px;">${u?.profilePhoto ? `<img src="${u.profilePhoto}" alt="">` : (u?.name?.charAt(0) || '?')}</div>`;
    });
    if (extra > 0) {
      html += `<div class="member-avatar-sm" style="margin-left:-8px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7);font-size:9px;">+${extra}</div>`;
    }
    html += `</div>`;
    return html;
  },
};

// Init navbar on every page
document.addEventListener('DOMContentLoaded', () => {
  UI.updateNavbar();
  UI.initNavbarScroll();
  UI.setActiveNavLink();

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) UI.closeAllModals();
    });
  });

  // Close modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') UI.closeAllModals();
  });
});
