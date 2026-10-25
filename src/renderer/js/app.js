/**
 * RestoBill - Application Core Controller
 * Handles authentication, navigation, modal dialogs, toasts, and global utilities
 */

window.App = {
  currentUser: null,
  settings: {},
  activePage: 'pos',
  currentTheme: 'dark',
  navigationHistory: [],
  lastBackPressTime: 0,
  _lastBackHandled: 0,

  SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes default auto-logout
  sessionWatchdogTimer: null,
  lastActivitySave: 0,

  async init() {
    this.setupEventListeners();
    this.setupBackButtonHandler();
    this.startClock();
    await this.loadSettings();

    // Initialize Supabase Live Metrics & Telemetry
    if (window.SupabaseSync?.init) {
      window.SupabaseSync.init();
    }

    // Initialize Theme
    const savedTheme = localStorage.getItem('restobill_theme') || this.settings.theme || 'dark';
    this.setTheme(savedTheme, false);

    // Setup session activity tracking & watchdog
    this.initActivityTracking();

    // Check if login authentication is required
    const isLoginRequired = this.settings.require_login !== '0' && this.settings.require_login !== false;
    if (!isLoginRequired) {
      // Unlocked mode: Automatically authenticate default admin and show POS
      const unlockedUser = { id: 1, name: 'Administrator', username: 'admin', role: 'admin' };
      this.saveSession(unlockedUser);
      this.setUserSession(unlockedUser);
      this.showApp();
      this.navigate('pos');
      return;
    }

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

    // Topbar back button
    const topbarBackBtn = document.getElementById('btn-topbar-back');
    if (topbarBackBtn) {
      topbarBackBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleBackButton();
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
      // Do not auto-logout if login is disabled
      if (this.settings.require_login === '0' || this.settings.require_login === false) {
        return;
      }
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
    if (this.settings.require_login === '0' || this.settings.require_login === false) {
      const unlockedUser = { id: 1, name: 'Administrator', username: 'admin', role: 'admin' };
      this.saveSession(unlockedUser);
      this.setUserSession(unlockedUser);
      this.showApp();
      return true;
    }

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
  updateBiometricLoginUI() {
    const biometricsRaw = localStorage.getItem('restobill_biometrics');
    let hasBiometrics = false;
    try {
      if (biometricsRaw) {
        const biometrics = JSON.parse(biometricsRaw);
        if (Object.keys(biometrics).length > 0) hasBiometrics = true;
      }
    } catch (e) {}

    const bioWrap = document.getElementById('biometric-login-wrap') || document.querySelector('.biometric-login-wrap');
    if (bioWrap) {
      bioWrap.style.display = hasBiometrics ? 'block' : 'none';
    }
  },

  async handleBiometricLogin() {
    const biometricsRaw = localStorage.getItem('restobill_biometrics');
    let biometrics = {};
    try {
      if (biometricsRaw) biometrics = JSON.parse(biometricsRaw);
    } catch (e) {}

    const registeredUsernames = Object.keys(biometrics);
    if (registeredUsernames.length === 0) {
      this.showToast('No fingerprint registered yet. Please sign in with ID & Password first and register your fingerprint in Users or Settings.', 'info', 5000);
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
              <span style="font-size:24px;">👆</span>
              <div>
                <div style="font-size:14px;color:var(--text-primary);font-weight:700;">${p.name || u}</div>
                <div style="font-size:11px;color:var(--text-muted);">@${u} &bull; ${role}</div>
              </div>
            </div>
            <span style="font-size:13px;color:var(--accent-primary);font-weight:700;">Tap to Login →</span>
          </button>
        `;
      }).join('');

      this.showModal({
        title: '👆 Select Account for Fingerprint Login',
        bodyHtml: `
          <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
            Choose your registered account to authenticate with fingerprint:
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
    const biometricsRaw = localStorage.getItem('restobill_biometrics');
    let biometrics = {};
    try {
      if (biometricsRaw) biometrics = JSON.parse(biometricsRaw);
    } catch (e) {}
    const profile = biometrics[username] || { name: displayName, username };

    try {
      if (!window.BiometricAuth) {
        this.showToast('Biometric service is loading. Please try again.', 'warning');
        return;
      }

      const avail = await window.BiometricAuth.checkAvailability();
      if (!avail.available) {
        this.showModal({
          title: '👆 Biometric Sensor Required',
          bodyHtml: `
            <div style="text-align:center;padding:16px 8px;">
              <div style="width:68px;height:68px;margin:0 auto 16px;border-radius:50%;background:rgba(239,68,68,0.12);border:2px dashed var(--color-danger);display:flex;align-items:center;justify-content:center;font-size:32px;">
                ⚠️
              </div>
              <h4 style="font-size:16px;font-weight:700;margin-bottom:8px;color:var(--text-primary);">Physical Sensor Not Detected</h4>
              <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5;">
                ${avail.reason || 'No biometric hardware sensor detected on this device.'}
              </p>
              <div style="font-size:12px;color:var(--text-muted);background:var(--bg-surface);padding:10px;border-radius:6px;border:1px solid var(--border-color);">
                💡 To login using your fingerprint, please open the RestoBill APK on an Android device with a physical fingerprint sensor.
              </div>
            </div>
          `,
          footerButtons: [
            {
              text: 'Sign In With Password',
              className: 'btn btn-primary btn-sm',
              onClick: () => {
                this.closeModal();
                const userInput = document.getElementById('login-username');
                if (userInput) userInput.value = username;
                const passInput = document.getElementById('login-password');
                if (passInput) passInput.focus();
              }
            }
          ]
        });
        return;
      }

      // Trigger REAL physical biometric prompt on hardware
      this.showToast('Touch your fingerprint sensor to authenticate...', 'info', 3000);
      await window.BiometricAuth.verify(username, profile);

      // Only reached if physical sensor verified successfully!
      await this.completeBiometricLogin(username, displayName);
    } catch (err) {
      console.error('Biometric authentication error:', err);
      const msg = err.message || '';
      if (msg.toLowerCase().includes('cancel') || msg.includes('USER_CANCEL') || msg.includes('16')) {
        this.showToast('Fingerprint authentication cancelled.', 'info', 3000);
      } else if (msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('mismatch')) {
        this.showToast('Fingerprint not recognized. Please touch with an enrolled finger.', 'error', 4000);
      } else {
        this.showToast(msg || 'Biometric verification failed. Please try again or use password.', 'error', 4000);
      }
    }
  },

  async completeBiometricLogin(username, displayName) {
    try {
      this.showToast('Verifying session...', 'info', 1000);
      const userRes = await window.api.auth.loginByUsername(username);
      if (userRes.success && userRes.data) {
        this.saveSession(userRes.data);
        this.setUserSession(userRes.data);
        this.showToast(`Fingerprint verified! Welcome, ${displayName}`, 'success');
        this.showApp();
      } else {
        this.showToast(userRes.error || 'Failed to authenticate user', 'error');
      }
    } catch (e) {
      this.showToast(e.message || 'Authentication error', 'error');
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

    const biometrics = JSON.parse(localStorage.getItem('restobill_biometrics') || '{}');

    const optionsHtml = staffList.map(s => {
      const isSelected = preselectedRole && (s.role === preselectedRole || s.username === preselectedRole);
      const isLinked = !!biometrics[s.username];
      return `<option value="${s.username}" ${isSelected ? 'selected' : ''}>
        ${s.name} (@${s.username} - ${s.role.toUpperCase()}) ${isLinked ? '✓ (Linked)' : ''}
      </option>`;
    }).join('');

    const initialUser = staffList.find(s => preselectedRole && (s.username === preselectedRole || s.role === preselectedRole)) || staffList[0];
    const initialLinked = initialUser ? !!biometrics[initialUser.username] : false;

    this.showModal({
      title: '👆 Register Device Fingerprint',
      bodyHtml: `
        <div style="background:rgba(249, 115, 22, 0.08);border:1px solid rgba(249, 115, 22, 0.25);border-radius:8px;padding:12px;margin-bottom:16px;">
          <div style="font-weight:700;font-size:12px;color:var(--accent-primary);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
            <span>🔒</span> Device Biometric Security
          </div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
            Registering links your Android phone's fingerprint to this staff role for instant one-touch login without typing passwords.
          </div>
        </div>

        <div class="form-group">
          <label style="font-weight:600;font-size:13px;">Select Staff Account / Role</label>
          <select id="modal-bio-username" class="input-sm" style="width:100%;height:38px;">
            ${optionsHtml}
          </select>
          <div id="modal-bio-status" style="font-size:12px;margin-top:6px;min-height:18px;"></div>
        </div>

        <div class="form-group">
          <label style="font-weight:600;font-size:13px;">Confirm Account Password</label>
          <input type="password" id="modal-bio-password" placeholder="Enter password to authorize" style="width:100%;" autocomplete="current-password">
          <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:4px;">
            Enter your account password (or current administrator password) to authorize registration.
          </span>
        </div>
      `,
      footerButtons: [
        {
          text: 'Cancel',
          className: 'btn btn-outline btn-sm',
          onClick: () => this.closeModal()
        },
        {
          text: 'Remove Fingerprint',
          className: 'btn btn-outline btn-danger btn-sm',
          onClick: () => {
            const username = document.getElementById('modal-bio-username')?.value;
            if (!username) return;
            const bios = JSON.parse(localStorage.getItem('restobill_biometrics') || '{}');
            if (bios[username]) {
              delete bios[username];
              localStorage.setItem('restobill_biometrics', JSON.stringify(bios));
            }
            this.showToast(`Fingerprint unlinked for @${username}`, 'info');
            this.updateBiometricLoginUI();
            if (window.UsersUI?.fetchUsers) window.UsersUI.fetchUsers();
            if (window.UsersUI?.renderGrid) window.UsersUI.renderGrid();
            this.closeModal();
          }
        },
        {
          text: 'Scan & Register Fingerprint',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const username = document.getElementById('modal-bio-username')?.value;
            const password = document.getElementById('modal-bio-password')?.value;
            if (!username) return;

            const targetUser = staffList.find(s => s.username === username) || { username, name: username, role: 'staff' };

            // Authorization verification
            if (password) {
              this.showToast('Verifying authorization...', 'info', 1000);
              let authRes = await window.api.auth.login(username, password);
              // Also allow current admin password if registering for another staff member
              if (!authRes.success && this.currentUser?.username) {
                authRes = await window.api.auth.login(this.currentUser.username, password);
              }
              if (!authRes.success) {
                this.showToast(authRes.error || 'Password verification failed. Incorrect password.', 'error');
                return;
              }
            } else if (this.currentUser?.role !== 'admin') {
              this.showToast('Please enter password to confirm authorization', 'warning');
              return;
            }

            // Check hardware sensor availability before trying to scan
            if (!window.BiometricAuth) {
              this.showToast('Biometric service is not loaded.', 'error');
              return;
            }

            const avail = await window.BiometricAuth.checkAvailability();
            if (!avail.available) {
              this.showToast(avail.reason || 'No biometric hardware sensor detected on this device.', 'error', 6000);
              return;
            }

            try {
              this.showToast('Touch your fingerprint sensor to register...', 'info', 4000);
              const enrollRes = await window.BiometricAuth.enroll(username, targetUser.name);

              // Save verified fingerprint profile
              const biometricsStore = JSON.parse(localStorage.getItem('restobill_biometrics') || '{}');
              biometricsStore[username] = {
                username: targetUser.username,
                name: targetUser.name,
                role: targetUser.role,
                mode: enrollRes.mode,
                credentialId: enrollRes.credentialId || null,
                registeredAt: new Date().toISOString()
              };
              localStorage.setItem('restobill_biometrics', JSON.stringify(biometricsStore));

              this.updateBiometricLoginUI();
              if (window.UsersUI?.fetchUsers) window.UsersUI.fetchUsers();
              if (window.UsersUI?.renderGrid) window.UsersUI.renderGrid();

              this.showToast(`Fingerprint linked successfully for ${targetUser.name}!`, 'success', 5000);
              this.closeModal();
            } catch (scanErr) {
              console.error('Biometric enrollment failed:', scanErr);
              const msg = scanErr.message || '';
              if (msg.toLowerCase().includes('cancel') || msg.includes('USER_CANCEL') || msg.includes('16')) {
                this.showToast('Fingerprint registration cancelled.', 'info', 3000);
              } else {
                this.showToast(msg || 'Fingerprint registration failed. Please touch the sensor with a clean enrolled finger.', 'error', 5000);
              }
            }
          }
        }
      ]
    });

    // Update dynamic status on dropdown change
    setTimeout(async () => {
      const select = document.getElementById('modal-bio-username');
      const updateStatus = async () => {
        const u = select ? select.value : '';
        const bios = JSON.parse(localStorage.getItem('restobill_biometrics') || '{}');
        const isLinked = !!bios[u];
        const statusEl = document.getElementById('modal-bio-status');
        if (!statusEl) return;

        let hardwareNote = '';
        if (window.BiometricAuth) {
          try {
            const avail = await window.BiometricAuth.checkAvailability();
            if (avail.available) {
              hardwareNote = `<div style="font-size:11px;color:var(--color-success);margin-top:4px;">✓ Hardware sensor ready: <b>${avail.label}</b></div>`;
            } else {
              hardwareNote = `<div style="font-size:11px;color:var(--color-warning);margin-top:4px;">⚠️ ${avail.reason || 'Hardware sensor not detected'}</div>`;
            }
          } catch (e) {}
        }

        statusEl.innerHTML = (isLinked
          ? `<div style="color:var(--color-success);font-weight:600;">✓ Fingerprint is currently registered for @${u}</div>`
          : `<div style="color:var(--text-muted);">No fingerprint linked yet for @${u}</div>`) + hardwareNote;
      };

      if (select) {
        select.addEventListener('change', updateStatus);
        await updateStatus();
      }
    }, 50);
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
    if (this.settings.require_login === '0' || this.settings.require_login === false) {
      this.showToast('Login is disabled in Settings. RestoBill is permanently unlocked.', 'info', 3000);
      return;
    }
    this.clearSession();
    this.showLogin();
    if (isTimeout) {
      this.showToast('Session expired after 30 minutes of inactivity. Please sign in.', 'warning', 4000);
    } else {
      this.showToast('You have been logged out', 'info');
    }
  },

  showLogin() {
    if (this.settings.require_login === '0' || this.settings.require_login === false) {
      const unlockedUser = { id: 1, name: 'Administrator', username: 'admin', role: 'admin' };
      this.saveSession(unlockedUser);
      this.setUserSession(unlockedUser);
      this.showApp();
      return;
    }

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

    this.updateBiometricLoginUI();
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

    this.navigationHistory = [];
    this.navigate('pos', false);
  },

  navigate(pageId, pushHistory = true) {
    if (!this.canAccessPage(pageId)) {
      this.showToast('Access denied: You do not have permission to view this section', 'warning');
      if (this.canAccessPage(this.activePage)) {
        return;
      }
      pageId = 'pos';
    }

    const prevPage = this.activePage;

    // Track navigation history stack
    if (pushHistory && pageId !== prevPage) {
      if (!this.navigationHistory) this.navigationHistory = [];
      if (pageId === 'pos') {
        // Navigating back to POS root clears history
        this.navigationHistory = [];
      } else {
        if (this.navigationHistory[this.navigationHistory.length - 1] !== prevPage) {
          this.navigationHistory.push(prevPage);
        }
        if (this.navigationHistory.length > 25) {
          this.navigationHistory.shift();
        }
      }
    }

    this.activePage = pageId;

    // Toggle on-screen topbar back button visibility (visible when away from POS)
    const topbarBackBtn = document.getElementById('btn-topbar-back');
    if (topbarBackBtn) {
      if (pageId !== 'pos') {
        topbarBackBtn.classList.remove('hidden');
      } else {
        topbarBackBtn.classList.add('hidden');
      }
    }

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

  // ─── Android & Hardware Back Button Navigation Handler ─────────
  setupBackButtonHandler() {
    this.navigationHistory = [];
    this.lastBackPressTime = 0;
    this._lastBackHandled = 0;

    // 1. Capacitor Native App Plugin listener (Android hardware / gesture back navigation)
    try {
      const cap = window.Capacitor;
      const CapApp = cap?.Plugins?.App || (cap?.registerPlugin ? cap.registerPlugin('App') : null);
      if (CapApp && typeof CapApp.addListener === 'function') {
        CapApp.addListener('backButton', () => {
          this.handleBackButton();
        });
      }
    } catch (e) {
      console.warn('Capacitor App.addListener error:', e);
    }

    // 2. Cordova / WebView 'backbutton' document event
    document.addEventListener('backbutton', (e) => {
      if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      }
      this.handleBackButton();
    }, false);

    // 3. Browser popstate event (mobile browser navigation / history)
    window.addEventListener('popstate', () => {
      this.handleBackButton();
    });

    // Expose globally so native Android or other components can invoke it directly
    window.handleAndroidBackButton = () => this.handleBackButton();
  },

  handleBackButton() {
    const now = Date.now();
    // Debounce to prevent duplicate invocations within 250ms (if native & document events both trigger)
    if (this._lastBackHandled && (now - this._lastBackHandled) < 250) {
      return true;
    }
    this._lastBackHandled = now;

    // 1. Check if on Login Screen
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen && !loginScreen.classList.contains('hidden') && loginScreen.classList.contains('active')) {
      const modalOverlay = document.getElementById('modal-overlay');
      if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
        this.closeModal();
        return true;
      }
      if (now - this.lastBackPressTime < 2000) {
        this.exitOrMinimizeApp();
        return true;
      } else {
        this.lastBackPressTime = now;
        this.showToast('Press back again to exit RestoBill', 'info', 2000);
        return true;
      }
    }

    // 2. Modal Dialog Overlay open -> Close modal
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
      this.closeModal();
      return true;
    }

    // 3. Slide-in Order Detail Panel open -> Close detail panel
    const detailPanel = document.getElementById('order-detail-panel');
    if (detailPanel && !detailPanel.classList.contains('hidden')) {
      this.closeDetailPanel();
      return true;
    }

    // 4. Mobile Sidebar Drawer open -> Close sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      this.closeMobileSidebar();
      return true;
    }

    // 5. POS screen sub-views & edit mode
    if (this.activePage === 'pos') {
      // 5a. If viewing mobile cart, return to menu items view
      const posLayout = document.getElementById('pos-layout');
      if (posLayout && posLayout.classList.contains('show-cart')) {
        const tabPosMenu = document.getElementById('tab-pos-menu');
        const tabPosCart = document.getElementById('tab-pos-cart');
        const floatingBar = document.getElementById('pos-mobile-floating-bar');
        posLayout.classList.remove('show-cart');
        tabPosMenu?.classList.add('active');
        tabPosCart?.classList.remove('active');
        if (window.POS?.cart?.length > 0 && floatingBar) {
          floatingBar.classList.remove('hidden');
        }
        return true;
      }

      // 5b. If editing an existing order, prompt/cancel edit
      if (window.POS?.editingOrderId) {
        window.POS.cancelEditingOrder(true);
        return true;
      }
    }

    // 6. Menu screen sub-tabs (Categories -> Items)
    if (this.activePage === 'menu') {
      if (window.MenuUI && window.MenuUI.activeTab === 'categories') {
        window.MenuUI.switchTab('items');
        return true;
      }
    }

    // 7. Settings screen sub-tabs (any other tab -> Restaurant tab)
    if (this.activePage === 'settings') {
      if (window.SettingsUI && window.SettingsUI.activeTab !== 'restaurant') {
        const restTabBtn = document.querySelector('.settings-tab[data-settings-tab="restaurant"]');
        if (restTabBtn) {
          restTabBtn.click();
        } else {
          window.SettingsUI.activeTab = 'restaurant';
          window.SettingsUI.render();
        }
        return true;
      }
    }

    // 8. Reports screen sub-tabs (any other tab -> Sales Report tab)
    if (this.activePage === 'reports') {
      if (window.ReportsUI && window.ReportsUI.activeTab !== 'sales-report') {
        const salesTabBtn = document.querySelector('#page-reports .tab-btn[data-tab="sales-report"]');
        if (salesTabBtn) {
          salesTabBtn.click();
        } else {
          window.ReportsUI.activeTab = 'sales-report';
          window.ReportsUI.generateReport();
        }
        return true;
      }
    }

    // 9. Page-level Navigation History Stack
    if (this.navigationHistory && this.navigationHistory.length > 0) {
      let prevPage = this.navigationHistory.pop();
      while (prevPage === this.activePage && this.navigationHistory.length > 0) {
        prevPage = this.navigationHistory.pop();
      }
      if (prevPage && prevPage !== this.activePage && this.canAccessPage(prevPage)) {
        this.navigate(prevPage, false);
        return true;
      }
    }

    // 10. If on any non-POS screen and history is empty, return to POS
    if (this.activePage !== 'pos') {
      this.navigate('pos', false);
      return true;
    }

    // 11. Already on Root Screen (POS) with nothing to close:
    // Prompt to exit: Double press back within 2 seconds
    if (now - this.lastBackPressTime < 2000) {
      this.exitOrMinimizeApp();
      return true;
    } else {
      this.lastBackPressTime = now;
      this.showToast('Press back again to exit RestoBill', 'info', 2000);
      return true;
    }
  },

  exitOrMinimizeApp() {
    // 1. Try Native Android App Bridge (clean background minimize without losing state)
    if (window.AndroidAppBridge && typeof window.AndroidAppBridge.minimizeApp === 'function') {
      try {
        window.AndroidAppBridge.minimizeApp();
        return;
      } catch (e) {
        console.warn('AndroidAppBridge minimize error:', e);
      }
    }

    // 2. Try Capacitor App Plugin exitApp
    try {
      const cap = window.Capacitor;
      const CapApp = cap?.Plugins?.App || (cap?.registerPlugin ? cap.registerPlugin('App') : null);
      if (CapApp && typeof CapApp.exitApp === 'function') {
        CapApp.exitApp();
        return;
      }
    } catch (e) {
      console.warn('Capacitor App.exitApp error:', e);
    }

    // 3. Fallback to AndroidAppBridge exitApp
    if (window.AndroidAppBridge && typeof window.AndroidAppBridge.exitApp === 'function') {
      try {
        window.AndroidAppBridge.exitApp();
        return;
      } catch (e) {}
    }

    // 4. Fallback for Cordova / other Android webview
    if (navigator.app && typeof navigator.app.exitApp === 'function') {
      navigator.app.exitApp();
      return;
    }

    // 5. Browser window.close fallback
    try {
      window.close();
    } catch (e) {}
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
      button.className = btn.className || btn.class || 'btn btn-outline btn-sm';
      button.textContent = btn.text;
      const handler = btn.onClick || btn.action;
      button.addEventListener('click', (e) => {
        if (handler) {
          handler(e, this);
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
  getLocalDateString(d = new Date()) {
    const dateObj = (d instanceof Date) ? d : new Date(d);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

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
          <div class="preview-header-top">
            <div class="preview-title-box">
              <h3>Print Preview: ${orderNo}</h3>
              <p>${orderData.customer_name ? `Customer: ${this.escapeHtml(orderData.customer_name)} • ` : ''}${totalFormatted} • ${(orderData.payment_mode || 'cash').toUpperCase()}</p>
            </div>
            <button type="button" class="btn-icon preview-close-top-btn" id="btn-preview-top-close" title="Close Preview">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
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
            <button type="button" class="btn btn-primary btn-sm preview-btn" id="btn-preview-print">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd"/></svg>
              <span>Print Now</span>
            </button>
            <button type="button" class="btn btn-outline btn-sm preview-btn" id="btn-preview-pdf">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
              <span>Save PDF</span>
            </button>
            <button type="button" class="btn btn-outline btn-sm preview-btn btn-preview-wa" id="btn-preview-whatsapp" style="border-color:#22c55e;color:#22c55e;" title="Share bill directly on WhatsApp">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/></svg>
              <span>WhatsApp</span>
            </button>
            <button type="button" class="btn btn-outline btn-sm preview-btn btn-preview-mail" id="btn-preview-email" style="border-color:#3b82f6;color:#60a5fa;" title="Share bill via Email">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
              <span>Email</span>
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
    const btnWhatsApp = document.getElementById('btn-preview-whatsapp');
    const btnEmail = document.getElementById('btn-preview-email');
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

    if (btnWhatsApp) {
      btnWhatsApp.onclick = () => {
        this.shareOrderOnWhatsApp(orderData);
      };
    }

    if (btnEmail) {
      btnEmail.onclick = () => {
        this.shareOrderViaEmail(orderData);
      };
    }

    const closePreview = () => {
      previewOverlay.classList.add('hidden');
    };

    const btnTopClose = document.getElementById('btn-preview-top-close');
    if (btnTopClose) btnTopClose.onclick = closePreview;
    if (btnClose) btnClose.onclick = closePreview;
    previewOverlay.onclick = (e) => {
      if (e.target === previewOverlay) closePreview();
    };
  },

  // ─── Direct WhatsApp & Email Bill Sharing ────────────────────────
  generateOrderBillText(order) {
    if (!order) return '';
    const s = this.settings || {};
    const restaurantName = s.restaurant_name || 'RestoBill Restaurant';
    const address = s.restaurant_address || '';
    const phone = s.restaurant_phone || '';
    const gstin = s.gstin || '';
    const sym = s.currency_symbol || '₹';

    const orderNo = order.order_no || 'Bill';
    const dateFormatted = order.created_at ? this.formatDateTime(order.created_at) : this.formatDateTime(new Date());
    const orderType = (order.order_type || 'dine_in').replace('_', ' ').toUpperCase();
    const tableInfo = order.table_no ? ` (Table: ${order.table_no})` : '';
    const customerName = order.customer_name || 'Walk-in Customer';
    const customerPhone = order.customer_phone ? ` | Ph: ${order.customer_phone}` : '';

    const lines = [];
    lines.push(`🧾 *${restaurantName.toUpperCase()}*`);
    if (address) lines.push(address.replace(/\n/g, ', '));
    if (phone) lines.push(`📞 ${phone}`);
    if (gstin) lines.push(`GSTIN: ${gstin}`);
    lines.push('──────────────────────────────');
    lines.push(`*Invoice #:* ${orderNo}`);
    lines.push(`*Date:* ${dateFormatted}`);
    lines.push(`*Type:* ${orderType}${tableInfo}`);
    lines.push(`*Customer:* ${customerName}${customerPhone}`);
    lines.push('──────────────────────────────');
    lines.push('*ITEMS ORDERED:*');

    const items = order.items || [];
    if (items.length > 0) {
      items.forEach((item, idx) => {
        const qty = item.quantity || 1;
        const price = parseFloat(item.price || 0);
        const itemTotal = (qty * price).toFixed(2);
        lines.push(`${idx + 1}. ${item.name} × ${qty} = ${sym}${itemTotal}`);
      });
    } else {
      lines.push('• Bill summary (Items as per register)');
    }

    lines.push('──────────────────────────────');
    lines.push(`Subtotal: ${sym}${parseFloat(order.subtotal || 0).toFixed(2)}`);
    if (parseFloat(order.cgst || 0) > 0) {
      lines.push(`CGST: ${sym}${parseFloat(order.cgst).toFixed(2)}`);
    }
    if (parseFloat(order.sgst || 0) > 0) {
      lines.push(`SGST: ${sym}${parseFloat(order.sgst).toFixed(2)}`);
    }
    if (parseFloat(order.discount_amount || 0) > 0) {
      lines.push(`Discount: -${sym}${parseFloat(order.discount_amount).toFixed(2)}`);
    }
    if (parseFloat(order.round_off || 0) !== 0) {
      const sign = parseFloat(order.round_off) > 0 ? '+' : '';
      lines.push(`Round Off: ${sign}${sym}${parseFloat(order.round_off).toFixed(2)}`);
    }
    lines.push(`*GRAND TOTAL: ${sym}${parseFloat(order.total || 0).toFixed(2)}*`);
    lines.push(`*Payment Mode:* ${(order.payment_mode || 'cash').toUpperCase()} (${(order.status || 'completed').toUpperCase()})`);
    lines.push('──────────────────────────────');
    lines.push('Thank you for dining with us! Visit again! 🙏');

    return lines.join('\n');
  },

  // ─── PDF Invoice Generation ───────────────────────────────────────
  generateOrderPdfDoc(order, settings = {}) {
    const s = settings || this.settings || {};
    const restaurantName = s.restaurant_name || 'RestoBill Restaurant';
    const address = s.restaurant_address || '';
    const phone = s.restaurant_phone || '';
    const gstin = s.gstin || '';
    const fssai = s.fssai_no || '';
    const footerText = s.footer_text || 'Thank you for dining with us! Visit again!';
    const items = order.items || [];

    // 80mm roll format: 80mm width with dynamic height
    const minHeight = 160;
    const computedHeight = Math.max(minHeight, 130 + (items.length * 9) + (order.notes ? 10 : 0));

    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFClass) {
      throw new Error('PDF generator library (jsPDF) is not loaded');
    }

    const doc = new jsPDFClass({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, computedHeight]
    });

    const pageWidth = 80;
    const margin = 5;
    const contentWidth = pageWidth - (margin * 2);
    let y = 8;

    // Header - Restaurant Name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(restaurantName, pageWidth / 2, y, { align: 'center' });
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    if (address) {
      const splitAddress = doc.splitTextToSize(address, contentWidth);
      doc.text(splitAddress, pageWidth / 2, y, { align: 'center' });
      y += (splitAddress.length * 3.5);
    }
    if (phone) {
      doc.text(`Phone: ${phone}`, pageWidth / 2, y, { align: 'center' });
      y += 3.5;
    }
    if (gstin) {
      doc.text(`GSTIN: ${gstin}`, pageWidth / 2, y, { align: 'center' });
      y += 3.5;
    }
    if (fssai) {
      doc.text(`FSSAI: ${fssai}`, pageWidth / 2, y, { align: 'center' });
      y += 3.5;
    }

    // Divider
    y += 1;
    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(s.receipt_header_title || 'TAX INVOICE / BILL RECEIPT', pageWidth / 2, y, { align: 'center' });
    y += 4;

    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    // Order Info
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Invoice No: ${order.order_no || order.id}`, margin, y);
    y += 3.5;

    const dateStr = order.created_at ? new Date(order.created_at).toLocaleString('en-IN') : new Date().toLocaleString('en-IN');
    doc.text(`Date: ${dateStr}`, margin, y);
    y += 3.5;

    if (order.table_no) {
      doc.text(`Table: ${order.table_no}   Type: ${(order.order_type || 'dine_in').toUpperCase()}`, margin, y);
      y += 3.5;
    } else {
      doc.text(`Order Type: ${(order.order_type || 'dine_in').toUpperCase()}`, margin, y);
      y += 3.5;
    }

    if (order.customer_name || order.customer_phone) {
      const custStr = [order.customer_name, order.customer_phone].filter(Boolean).join(' - ');
      doc.text(`Customer: ${custStr}`, margin, y);
      y += 3.5;
    }

    // Divider
    y += 1;
    doc.line(margin, y, pageWidth - margin, y);
    y += 3.5;

    // Table Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('Item', margin, y);
    doc.text('Qty', 44, y, { align: 'center' });
    doc.text('Rate', 58, y, { align: 'right' });
    doc.text('Amt', pageWidth - margin, y, { align: 'right' });
    y += 2;
    doc.line(margin, y, pageWidth - margin, y);
    y += 3.5;

    // Items
    doc.setFont('helvetica', 'normal');
    for (const item of items) {
      const itemName = item.name || 'Item';
      const qty = String(item.quantity || 1);
      const rate = `Rs. ${parseFloat(item.price || 0).toFixed(2)}`;
      const lineTotal = `Rs. ${parseFloat(item.total || (item.price * item.quantity)).toFixed(2)}`;

      const splitName = doc.splitTextToSize(itemName, 36);
      doc.text(splitName, margin, y);
      doc.text(qty, 44, y, { align: 'center' });
      doc.text(rate, 58, y, { align: 'right' });
      doc.text(lineTotal, pageWidth - margin, y, { align: 'right' });
      y += (splitName.length * 3.5);
      if (item.notes) {
        doc.setFontSize(6.5);
        doc.setTextColor(110);
        doc.text(`  (${item.notes})`, margin, y);
        doc.setFontSize(7.5);
        doc.setTextColor(0);
        y += 3;
      }
    }

    // Divider
    y += 1;
    doc.line(margin, y, pageWidth - margin, y);
    y += 3.5;

    // Totals
    const rightValX = pageWidth - margin;
    const labelX = 40;

    doc.text('Subtotal:', labelX, y);
    doc.text(`Rs. ${parseFloat(order.subtotal || 0).toFixed(2)}`, rightValX, y, { align: 'right' });
    y += 3.5;

    if (parseFloat(order.discount_amount || 0) > 0) {
      doc.text('Discount:', labelX, y);
      doc.text(`-Rs. ${parseFloat(order.discount_amount).toFixed(2)}`, rightValX, y, { align: 'right' });
      y += 3.5;
    }
    if (parseFloat(order.cgst || 0) > 0) {
      doc.text('CGST:', labelX, y);
      doc.text(`Rs. ${parseFloat(order.cgst).toFixed(2)}`, rightValX, y, { align: 'right' });
      y += 3.5;
    }
    if (parseFloat(order.sgst || 0) > 0) {
      doc.text('SGST:', labelX, y);
      doc.text(`Rs. ${parseFloat(order.sgst).toFixed(2)}`, rightValX, y, { align: 'right' });
      y += 3.5;
    }
    if (parseFloat(order.round_off || 0) !== 0) {
      doc.text('Round Off:', labelX, y);
      doc.text(`Rs. ${parseFloat(order.round_off).toFixed(2)}`, rightValX, y, { align: 'right' });
      y += 3.5;
    }

    // Grand Total
    y += 1;
    doc.setLineDashPattern([], 0); // solid line
    doc.line(margin, y, pageWidth - margin, y);
    y += 4.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('GRAND TOTAL:', margin, y);
    doc.text(`Rs. ${parseFloat(order.total || 0).toFixed(2)}`, rightValX, y, { align: 'right' });
    y += 5;

    doc.setLineDashPattern([1, 1], 0);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Payment: ${(order.payment_mode || 'cash').toUpperCase()} (${(order.status || 'completed').toUpperCase()})`, margin, y);
    y += 5;

    // Footer
    doc.setFontSize(7.5);
    doc.text(footerText, pageWidth / 2, y, { align: 'center' });

    return doc;
  },

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result || '';
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  async shareFileNativeOrWeb({ filename, blob, title, text, dialogTitle = 'Share File' }) {
    // 1. Try Native Capacitor Plugins (Android APK)
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      try {
        const Filesystem = window.Capacitor.Plugins?.Filesystem || (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin('Filesystem') : null);
        const Share = window.Capacitor.Plugins?.Share || (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin('Share') : null);

        if (Filesystem && Share) {
          const base64Data = await this.blobToBase64(blob);
          const writeRes = await Filesystem.writeFile({
            path: filename,
            data: base64Data,
            directory: 'CACHE'
          });

          await Share.share({
            title: title || filename,
            text: text || '',
            files: [writeRes.uri],
            dialogTitle: dialogTitle
          });
          return true;
        }
      } catch (nativeErr) {
        console.warn('[Share] Capacitor Native share failed:', nativeErr);
      }
    }

    // 2. Try Standard Web Share API (Android Chrome / WebView)
    if (navigator.share) {
      try {
        const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: title || filename,
            text: text || '',
            files: [file]
          });
          return true;
        }
      } catch (webShareErr) {
        if (webShareErr.name !== 'AbortError') {
          console.warn('[Share] Web share failed:', webShareErr);
        } else {
          return false; // User dismissed
        }
      }
    }

    // 3. Fallback: Download file directly
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 3000);
    return false;
  },

  async shareOrderOnWhatsApp(order, targetPhone = null, shareAsPdf = true) {
    if (!order) return;
    const phone = targetPhone || order.customer_phone;
    const cleanPhone = phone ? String(phone).replace(/[^\d]/g, '') : '';
    const formattedPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const filename = `RestoBill_Invoice_${order.order_no || order.id}.pdf`;

    if (shareAsPdf) {
      try {
        const pdfDoc = this.generateOrderPdfDoc(order, this.settings);
        const pdfBlob = pdfDoc.output('blob');

        // Copy phone to clipboard so user can immediately search/paste in WhatsApp
        if (formattedPhone) {
          try {
            await navigator.clipboard.writeText(formattedPhone);
            this.showToast(`Customer phone (+${formattedPhone}) copied! Select WhatsApp to send PDF bill.`, 'success', 5000);
          } catch (e) {
            this.showToast(`Select WhatsApp to send PDF bill for Order #${order.order_no}`, 'info', 4000);
          }
        } else {
          this.showToast(`Select WhatsApp to send PDF bill for Order #${order.order_no}`, 'info', 4000);
        }

        const shared = await this.shareFileNativeOrWeb({
          filename: filename,
          blob: pdfBlob,
          title: `Bill Invoice #${order.order_no}`,
          text: `Invoice #${order.order_no} for ${order.customer_name || 'Customer'} from ${this.settings?.restaurant_name || 'RestoBill'}`,
          dialogTitle: 'Send Bill PDF via WhatsApp / Apps'
        });

        // Fallback for desktop browser: download file and open web WhatsApp
        if (!shared && formattedPhone) {
          const msg = `Dear Customer, please find attached the PDF invoice for your order #${order.order_no} from ${this.settings?.restaurant_name || 'RestoBill'}.`;
          window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(msg)}`, '_blank');
        }
        return;
      } catch (pdfErr) {
        console.error('[WhatsApp Share] PDF generation failed:', pdfErr);
        this.showToast('Could not generate PDF: ' + pdfErr.message, 'warning');
      }
    }

    // Plain text fallback
    if (!formattedPhone) {
      this.openShareBillModal(order, 'whatsapp');
      return;
    }
    const billText = this.generateOrderBillText(order);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(billText)}`;
    window.open(whatsappUrl, '_blank');
    this.showToast(`Opening WhatsApp for +${formattedPhone}...`, 'success');
  },

  async shareOrderViaEmail(order, targetEmail = null, shareAsPdf = true) {
    if (!order) return;
    const s = this.settings || {};
    const restaurantName = s.restaurant_name || 'RestoBill';
    const email = targetEmail || order.customer_email;
    const subject = `Tax Invoice & Bill Receipt: #${order.order_no} - ${restaurantName}`;
    const filename = `RestoBill_Invoice_${order.order_no || order.id}.pdf`;

    if (shareAsPdf) {
      try {
        const pdfDoc = this.generateOrderPdfDoc(order, s);
        const pdfBlob = pdfDoc.output('blob');

        if (email) {
          try {
            await navigator.clipboard.writeText(email);
            this.showToast(`Recipient email (${email}) copied! Select Email/Gmail app to send PDF.`, 'success', 5000);
          } catch (e) {
            this.showToast(`Select Email/Gmail to attach PDF bill`, 'info', 4000);
          }
        }

        const shared = await this.shareFileNativeOrWeb({
          filename: filename,
          blob: pdfBlob,
          title: subject,
          text: `Dear Customer,\n\nPlease find attached your tax invoice #${order.order_no} from ${restaurantName}.\n\nGrand Total: Rs. ${parseFloat(order.total || 0).toFixed(2)}\nDate: ${new Date(order.created_at || Date.now()).toLocaleString('en-IN')}\n\nThank you for dining with us!`,
          dialogTitle: 'Email Bill PDF'
        });

        if (!shared && email) {
          const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(this.generateOrderBillText(order))}`;
          window.open(mailtoUrl, '_blank');
        }
        return;
      } catch (pdfErr) {
        console.error('[Email Share] PDF generation failed:', pdfErr);
      }
    }

    if (!email) {
      this.openShareBillModal(order, 'email');
      return;
    }
    const billText = this.generateOrderBillText(order);
    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(billText)}`;
    window.open(mailtoUrl, '_blank');
    this.showToast(`Opening Email client for ${email}...`, 'success');
  },

  openShareBillModal(order, defaultFocus = 'whatsapp') {
    if (!order) return;
    const s = this.settings || {};
    const restaurantName = s.restaurant_name || 'RestoBill Restaurant';
    const billText = this.generateOrderBillText(order);
    const initialPhone = order.customer_phone || '';
    const initialEmail = order.customer_email || '';

    this.showModal({
      title: `📱 Share Bill: #${order.order_no}`,
      bodyHtml: `
        <div class="share-bill-dialog">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);margin-bottom:16px;">
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--text-primary);">Order #${order.order_no}</div>
              <div style="font-size:12px;color:var(--text-secondary);">${order.customer_name ? window.App.escapeHtml(order.customer_name) + ' • ' : ''}${window.App.formatDateTime(order.created_at || new Date())}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:800;font-size:16px;color:var(--accent-primary);">${window.App.formatCurrency(order.total || 0)}</div>
              <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;">${(order.payment_mode || 'cash')}</div>
            </div>
          </div>

          <!-- WhatsApp Section with PDF Attachment -->
          <div style="margin-bottom:16px;padding:14px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius-md);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#22c55e;font-size:14px;">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/></svg>
                Share via WhatsApp
              </div>
              <span style="font-size:11px;background:rgba(34,197,94,0.2);color:#22c55e;padding:2px 8px;border-radius:10px;font-weight:600;">PDF Attachment</span>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Customer WhatsApp Mobile Number</label>
              <input type="tel" id="share-modal-phone" class="input-sm" style="width:100%;font-size:14px;font-weight:600;" placeholder="Enter 10-digit mobile number..." value="${initialPhone}">
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-sm btn-primary" id="btn-share-modal-whatsapp-pdf" style="background:#22c55e;border-color:#22c55e;flex:1;min-width:180px;font-weight:700;">
                📎 Attach & Send PDF Bill ➔
              </button>
              <button type="button" class="btn btn-sm btn-outline" id="btn-share-modal-download-pdf" style="border-color:#22c55e;color:#22c55e;">
                📥 Download PDF
              </button>
              <button type="button" class="btn btn-sm btn-outline" id="btn-share-modal-whatsapp-text" style="color:var(--text-muted);font-size:11px;" title="Send traditional plain text receipt">
                💬 Text Only
              </button>
            </div>
          </div>

          <!-- Email Section with PDF Attachment -->
          <div style="margin-bottom:16px;padding:14px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:var(--radius-md);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <div style="display:flex;align-items:center;gap:8px;font-weight:700;color:#60a5fa;font-size:14px;">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
                Share via Email
              </div>
              <span style="font-size:11px;background:rgba(59,130,246,0.2);color:#60a5fa;padding:2px 8px;border-radius:10px;font-weight:600;">PDF Attachment</span>
            </div>
            <div class="form-group" style="margin-bottom:10px;">
              <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Customer Email Address</label>
              <input type="email" id="share-modal-email" class="input-sm" style="width:100%;font-size:14px;" placeholder="Enter customer email address..." value="${initialEmail}">
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-sm btn-primary" id="btn-share-modal-email-pdf" style="background:#3b82f6;border-color:#3b82f6;flex:1;min-width:180px;font-weight:700;">
                📎 Email PDF Bill ➔
              </button>
              <button type="button" class="btn btn-sm btn-outline" id="btn-share-modal-email-text" style="color:var(--text-muted);font-size:11px;">
                ✉️ Text Only
              </button>
            </div>
          </div>

          <!-- Live Bill Text Preview -->
          <div style="margin-bottom:8px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <label style="font-size:12px;font-weight:600;color:var(--text-secondary);margin:0;">Bill Message Preview:</label>
              <button type="button" class="btn btn-outline btn-sm" id="btn-share-copy-text" style="font-size:11px;padding:2px 8px;">
                📋 Copy Bill Text
              </button>
            </div>
            <textarea id="share-modal-bill-text" class="input-sm" style="width:100%;height:100px;font-family:monospace;font-size:11px;line-height:1.4;background:var(--bg-tertiary);resize:none;" readonly>${billText}</textarea>
          </div>
        </div>
      `,
      footerButtons: [
        { text: 'Close', className: 'btn btn-outline btn-sm' }
      ]
    });

    setTimeout(() => {
      const phoneInput = document.getElementById('share-modal-phone');
      const emailInput = document.getElementById('share-modal-email');
      const sendWaPdfBtn = document.getElementById('btn-share-modal-whatsapp-pdf');
      const sendWaTextBtn = document.getElementById('btn-share-modal-whatsapp-text');
      const downloadPdfBtn = document.getElementById('btn-share-modal-download-pdf');
      const sendEmailPdfBtn = document.getElementById('btn-share-modal-email-pdf');
      const sendEmailTextBtn = document.getElementById('btn-share-modal-email-text');
      const copyBtn = document.getElementById('btn-share-copy-text');

      if (defaultFocus === 'whatsapp' && phoneInput) phoneInput.focus();
      if (defaultFocus === 'email' && emailInput) emailInput.focus();

      if (sendWaPdfBtn) {
        sendWaPdfBtn.onclick = () => {
          const phone = phoneInput ? phoneInput.value.trim() : '';
          this.shareOrderOnWhatsApp(order, phone, true);
        };
      }

      if (sendWaTextBtn) {
        sendWaTextBtn.onclick = () => {
          const phone = phoneInput ? phoneInput.value.trim() : '';
          if (!phone) {
            this.showToast('Please enter a phone number', 'warning');
            phoneInput?.focus();
            return;
          }
          this.shareOrderOnWhatsApp(order, phone, false);
        };
      }

      if (downloadPdfBtn) {
        downloadPdfBtn.onclick = () => {
          try {
            const pdfDoc = this.generateOrderPdfDoc(order, this.settings);
            const fname = `RestoBill_Invoice_${order.order_no || order.id}.pdf`;
            pdfDoc.save(fname);
            this.showToast(`Invoice downloaded as ${fname}`, 'success');
          } catch (e) {
            this.showToast('PDF download failed: ' + e.message, 'error');
          }
        };
      }

      if (sendEmailPdfBtn) {
        sendEmailPdfBtn.onclick = () => {
          const email = emailInput ? emailInput.value.trim() : '';
          this.shareOrderViaEmail(order, email, true);
        };
      }

      if (sendEmailTextBtn) {
        sendEmailTextBtn.onclick = () => {
          const email = emailInput ? emailInput.value.trim() : '';
          if (!email) {
            this.showToast('Please enter an email address', 'warning');
            emailInput?.focus();
            return;
          }
          this.shareOrderViaEmail(order, email, false);
        };
      }

      if (copyBtn) {
        copyBtn.onclick = () => {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(billText).then(() => {
              this.showToast('Bill text copied to clipboard!', 'success');
            }).catch(() => {
              this.showToast('Failed to copy to clipboard', 'error');
            });
          } else {
            const ta = document.getElementById('share-modal-bill-text');
            if (ta) {
              ta.select();
              document.execCommand('copy');
              this.showToast('Bill text copied!', 'success');
            }
          }
        };
      }
    }, 60);
  },

  // ─── Export Data with Excel Format & Email Option ───────────────
  async exportDataWithEmail({ type, csvContent, title = 'Data', count = 0, totalAmount = null }) {
    if (!csvContent || csvContent.trim().length === 0) {
      this.showToast('No data to export', 'warning');
      return;
    }

    try {
      // 1. Download CSV immediately with UTF-8 BOM for Excel
      await window.api.app.exportData(type, csvContent);
      this.showToast(`CSV file for ${title} exported!`, 'success');

      // 2. Open Email & Excel import dialog
      const s = this.settings || {};
      const restaurantName = s.restaurant_name || 'RestoBill';
      const defaultEmail = s.restaurant_email || '';
      const dateStr = this.getLocalDateString();
      const subject = `RestoBill Export: ${title} (${dateStr}) - ${restaurantName}`;
      const totalText = totalAmount !== null ? ` | Total Amount: ${this.formatCurrency(totalAmount)}` : '';

      this.showModal({
        title: `📥 Export Complete: ${title}`,
        bodyHtml: `
          <div class="export-email-dialog">
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:var(--radius-md);margin-bottom:16px;">
              <div style="font-size:24px;">✅</div>
              <div style="flex:1;">
                <div style="font-weight:700;color:var(--color-success);font-size:14px;">CSV File Downloaded Successfully!</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
                  Encoded with UTF-8 BOM — directly compatible with <strong>Microsoft Excel</strong>, Google Sheets & Numbers.
                </div>
              </div>
            </div>

            <div style="padding:10px 14px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:var(--radius-md);margin-bottom:16px;font-size:13px;color:var(--text-secondary);">
              <div><strong>File:</strong> <code style="color:var(--text-primary);font-size:12px;">restobill_${type}_${dateStr}.csv</code></div>
              <div style="margin-top:4px;"><strong>Summary:</strong> ${count} records exported${totalText}</div>
            </div>

            <!-- Email Notification Section -->
            <div style="padding:14px;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-md);margin-bottom:16px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-weight:700;color:var(--text-primary);font-size:14px;">
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18" style="color:var(--accent-secondary);"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
                Email Export to Restaurant / Accountant
              </div>
              <div class="form-group" style="margin-bottom:10px;">
                <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Recipient Email ID</label>
                <input type="email" id="export-modal-email" class="input-sm" style="width:100%;" value="${defaultEmail}" placeholder="e.g. accountant@myrestaurant.com">
              </div>
              <div class="form-group" style="margin-bottom:12px;">
                <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Email Subject</label>
                <input type="text" id="export-modal-subject" class="input-sm" style="width:100%;" value="${subject}">
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-primary btn-sm" id="btn-export-send-mail" style="flex:1;min-width:200px;font-weight:700;">
                  📎 Send Email with Attached CSV
                </button>
                <button type="button" class="btn btn-outline btn-sm" id="btn-export-copy-csv" title="Copy raw CSV to clipboard">
                  📋 Copy CSV Data
                </button>
                <button type="button" class="btn btn-outline btn-sm" id="btn-export-plain-mailto" style="font-size:11px;color:var(--text-muted);" title="Open standard mailto">
                  ✉️ Text Only
                </button>
              </div>
            </div>
          </div>
        `,
        footerButtons: [
          { text: 'Done', className: 'btn btn-outline btn-sm' }
        ]
      });

      setTimeout(() => {
        const emailInput = document.getElementById('export-modal-email');
        const subjectInput = document.getElementById('export-modal-subject');
        const sendMailBtn = document.getElementById('btn-export-send-mail');
        const copyCsvBtn = document.getElementById('btn-export-copy-csv');
        const plainMailBtn = document.getElementById('btn-export-plain-mailto');

        if (sendMailBtn) {
          sendMailBtn.onclick = async () => {
            const toEmail = (emailInput?.value || '').trim();
            const subj = (subjectInput?.value || subject).trim();
            const filename = `restobill_${type}_${dateStr}.csv`;
            const emailBodyText = `Dear Restaurant Manager / Accountant,\n\nPlease find attached the exported ${title} CSV report from ${restaurantName}.\n\nRecords: ${count}${totalText}\nDate: ${dateStr}\n\nGenerated by RestoBill Billing Software.`;

            if (toEmail) {
              try {
                await navigator.clipboard.writeText(toEmail);
                this.showToast(`Recipient email (${toEmail}) copied! Select Gmail / Email app to attach CSV file.`, 'success', 5000);
              } catch (e) {
                this.showToast('Select Gmail or Email app to send CSV file', 'info', 4000);
              }
            } else {
              this.showToast('Select Gmail or Email app to send CSV file', 'info', 4000);
            }

            const bom = '\uFEFF';
            const fileContent = csvContent.startsWith(bom) ? csvContent : bom + csvContent;
            const csvBlob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });

            const shared = await this.shareFileNativeOrWeb({
              filename: filename,
              blob: csvBlob,
              title: subj,
              text: emailBodyText,
              dialogTitle: 'Send CSV Report via Email / Apps'
            });

            if (!shared && toEmail) {
              const mailtoUrl = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(emailBodyText)}`;
              window.open(mailtoUrl, '_blank');
            }
          };
        }

        if (plainMailBtn) {
          plainMailBtn.onclick = () => {
            const toEmail = (emailInput?.value || '').trim();
            const subj = (subjectInput?.value || subject).trim();
            const sampleRows = csvContent.split('\n').slice(0, 15).join('\n');
            const truncatedNote = csvContent.split('\n').length > 15 ? `\n... [${csvContent.split('\n').length - 15} more rows in the downloaded CSV file]` : '';
            const emailBody = `Dear Restaurant Manager / Accountant,\n\nPlease find the exported ${title} data below:\n\nRestaurant: ${restaurantName}\nDate: ${dateStr}\nRecords: ${count}${totalText}\nFile Downloaded: restobill_${type}_${dateStr}.csv\n\n=== EXCEL IMPORT / CSV DATA PREVIEW ===\n${sampleRows}${truncatedNote}\n\nGenerated by RestoBill Billing Software.`;

            const mailtoUrl = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(emailBody)}`;
            window.open(mailtoUrl, '_blank');
            this.showToast(`Email client opened for ${toEmail || 'export'}`, 'success');
          };
        }

        if (copyCsvBtn) {
          copyCsvBtn.onclick = () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(csvContent).then(() => {
                this.showToast('Full CSV content copied to clipboard!', 'success');
              }).catch(() => {
                this.showToast('Failed to copy CSV', 'error');
              });
            } else {
              this.showToast('Clipboard not available', 'warning');
            }
          };
        }
      }, 50);

    } catch (err) {
      console.error('Export error:', err);
      this.showToast('Export failed: ' + err.message, 'error');
    }
  }
};

// Initialize App when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
