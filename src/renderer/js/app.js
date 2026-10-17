/**
 * RestoBill - Application Core Controller
 * Handles authentication, navigation, modal dialogs, toasts, and global utilities
 */

window.App = {
  currentUser: null,
  settings: {},
  activePage: 'pos',
  currentTheme: 'dark',

  async init() {
    this.setupEventListeners();
    this.startClock();
    await this.loadSettings();

    // Initialize Theme
    const savedTheme = localStorage.getItem('restobill_theme') || this.settings.theme || 'dark';
    this.setTheme(savedTheme, false);

    // Check saved session
    const savedUser = sessionStorage.getItem('restobill_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        this.setUserSession(user);
        this.showApp();
        return;
      } catch (e) {
        sessionStorage.removeItem('restobill_user');
      }
    }

    // Default: show login
    this.showLogin();
  },

  async loadSettings() {
    try {
      const res = await window.api.settings.getAll();
      if (res.success && res.data) {
        this.settings = res.data;
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  startClock() {
    const updateTime = () => {
      const now = new Date();
      const clockEl = document.getElementById('topbar-clock');
      const dateEl = document.getElementById('topbar-date');

      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
      }

      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      }
    };

    updateTime();
    setInterval(updateTime, 1000);
  },

  setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Logout button
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // Sidebar navigation
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.getAttribute('data-page');
        if (page) this.navigate(page);
      });
    });

    // Sidebar toggle
    const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
    if (toggleSidebarBtn) {
      toggleSidebarBtn.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('collapsed');
      });
    }

    // Modal close button
    const modalCloseBtn = document.getElementById('modal-close');
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', () => this.closeModal());
    }

    // Modal overlay click to close
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) this.closeModal();
      });
    }

    // Close detail panel
    const closeDetailBtn = document.getElementById('btn-close-detail');
    if (closeDetailBtn) {
      closeDetailBtn.addEventListener('click', () => this.closeDetailPanel());
    }

    // Theme toggle button
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const next = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(next, true);
      });
    }

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e) => this.handleHotkeys(e));

    // Listen for zoom changes
    if (window.api?.app?.onZoomChanged) {
      window.api.app.onZoomChanged((percent) => {
        const hint = percent === 100 ? 'Default 100%' : 'Ctrl+0 to reset';
        this.showToast(`🔍 Zoom: ${percent}% (${hint})`, 'info', 1000);
      });
    }
  },

  setTheme(theme, showFeedback = false) {
    this.currentTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    localStorage.setItem('restobill_theme', this.currentTheme);

    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    const toggleBtn = document.getElementById('btn-theme-toggle');

    if (this.currentTheme === 'light') {
      sunIcon?.classList.add('hidden');
      moonIcon?.classList.remove('hidden');
      if (toggleBtn) toggleBtn.title = 'Switch to Dark Theme';
    } else {
      sunIcon?.classList.remove('hidden');
      moonIcon?.classList.add('hidden');
      if (toggleBtn) toggleBtn.title = 'Switch to Light Theme';
    }

    // Sync settings dropdown if it exists on the page
    const themeSelect = document.getElementById('settings-theme-select');
    if (themeSelect && themeSelect.value !== this.currentTheme) {
      themeSelect.value = this.currentTheme;
    }

    // Persist to backend settings
    if (window.api?.settings?.update) {
      window.api.settings.update('theme', this.currentTheme).catch(() => {});
    }

    if (showFeedback) {
      this.showToast(`Switched to ${this.currentTheme === 'light' ? 'Light' : 'Dark'} theme`, 'info', 1500);
    }
  },

  handleHotkeys(e) {
    // Zoom shortcuts fallback: Ctrl + Plus, Ctrl + Minus, Ctrl + 0
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') {
        e.preventDefault();
        window.api?.app?.zoomIn?.();
        return;
      } else if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        window.api?.app?.zoomOut?.();
        return;
      } else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault();
        window.api?.app?.zoomReset?.();
        return;
      }
    }

    // Ignore hotkeys inside text inputs except function keys
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

    if (e.key === 'Escape') {
      this.closeModal();
      this.closeDetailPanel();
      return;
    }

    if (e.key === 'F1') {
      e.preventDefault();
      this.navigate('pos');
    } else if (e.key === 'F2') {
      e.preventDefault();
      this.navigate('dashboard');
    } else if (e.key === 'F3') {
      e.preventDefault();
      this.navigate('orders');
    } else if (e.key === 'F4') {
      e.preventDefault();
      this.navigate('menu');
    } else if (e.key === 'F5') {
      e.preventDefault();
      this.navigate('reports');
    } else if (e.key === 'F6') {
      e.preventDefault();
      this.navigate('settings');
    } else if (e.key === 'F8') {
      e.preventDefault();
      this.navigate('pos');
      setTimeout(() => document.getElementById('pos-search')?.focus(), 50);
    } else if (e.key === 'F9' && !isInput) {
      e.preventDefault();
      if (this.activePage === 'pos' && window.POS?.handleSaveAndPrint) {
        window.POS.handleSaveAndPrint();
      }
    } else if (e.key === 'F10' && !isInput) {
      e.preventDefault();
      if (this.activePage === 'pos' && window.POS?.handleSaveOrder) {
        window.POS.handleSaveOrder();
      }
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorEl = document.getElementById('login-error');
    const loginBtn = document.getElementById('login-btn');

    const username = usernameInput?.value.trim();
    const password = passwordInput?.value;

    if (!username || !password) {
      if (errorEl) {
        errorEl.textContent = 'Please enter both username and password';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<span>Signing In...</span>';
    }

    try {
      const res = await window.api.auth.login(username, password);

      if (res.success && res.data) {
        sessionStorage.setItem('restobill_user', JSON.stringify(res.data));
        this.setUserSession(res.data);
        this.showToast(`Welcome back, ${res.data.name}!`, 'success');
        this.showApp();
      } else {
        if (errorEl) {
          errorEl.textContent = res.error || 'Invalid username or password';
          errorEl.classList.remove('hidden');
        }
      }
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Login failed. Please try again.';
        errorEl.classList.remove('hidden');
      }
    } finally {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.innerHTML = `<span>Sign In</span>
          <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
      }
    }
  },

  canAccessPage(pageId) {
    const role = (this.currentUser?.role || 'cashier').toLowerCase();
    if (role === 'admin') return true;
    if (role === 'manager') {
      return ['pos', 'dashboard', 'orders', 'customers', 'menu', 'reports', 'settings'].includes(pageId);
    }
    // Cashier role has access ONLY to Billing (POS), Orders, and Customers
    if (role === 'cashier') {
      return ['pos', 'orders', 'customers'].includes(pageId);
    }
    return false;
  },

  setUserSession(user) {
    this.currentUser = user;

    // Sidebar user info
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('user-avatar');

    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = (user.role || 'cashier').toUpperCase();
    if (avatarEl) avatarEl.textContent = (user.name || user.username || 'U')[0].toUpperCase();

    // Role-based navigation visibility
    const role = (user.role || 'cashier').toLowerCase();
    const isCashier = role === 'cashier';
    const isAdmin = role === 'admin';

    const navDashboard = document.getElementById('nav-dashboard');
    const navMenu = document.getElementById('nav-menu');
    const navReports = document.getElementById('nav-reports');
    const navSettings = document.getElementById('nav-settings');
    const navUsers = document.getElementById('nav-users');
    const adminDivider = document.getElementById('admin-divider');
    const adminLabel = document.getElementById('admin-label');

    // Cashier only has access to: Billing (POS), Orders, Customers
    if (navDashboard) navDashboard.style.display = isCashier ? 'none' : 'flex';
    if (navMenu) navMenu.style.display = isCashier ? 'none' : 'flex';
    if (navReports) navReports.style.display = isCashier ? 'none' : 'flex';
    if (navSettings) navSettings.style.display = isCashier ? 'none' : 'flex';

    // Users & Admin section: Admin only
    if (adminDivider) adminDivider.style.display = isAdmin ? 'block' : 'none';
    if (adminLabel) adminLabel.style.display = isAdmin ? 'block' : 'none';
    if (navUsers) navUsers.style.display = isAdmin ? 'flex' : 'none';

    // Redirect to POS if current page is not permitted
    if (!this.canAccessPage(this.activePage)) {
      this.navigate('pos');
    }
  },

  handleLogout() {
    sessionStorage.removeItem('restobill_user');
    this.currentUser = null;
    this.showLogin();
    this.showToast('You have been logged out', 'info');
  },

  showLogin() {
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app-shell');
    const errorEl = document.getElementById('login-error');
    const passwordInput = document.getElementById('login-password');

    if (errorEl) errorEl.classList.add('hidden');
    if (passwordInput) passwordInput.value = '';

    if (loginScreen) {
      loginScreen.classList.remove('hidden');
      loginScreen.classList.add('active');
    }
    if (appShell) {
      appShell.classList.add('hidden');
      appShell.classList.remove('active');
    }
  },

  showApp() {
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app-shell');

    if (loginScreen) {
      loginScreen.classList.add('hidden');
      loginScreen.classList.remove('active');
    }
    if (appShell) {
      appShell.classList.remove('hidden');
      appShell.classList.add('active');
    }

    this.navigate('pos');
  },

  navigate(pageId) {
    if (!this.canAccessPage(pageId)) {
      this.showToast('Access denied: You do not have permission to view this section', 'warning');
      if (this.canAccessPage(this.activePage)) {
        return;
      }
      pageId = 'pos';
    }

    this.activePage = pageId;

    // Update sidebar navigation active links
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(link => {
      if (link.getAttribute('data-page') === pageId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Update page title
    const titles = {
      pos: 'Billing (POS)',
      dashboard: 'Analytics Dashboard',
      orders: 'Order History',
      customers: 'Customer Directory',
      menu: 'Menu Management',
      reports: 'Business Reports',
      users: 'User Management',
      settings: 'Settings'
    };
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[pageId] || 'RestoBill';

    // Show selected page container
    document.querySelectorAll('.page-container .page').forEach(page => {
      page.classList.remove('active');
      page.classList.add('hidden');
    });

    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
      targetPage.classList.remove('hidden');
      targetPage.classList.add('active');
    }

    // Trigger page-specific module initializers
    if (pageId === 'pos' && window.POS?.init) {
      window.POS.init();
    } else if (pageId === 'dashboard' && window.Dashboard?.load) {
      window.Dashboard.load();
    } else if (pageId === 'orders' && window.OrdersUI?.load) {
      window.OrdersUI.load();
    } else if (pageId === 'customers' && window.CustomersUI?.load) {
      window.CustomersUI.load();
    } else if (pageId === 'menu' && window.MenuUI?.load) {
      window.MenuUI.load();
    } else if (pageId === 'reports' && window.ReportsUI?.load) {
      window.ReportsUI.load();
    } else if (pageId === 'users' && window.UsersUI?.load) {
      window.UsersUI.load();
    } else if (pageId === 'settings' && window.SettingsUI?.load) {
      window.SettingsUI.load();
    }
  },

  // ─── Modal Dialog Management ─────────────────────────────────────
  showModal({ title = 'Modal', bodyHtml = '', footerButtons = [] }) {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const bodyEl = document.getElementById('modal-body');
    const footerEl = document.getElementById('modal-footer');

    if (!overlay || !bodyEl || !footerEl) return;

    if (titleEl) titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;

    // Render footer buttons
    footerEl.innerHTML = '';
    footerButtons.forEach(btn => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = btn.className || 'btn btn-outline btn-sm';
      button.textContent = btn.text;
      button.addEventListener('click', (e) => {
        if (btn.onClick) {
          btn.onClick(e, this);
        } else {
          this.closeModal();
        }
      });
      footerEl.appendChild(button);
    });

    overlay.classList.remove('hidden');
  },

  closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  },

  // ─── Toast Notifications ─────────────────────────────────────────
  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
    } else {
      iconSvg = '<svg class="toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>';
    }

    toast.innerHTML = `
      ${iconSvg}
      <span class="toast-message">${message}</span>
      <button class="toast-close" title="Close">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn?.addEventListener('click', () => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  },

  // ─── Slide-In Order Detail Panel ─────────────────────────────────
  openDetailPanel(title, bodyHtml) {
    const panel = document.getElementById('order-detail-panel');
    const titleEl = document.getElementById('detail-order-title');
    const bodyEl = document.getElementById('detail-panel-body');

    if (!panel || !bodyEl) return;

    if (titleEl) titleEl.textContent = title;
    bodyEl.innerHTML = bodyHtml;
    panel.classList.remove('hidden');
  },

  closeDetailPanel() {
    const panel = document.getElementById('order-detail-panel');
    if (panel) {
      panel.classList.add('hidden');
    }
  },

  // ─── Formatting Helpers ──────────────────────────────────────────
  formatCurrency(amount) {
    const sym = this.settings.currency_symbol || '₹';
    const num = parseFloat(amount || 0);
    return `${sym}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // ─── Print Preview Modal ─────────────────────────────────────────
  async showPrintPreview(orderData, settings = null, initialType = 'receipt') {
    const currentSettings = settings || this.settings || {};
    let activeType = initialType; // 'receipt' or 'invoice'

    // Create or get preview modal overlay
    let previewOverlay = document.getElementById('preview-modal-overlay');
    if (!previewOverlay) {
      previewOverlay = document.createElement('div');
      previewOverlay.id = 'preview-modal-overlay';
      previewOverlay.className = 'modal-overlay hidden';
      document.body.appendChild(previewOverlay);
    }

    const orderNo = orderData.order_no || 'Preview';
    const totalFormatted = this.formatCurrency(orderData.total || 0);

    previewOverlay.innerHTML = `
      <div class="modal modal-preview" id="preview-modal">
        <div class="preview-modal-bar">
          <div class="preview-title-box">
            <h3>Print Preview: ${orderNo}</h3>
            <p>${orderData.customer_name ? `Customer: ${this.escapeHtml(orderData.customer_name)} • ` : ''}${totalFormatted} • ${(orderData.payment_mode || 'cash').toUpperCase()}</p>
          </div>

          <div class="preview-segmented-toggle">
            <button type="button" class="preview-tab-btn ${activeType === 'receipt' ? 'active' : ''}" id="btn-preview-thermal">
              🧾 Thermal Receipt (80mm)
            </button>
            <button type="button" class="preview-tab-btn ${activeType === 'invoice' ? 'active' : ''}" id="btn-preview-invoice">
              📄 A4 Tax Invoice
            </button>
          </div>

          <div class="preview-toolbar-actions">
            <button type="button" class="btn btn-primary btn-sm" id="btn-preview-print">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd"/></svg>
              Print Now
            </button>
            <button type="button" class="btn btn-outline btn-sm" id="btn-preview-pdf">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
              Save PDF
            </button>
            <button type="button" class="btn-icon" id="btn-preview-close" title="Close Preview">
              <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
            </button>
          </div>
        </div>

        <div class="preview-viewport" id="preview-viewport">
          <div class="preview-sheet-frame ${activeType === 'receipt' ? 'thermal' : 'invoice'}" id="preview-sheet-frame">
            <iframe class="preview-frame-iframe" id="preview-frame" sandbox="allow-same-origin allow-scripts"></iframe>
          </div>
        </div>
      </div>
    `;

    previewOverlay.classList.remove('hidden');

    const renderContent = async () => {
      try {
        const res = await window.api.print.getPreview(orderData, currentSettings, activeType);
        const previewHtml = (res && typeof res === 'object' && res.data) ? res.data : (typeof res === 'string' ? res : '');
        const iframe = document.getElementById('preview-frame');
        const frameBox = document.getElementById('preview-sheet-frame');
        if (frameBox) {
          frameBox.className = `preview-sheet-frame ${activeType === 'receipt' ? 'thermal' : 'invoice'}`;
        }
        if (iframe) {
          iframe.srcdoc = previewHtml;
          iframe.onload = () => {
            try {
              const body = iframe.contentWindow.document.body;
              const html = iframe.contentWindow.document.documentElement;
              const height = Math.max(body.scrollHeight, body.offsetHeight, html.clientHeight, html.scrollHeight, html.offsetHeight);
              iframe.style.height = `${Math.max(height + 40, 520)}px`;
            } catch (e) {}
          };
        }
      } catch (err) {
        console.error('Failed to get preview:', err);
      }
    };

    await renderContent();

    // Setup Preview Listeners
    const btnThermal = document.getElementById('btn-preview-thermal');
    const btnInvoice = document.getElementById('btn-preview-invoice');
    const btnPrint = document.getElementById('btn-preview-print');
    const btnPdf = document.getElementById('btn-preview-pdf');
    const btnClose = document.getElementById('btn-preview-close');

    if (btnThermal) {
      btnThermal.onclick = async () => {
        activeType = 'receipt';
        btnThermal.classList.add('active');
        btnInvoice?.classList.remove('active');
        await renderContent();
      };
    }

    if (btnInvoice) {
      btnInvoice.onclick = async () => {
        activeType = 'invoice';
        btnInvoice.classList.add('active');
        btnThermal?.classList.remove('active');
        await renderContent();
      };
    }

    if (btnPrint) {
      btnPrint.onclick = async () => {
        try {
          let res;
          if (activeType === 'invoice') {
            res = await window.api.print.invoice(orderData, currentSettings);
          } else {
            res = await window.api.print.receipt(orderData, currentSettings);
          }
          if (res && res.success) {
            this.showToast(activeType === 'invoice' ? 'Tax invoice sent to printer' : 'Receipt sent to printer', 'success');
          } else if (res && !res.success) {
            this.showToast('Print failed: ' + (res.error || 'Unknown error'), 'error');
          } else {
            this.showToast('Print requested', 'success');
          }
        } catch (e) {
          this.showToast('Print failed: ' + e.message, 'error');
        }
      };
    }

    if (btnPdf) {
      btnPdf.onclick = async () => {
        try {
          this.showToast('Generating PDF...', 'info');
          const res = await window.api.print.toPdf(orderData, currentSettings, activeType);
          if (res && res.success && res.data) {
            this.showToast('PDF saved successfully!', 'success');
          } else if (res && !res.success) {
            this.showToast('PDF generation failed: ' + res.error, 'error');
          }
        } catch (e) {
          this.showToast('PDF generation failed: ' + e.message, 'error');
        }
      };
    }

    const closePreview = () => {
      previewOverlay.classList.add('hidden');
    };

    if (btnClose) btnClose.onclick = closePreview;
    previewOverlay.onclick = (e) => {
      if (e.target === previewOverlay) closePreview();
    };
  }
};

// Initialize App when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
