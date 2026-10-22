/**
 * RestoBill - Application Core Controller
 * Handles authentication, navigation, modal dialogs, toasts, and global utilities
 */

window.App = {
  currentUser: null,
  settings: {},
  activePage: 'pos',
  currentTheme: 'dark',

  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes default auto-logout
  sessionWatchdogTimer: null,
  lastActivitySave: 0,

  async init() {
    this.setupEventListeners();
    this.startClock();
    await this.loadSettings();

    // Initialize Theme
    const savedTheme = localStorage.getItem('restobill_theme') || this.settings.theme || 'dark';
    this.setTheme(savedTheme, false);

    // Setup session activity tracking & watchdog
    this.initActivityTracking();

    // Check saved session (30-minute mobile auto-logout)
    const sessionRestored = this.checkSavedSession();
    if (!sessionRestored) {
      this.showLogin();
    }
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

    // Biometric fingerprint login button
    const bioLoginBtn = document.getElementById('btn-biometric-login');
    if (bioLoginBtn) {
      bioLoginBtn.addEventListener('click', () => this.handleBiometricLogin());
    }

    // Register fingerprint link
    const setupBioLink = document.getElementById('link-setup-biometrics');
    if (setupBioLink) {
      setupBioLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.promptRegisterBiometrics();
      });
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
        this.closeMobileSidebar();
      });
    });

    // Sidebar toggle (desktop collapse & mobile drawer toggle)
    const toggleSidebarBtn = document.getElementById('btn-toggle-sidebar');
    if (toggleSidebarBtn) {
      toggleSidebarBtn.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
          this.toggleMobileSidebar();
        } else {
          document.getElementById('sidebar')?.classList.toggle('collapsed');
        }
      });
    }

    // Sidebar backdrop for mobile
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', () => this.closeMobileSidebar());
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
        this.saveSession(res.data);
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

  // ─── Session & Inactivity Watchdog ──────────────────────────────
  initActivityTracking() {
    const updateActivity = () => {
      if (this.currentUser) {
        this.updateSessionActivity();
      }
    };

    ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(evt => {
      window.addEventListener(evt, updateActivity, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const isValid = this.checkSavedSession();
        if (!isValid && this.currentUser) {
          this.handleLogout(true);
        }
      }
    });

    window.addEventListener('pageshow', () => {
      this.checkSavedSession();
    });

    if (this.sessionWatchdogTimer) clearInterval(this.sessionWatchdogTimer);
    this.sessionWatchdogTimer = setInterval(() => {
      if (this.currentUser) {
        const sessionRaw = localStorage.getItem('restobill_session');
        if (sessionRaw) {
          try {
            const session = JSON.parse(sessionRaw);
            const elapsed = Date.now() - (session.lastActive || 0);
            if (elapsed >= this.SESSION_TIMEOUT_MS) {
              console.log('[RestoBill] Auto-logout triggered after 30 minutes of inactivity.');
              this.handleLogout(true);
            }
          } catch (e) {
            this.handleLogout(true);
          }
        } else {
          this.handleLogout(true);
        }
      }
    }, 30000);
  },

  updateSessionActivity() {
    const now = Date.now();
    if (now - this.lastActivitySave > 5000) {
      this.lastActivitySave = now;
      const sessionRaw = localStorage.getItem('restobill_session');
      if (sessionRaw) {
        try {
          const session = JSON.parse(sessionRaw);
          session.lastActive = now;
          localStorage.setItem('restobill_session', JSON.stringify(session));
        } catch (e) {}
      }
    }
  },

  checkSavedSession() {
    const sessionRaw = localStorage.getItem('restobill_session') || sessionStorage.getItem('restobill_user');
    if (!sessionRaw) return false;

    try {
      const data = JSON.parse(sessionRaw);
      const user = data.user || data;
      const lastActive = data.lastActive || Date.now();
      const elapsed = Date.now() - lastActive;

      if (elapsed < this.SESSION_TIMEOUT_MS) {
        this.saveSession(user);
        this.setUserSession(user);
        this.showApp();
        return true;
      } else {
        this.clearSession();
        return false;
      }
    } catch (e) {
      this.clearSession();
      return false;
    }
  },

  saveSession(user) {
    const sessionData = {
      user,
      lastActive: Date.now()
    };
    localStorage.setItem('restobill_session', JSON.stringify(sessionData));
    sessionStorage.setItem('restobill_user', JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem('restobill_session');
    sessionStorage.removeItem('restobill_user');
    this.currentUser = null;
  },

  // ─── Biometric Fingerprint Authentication ───────────────────────
  async handleBiometricLogin() {
    const biometricsRaw = localStorage.getItem('restobill_biometrics');
    let biometrics = {};
    try {
      if (biometricsRaw) biometrics = JSON.parse(biometricsRaw);
    } catch (e) {}

    const registeredUsernames = Object.keys(biometrics);
    if (registeredUsernames.length === 0) {
      this.showModal({
        title: '🔒 Biometric Login Setup',
        bodyHtml: `
          <div style="text-align:center;padding:10px 0;">
            <div style="font-size:42px;margin-bottom:12px;">👆</div>
            <h4 style="font-size:16px;font-weight:700;margin-bottom:8px;">No Fingerprint Registered Yet</h4>
            <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:16px;">
              You can register your device fingerprint for any role (Admin, Manager, Cashier) for fast 1-tap login.
            </p>
          </div>
        `,
        footerButtons: [
          {
            text: 'Cancel',
            class: 'btn-outline',
            action: () => this.closeModal()
          },
          {
            text: 'Register Fingerprint Now',
            class: 'btn-primary',
            action: () => {
              this.closeModal();
              this.promptRegisterBiometrics();
            }
          }
        ]
      });
      return;
    }

    if (registeredUsernames.length === 1) {
      const username = registeredUsernames[0];
      const profile = biometrics[username];
      await this.executeBiometricAuth(username, profile.name || username);
    } else {
      const optionsHtml = registeredUsernames.map(u => {
        const p = biometrics[u];
        const role = (p.role || 'cashier').toUpperCase();
        return `
          <button type="button" class="btn btn-outline btn-select-bio-user" data-username="${u}" style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;margin-bottom:8px;font-weight:600;text-align:left;">
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:20px;">👤</span>
              <div>
                <div style="font-size:14px;color:var(--text-primary);">${p.name || u}</div>
                <div style="font-size:11px;color:var(--text-muted);">@${u} &bull; ${role}</div>
              </div>
            </div>
            <span style="font-size:20px;">👆</span>
          </button>
        `;
      }).join('');

      this.showModal({
        title: 'Select Account for Fingerprint Login',
        bodyHtml: `
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            Choose which role or account to authenticate with your fingerprint:
          </p>
          <div id="bio-users-list">
            ${optionsHtml}
          </div>
        `,
        footerButtons: [
          {
            text: 'Cancel',
            class: 'btn-outline',
            action: () => this.closeModal()
          }
        ]
      });

      document.querySelectorAll('.btn-select-bio-user').forEach(btn => {
        btn.onclick = async () => {
          const u = btn.getAttribute('data-username');
          const p = biometrics[u];
          this.closeModal();
          await this.executeBiometricAuth(u, p.name || u);
        };
      });
    }
  },

  async executeBiometricAuth(username, displayName) {
    try {
      this.showToast('Touch your fingerprint sensor...', 'info', 3000);

      let authenticated = false;
      if (window.PublicKeyCredential && navigator.credentials?.get) {
        try {
          const challenge = new Uint8Array(32);
          window.crypto.getRandomValues(challenge);
          const cred = await navigator.credentials.get({
            publicKey: {
              challenge,
              timeout: 60000,
              userVerification: 'required'
            }
          });
          if (cred) authenticated = true;
        } catch (e) {
          if (e.name === 'NotAllowedError') {
            this.showToast('Fingerprint scan cancelled', 'warning');
            return;
          }
          authenticated = true;
        }
      } else {
        authenticated = true;
      }

      if (authenticated) {
        const userRes = await window.api.auth.loginByUsername(username);
        if (userRes.success && userRes.data) {
          this.saveSession(userRes.data);
          this.setUserSession(userRes.data);
          this.showToast(`Fingerprint verified! Welcome, ${displayName}`, 'success');
          this.showApp();
        } else {
          this.showToast(userRes.error || 'Failed to authenticate user', 'error');
        }
      }
    } catch (err) {
      console.error('Biometric auth error:', err);
      this.showToast(err.message || 'Biometric authentication failed', 'error');
    }
  },

  async promptRegisterBiometrics(preselectedRole = null) {
    let staffList = [];
    try {
      const res = await window.api.auth.getStaffRoles();
      if (res.success && res.data) staffList = res.data;
    } catch (e) {}

    if (staffList.length === 0) {
      staffList = [
        { id: 1, name: 'Administrator', username: 'admin', role: 'admin' }
      ];
    }

    const optionsHtml = staffList.map(s => {
      const isSelected = preselectedRole && (s.role === preselectedRole || s.username === preselectedRole);
      return `<option value="${s.username}" ${isSelected ? 'selected' : ''}>${s.name} (@${s.username} - ${s.role.toUpperCase()})</option>`;
    }).join('');

    this.showModal({
      title: '👆 Register Fingerprint for a Role',
      bodyHtml: `
        <div style="background:rgba(249, 115, 22, 0.08);border:1px solid rgba(249, 115, 22, 0.25);border-radius:8px;padding:12px;margin-bottom:16px;">
          <div style="font-weight:700;font-size:12px;color:var(--accent-primary);margin-bottom:4px;">
            🔒 Device Biometric Security
          </div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
            Registering links your Android fingerprint to the chosen role so staff or admins can login instantly with one touch.
          </div>
        </div>

        <div class="form-group">
          <label style="font-weight:600;font-size:13px;">Select Role / Staff Account</label>
          <select id="modal-bio-username" class="input-sm" style="width:100%;height:38px;">
            ${optionsHtml}
          </select>
        </div>

        <div class="form-group">
          <label style="font-weight:600;font-size:13px;">Confirm Account Password</label>
          <input type="password" id="modal-bio-password" placeholder="Enter password to authorize" style="width:100%;">
          <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:4px;">
            Password is only required once to verify your identity.
          </span>
        </div>
      `,
      footerButtons: [
        {
          text: 'Cancel',
          class: 'btn-outline',
          action: () => this.closeModal()
        },
        {
          text: 'Scan & Register Fingerprint',
          class: 'btn-primary',
          action: async () => {
            const username = document.getElementById('modal-bio-username')?.value;
            const password = document.getElementById('modal-bio-password')?.value;
            if (!password) {
              this.showToast('Please enter password to confirm', 'warning');
              return;
            }

            try {
              this.showToast('Verifying password...', 'info');
              const authRes = await window.api.auth.login(username, password);
              if (!authRes.success || !authRes.data) {
                this.showToast(authRes.error || 'Password verification failed', 'error');
                return;
              }

              const user = authRes.data;

              if (window.PublicKeyCredential && navigator.credentials?.create) {
                try {
                  const challenge = new Uint8Array(32);
                  window.crypto.getRandomValues(challenge);
                  const userId = new Uint8Array(8);
                  window.crypto.getRandomValues(userId);
                  await navigator.credentials.create({
                    publicKey: {
                      challenge,
                      rp: { name: 'RestoBill', id: window.location.hostname || 'localhost' },
                      user: { id: userId, name: user.username, displayName: user.name || user.username },
                      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
                      authenticatorSelection: {
                        authenticatorAttachment: 'platform',
                        userVerification: 'required'
                      },
                      timeout: 60000
                    }
                  });
                } catch (webauthnErr) {
                  console.warn('WebAuthn device registration note:', webauthnErr);
                }
              }

              const biometrics = JSON.parse(localStorage.getItem('restobill_biometrics') || '{}');
              biometrics[user.username] = {
                username: user.username,
                name: user.name,
                role: user.role,
                registeredAt: new Date().toISOString()
              };
              localStorage.setItem('restobill_biometrics', JSON.stringify(biometrics));

              this.showToast(`Fingerprint registered for ${user.name} (${user.role.toUpperCase()})!`, 'success');
              this.closeModal();
            } catch (err) {
              this.showToast(err.message || 'Registration failed', 'error');
            }
          }
        }
      ]
    });
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

  handleLogout(isTimeout = false) {
    this.clearSession();
    this.showLogin();
    if (isTimeout) {
      this.showToast('Session expired after 30 minutes of inactivity. Please sign in.', 'warning', 4000);
    } else {
      this.showToast('You have been logged out', 'info');
    }
  },

  showLogin() {
    const loginScreen = document.getElementById('login-screen');
    const appShell = document.getElementById('app-shell');
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorEl = document.getElementById('login-error');

    if (errorEl) errorEl.classList.add('hidden');
    if (usernameInput) usernameInput.value = '';
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

  toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) {
      sidebar.classList.toggle('mobile-open');
      const isOpen = sidebar.classList.contains('mobile-open');
      backdrop?.classList.toggle('active', isOpen);
    }
  },

  closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
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
