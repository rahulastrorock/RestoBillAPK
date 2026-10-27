/**
 * RestoBill - Settings Controller
 * Handles restaurant details, billing preferences, thermal printer setup, and Google Drive backup
 */

window.SettingsUI = {
  activeTab: 'restaurant',
  settings: {},
  unlockedTabs: { backup: false, metrics: false },

  async load() {
    this.unlockedTabs = { backup: false, metrics: false };
    try {
      const savedTab = localStorage.getItem('restobill_settings_tab');
      // Only restore non-protected tabs; backup & metrics require admin password
      if (savedTab && ['restaurant', 'billing', 'printer', 'about'].includes(savedTab)) {
        this.activeTab = savedTab;
      } else {
        this.activeTab = 'restaurant';
      }
    } catch (e) {
      this.activeTab = 'restaurant';
    }
    this.setupEventListeners();
    this.syncTabButtons();
    await this.fetchSettings();
    this.render();
  },

  syncTabButtons() {
    document.querySelectorAll('.settings-tab').forEach(t => {
      if (t.getAttribute('data-settings-tab') === this.activeTab) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });
  },

  setupEventListeners() {
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.onclick = async () => {
        const targetTab = tab.getAttribute('data-settings-tab') || 'restaurant';
        if (targetTab === 'backup' || targetTab === 'metrics') {
          if (!this.unlockedTabs[targetTab]) {
            const authorized = await this.promptAdminPassword(targetTab);
            if (!authorized) return;
          }
        }
        this.activeTab = targetTab;
        try {
          localStorage.setItem('restobill_settings_tab', this.activeTab);
        } catch (e) {}
        this.syncTabButtons();
        await this.fetchSettings();
        this.render();
      };
    });
  },

  promptAdminPassword(targetTab) {
    return new Promise((resolve) => {
      const tabTitle = targetTab === 'backup' ? 'Cloud Backup' : 'Cloud Metrics';
      const bodyHtml = `
        <div style="padding: 10px 0; text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(99, 102, 241, 0.12); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; font-size: 28px;">
            🔒
          </div>
          <h4 style="font-size: 17px; font-weight: 700; margin: 0 0 8px 0; color: var(--text-primary);">
            Administrator Password Required
          </h4>
          <p style="font-size: 13px; color: var(--text-secondary); margin: 0 0 20px 0; line-height: 1.5;">
            Access to <b>${tabTitle}</b> is restricted. Please enter your administrator password to unlock this page.
          </p>

          <div class="form-group" style="text-align: left; max-width: 320px; margin: 0 auto 10px auto;">
            <label style="font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; display: block;">Admin Password</label>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="password" id="modal-admin-pass-input" placeholder="Enter admin password"
                     style="width: 100%; padding: 10px 42px 10px 12px; font-size: 14px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-primary); box-sizing: border-box;" />
              <button type="button" id="btn-toggle-admin-pass" style="position: absolute; right: 10px; background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 16px; padding: 4px;" title="Show/Hide Password">
                👁️
              </button>
            </div>
            <div id="modal-admin-pass-error" style="display: none; color: #ef4444; font-size: 12px; margin-top: 6px; font-weight: 500;">
              ❌ Incorrect admin password. Please try again.
            </div>
          </div>
        </div>
      `;

      let resolved = false;

      const finish = (result) => {
        if (!resolved) {
          resolved = true;
          window.App.closeModal();
          resolve(result);
        }
      };

      const handleUnlock = async () => {
        const input = document.getElementById('modal-admin-pass-input');
        const errorEl = document.getElementById('modal-admin-pass-error');
        const val = input ? input.value : '';

        if (!val) {
          if (errorEl) {
            errorEl.textContent = 'Please enter your admin password.';
            errorEl.style.display = 'block';
          }
          if (input) input.focus();
          return;
        }

        try {
          const res = await window.api.auth.verifyAdminPassword(val);
          if (res && res.success && res.data === true) {
            this.unlockedTabs[targetTab] = true;
            window.App.showToast(`🔓 ${tabTitle} unlocked`, 'success');
            finish(true);
          } else {
            if (errorEl) {
              errorEl.textContent = '❌ Incorrect admin password. Please try again.';
              errorEl.style.display = 'block';
            }
            if (input) {
              input.value = '';
              input.focus();
            }
          }
        } catch (err) {
          if (errorEl) {
            errorEl.textContent = 'Verification error: ' + err.message;
            errorEl.style.display = 'block';
          }
        }
      };

      window.App.showModal({
        title: '🔒 Admin Authentication',
        bodyHtml,
        footerButtons: [
          {
            text: 'Cancel',
            className: 'btn btn-outline',
            onClick: () => finish(false)
          },
          {
            text: 'Unlock Page',
            className: 'btn btn-primary',
            onClick: handleUnlock
          }
        ]
      });

      setTimeout(() => {
        const input = document.getElementById('modal-admin-pass-input');
        const toggleBtn = document.getElementById('btn-toggle-admin-pass');
        if (input) {
          input.focus();
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleUnlock();
            }
          });
        }
        if (toggleBtn && input) {
          toggleBtn.addEventListener('click', () => {
            input.type = input.type === 'password' ? 'text' : 'password';
          });
        }

        const closeBtn = document.getElementById('modal-close');
        if (closeBtn) {
          const orig = closeBtn.onclick;
          closeBtn.onclick = () => {
            finish(false);
            if (orig) orig();
          };
        }
      }, 100);
    });
  },

  renderLockedTab(container, tabName) {
    const title = tabName === 'backup' ? 'Cloud Backup' : 'Cloud Metrics';
    container.innerHTML = `
      <div class="settings-section" style="text-align: center; padding: 60px 20px;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
        <h3 style="font-size: 20px; font-weight: 700; margin-bottom: 8px;">${title} is Password Protected</h3>
        <p style="color: var(--text-muted); font-size: 14px; max-width: 420px; margin: 0 auto 24px auto;">
          Access to this section is restricted to administrators. Please enter your administrator password to unlock.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button type="button" class="btn btn-outline" id="btn-back-restaurant">🏪 Back to Restaurant</button>
          <button type="button" class="btn btn-primary" id="btn-unlock-tab">🔓 Enter Admin Password</button>
        </div>
      </div>
    `;
    document.getElementById('btn-back-restaurant')?.addEventListener('click', () => {
      this.activeTab = 'restaurant';
      this.syncTabButtons();
      this.render();
    });
    document.getElementById('btn-unlock-tab')?.addEventListener('click', async () => {
      const ok = await this.promptAdminPassword(tabName);
      if (ok) {
        this.render();
      }
    });
  },

  async fetchSettings() {
    try {
      const res = await window.api.settings.getAll();
      if (res.success && res.data) {
        this.settings = res.data;
        window.App.settings = res.data;
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  },

  render() {
    const container = document.getElementById('settings-content');
    if (!container) return;

    this.syncTabButtons();

    // Enforce password protection for Cloud Backup and Cloud Metrics
    if ((this.activeTab === 'backup' || this.activeTab === 'metrics') && !this.unlockedTabs[this.activeTab]) {
      this.renderLockedTab(container, this.activeTab);
      return;
    }

    if (this.activeTab === 'restaurant') {
      this.renderRestaurantTab(container);
    } else if (this.activeTab === 'billing') {
      this.renderBillingTab(container);
    } else if (this.activeTab === 'printer') {
      this.renderPrinterTab(container);
    } else if (this.activeTab === 'backup') {
      this.renderBackupTab(container);
    } else if (this.activeTab === 'metrics') {
      this.renderMetricsTab(container);
    } else if (this.activeTab === 'about') {
      this.renderAboutTab(container);
    }
  },

  renderRestaurantTab(container) {
    const s = this.settings;
    container.innerHTML = `
      <div class="settings-section">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:6px;">Restaurant Profile</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">
          This business information will appear on the top of printed receipts and GST tax invoices.
        </p>

        <!-- App Security & Login Authentication Switch -->
        <div class="toggle-switch-card" style="border-left: 4px solid ${s.require_login !== '0' ? 'var(--color-success)' : 'var(--accent-primary)'}; margin-bottom: 24px;">
          <div style="flex:1;">
            <div style="font-weight:700;font-size:14px;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
              <span>🔒</span> Login & Authentication Requirement
              <span id="badge-require-login" style="font-size:11px;padding:2px 8px;border-radius:12px;font-weight:700;background:${s.require_login !== '0' ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.15)'};color:${s.require_login !== '0' ? 'var(--color-success)' : 'var(--accent-primary)'};">
                ${s.require_login !== '0' ? '● Login Required' : '🔓 Always Unlocked (Direct Access)'}
              </span>
            </div>
            <p id="desc-require-login" style="font-size:12px;color:var(--text-muted);margin:4px 0 0 0;line-height:1.4;">
              ${s.require_login !== '0'
                ? 'Authentication is active. Users must enter username and password to log in.'
                : 'Login is turned OFF. The app is always unlocked and anyone opening RestoBill can directly use POS and billing without signing in.'}
            </p>
          </div>
          <label class="toggle-switch" title="Toggle login authentication">
            <input type="checkbox" id="toggle-require-login" ${s.require_login !== '0' ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>

        <form id="settings-restaurant-form">
          <!-- Restaurant Logo Section -->
          <div class="form-group restaurant-logo-card" style="margin-bottom:20px;">
            <label style="font-weight:600;display:block;margin-bottom:8px;">Restaurant Logo</label>
            <div style="display:flex;align-items:center;gap:18px;padding:16px;background:var(--bg-tertiary);border:1px dashed var(--border-color);border-radius:var(--radius-md);">
              <div id="logo-preview-box" style="width:110px;height:80px;border-radius:var(--radius-sm);background:var(--bg-surface);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
                ${s.restaurant_logo ? `<img src="${s.restaurant_logo}" alt="Logo" style="max-width:100%;max-height:100%;object-fit:contain;">` : `<span style="font-size:11px;color:var(--text-muted);text-align:center;padding:4px;">No Logo</span>`}
              </div>
              <div style="flex:1;">
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
                  <input type="file" id="restaurant-logo-file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="display:none;">
                  <button type="button" class="btn btn-outline btn-sm" id="btn-upload-logo">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
                    ${s.restaurant_logo ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  <button type="button" class="btn btn-outline btn-sm btn-danger ${!s.restaurant_logo ? 'hidden' : ''}" id="btn-remove-logo">
                    Remove
                  </button>
                  <input type="hidden" name="restaurant_logo" id="input-restaurant-logo" value="${s.restaurant_logo || ''}">
                </div>
                <p style="font-size:12px;color:var(--text-muted);margin:0;">
                  PNG, JPG, or SVG (transparent background recommended). This logo will appear on receipts and tax invoices.
                </p>
              </div>
            </div>
          </div>

          <div class="form-group">
            <label>Restaurant Name *</label>
            <input type="text" name="restaurant_name" value="${s.restaurant_name || ''}" placeholder="e.g. Royal Spice Restaurant" required>
          </div>

          <div class="form-group">
            <label>Full Address *</label>
            <textarea name="restaurant_address" rows="2" placeholder="Street, Landmark, City, State - PIN" required>${s.restaurant_address || ''}</textarea>
          </div>

          <div class="modal-body" style="padding:0;overflow:visible;">
            <div class="form-row">
              <div class="form-group">
                <label>Phone Number *</label>
                <input type="text" name="restaurant_phone" value="${s.restaurant_phone || ''}" placeholder="+91 98765 43210" required>
              </div>
              <div class="form-group">
                <label>Email Address</label>
                <input type="email" name="restaurant_email" value="${s.restaurant_email || ''}" placeholder="info@myrestaurant.com">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>GSTIN (Goods & Services Tax ID)</label>
                <input type="text" name="gstin" value="${s.gstin || ''}" placeholder="e.g. 07AAAAA0000A1Z5" maxlength="15">
              </div>
              <div class="form-group">
                <label>FSSAI License Number</label>
                <input type="text" name="fssai_no" value="${s.fssai_no || ''}" placeholder="e.g. 10019011000123" maxlength="14">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>State Name</label>
                <input type="text" name="state_name" value="${s.state_name || 'Delhi'}">
              </div>
              <div class="form-group">
                <label>State Code</label>
                <input type="text" name="state_code" value="${s.state_code || '07'}">
              </div>
            </div>
          </div>

          <div style="margin-top:24px;display:flex;justify-content:flex-end;">
            <button type="submit" class="btn btn-primary">Save Restaurant Details</button>
          </div>
        </form>
      </div>
    `;

    // Logo upload listeners
    const fileInput = document.getElementById('restaurant-logo-file');
    const btnUpload = document.getElementById('btn-upload-logo');
    const btnRemove = document.getElementById('btn-remove-logo');
    const hiddenLogo = document.getElementById('input-restaurant-logo');
    const previewBox = document.getElementById('logo-preview-box');

    if (btnUpload && fileInput) {
      btnUpload.onclick = () => fileInput.click();
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
          window.App.showToast('Logo file size should be less than 2MB', 'warning');
          return;
        }

        const reader = new FileReader();
        reader.onload = (re) => {
          const dataUrl = re.target.result;
          if (hiddenLogo) hiddenLogo.value = dataUrl;
          if (previewBox) {
            previewBox.innerHTML = `<img src="${dataUrl}" alt="Logo" style="max-width:100%;max-height:100%;object-fit:contain;">`;
          }
          if (btnRemove) btnRemove.classList.remove('hidden');
          if (btnUpload) {
            btnUpload.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg> Change Logo`;
          }
        };
        reader.readAsDataURL(file);
      };
    }

    if (btnRemove) {
      btnRemove.onclick = () => {
        if (hiddenLogo) hiddenLogo.value = '';
        if (previewBox) {
          previewBox.innerHTML = `<span style="font-size:11px;color:var(--text-muted);text-align:center;padding:4px;">No Logo</span>`;
        }
        btnRemove.classList.add('hidden');
        if (btnUpload) {
          btnUpload.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg> Upload Logo`;
        }
        if (fileInput) fileInput.value = '';
      };
    }

    document.getElementById('settings-restaurant-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      this.saveBulk(data);
    });

    // Login requirement switch listener
    const toggleLogin = document.getElementById('toggle-require-login');
    if (toggleLogin) {
      toggleLogin.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        const val = isChecked ? '1' : '0';
        try {
          await window.api.settings.update('require_login', val);
          this.settings.require_login = val;
          window.App.settings.require_login = val;

          const badge = document.getElementById('badge-require-login');
          const desc = document.getElementById('desc-require-login');
          if (badge) {
            badge.textContent = isChecked ? '● Login Required' : '🔓 Always Unlocked (Direct Access)';
            badge.style.background = isChecked ? 'rgba(34,197,94,0.15)' : 'rgba(249,115,22,0.15)';
            badge.style.color = isChecked ? 'var(--color-success)' : 'var(--accent-primary)';
          }
          if (desc) {
            desc.textContent = isChecked
              ? 'Authentication is active. Users must enter username and password to log in.'
              : 'Login is turned OFF. The app is always unlocked and anyone opening RestoBill can directly use POS and billing without signing in.';
          }

          if (isChecked) {
            window.App.showToast('🔒 Login enabled. Credentials will be required when opening the app.', 'success', 4000);
          } else {
            window.App.showToast('🔓 Login disabled! App is now permanently unlocked for direct use.', 'info', 4000);
          }
        } catch (err) {
          window.App.showToast('Failed to update login setting: ' + err.message, 'error');
        }
      });
    }
  },

  renderBillingTab(container) {
    const s = this.settings;
    container.innerHTML = `
      <div class="settings-section">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:6px;">Billing & GST Rules</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">
          Configure tax calculation rules, invoice numbering sequences, and restaurant layout.
        </p>

        <form id="settings-billing-form">
          <div class="modal-body" style="padding:0;overflow:visible;">
            <div class="form-row">
              <div class="form-group">
                <label>Currency Symbol</label>
                <input type="text" name="currency_symbol" value="${s.currency_symbol || '₹'}">
              </div>
              <div class="form-group">
                <label>Invoice Prefix</label>
                <input type="text" name="invoice_prefix" value="${s.invoice_prefix || 'INV'}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Financial Year</label>
                <input type="text" name="financial_year" value="${s.financial_year || '2026-27'}">
              </div>
              <div class="form-group">
                <label>Default GST Rate (%)</label>
                <select name="default_gst_rate">
                  <option value="5" ${s.default_gst_rate === '5' ? 'selected' : ''}>5%</option>
                  <option value="12" ${s.default_gst_rate === '12' ? 'selected' : ''}>12%</option>
                  <option value="18" ${s.default_gst_rate === '18' ? 'selected' : ''}>18%</option>
                  <option value="0" ${s.default_gst_rate === '0' ? 'selected' : ''}>0% (Nil)</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Menu Pricing Mode</label>
                <select name="gst_inclusive">
                  <option value="1" ${s.gst_inclusive === '1' ? 'selected' : ''}>Inclusive of GST (Item price has GST included)</option>
                  <option value="0" ${s.gst_inclusive === '0' ? 'selected' : ''}>Exclusive of GST (GST added on top of item price)</option>
                </select>
              </div>
              <div class="form-group">
                <label>Tax on Discount</label>
                <select name="tax_on_discount">
                  <option value="after" ${s.tax_on_discount === 'after' ? 'selected' : ''}>Calculate GST after discount (Recommended)</option>
                  <option value="before" ${s.tax_on_discount === 'before' ? 'selected' : ''}>Calculate GST before discount</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Total Dine-In Tables</label>
                <input type="number" name="table_count" value="${s.table_count || '20'}" min="1" max="200">
              </div>
              <div class="form-group">
                <label>Theme Mode</label>
                <select name="theme" id="settings-theme-select">
                  <option value="dark" ${window.App?.currentTheme === 'dark' || (!s.theme && window.App?.currentTheme !== 'light') ? 'selected' : ''}>🌙 Dark Mode (Default)</option>
                  <option value="light" ${window.App?.currentTheme === 'light' || s.theme === 'light' ? 'selected' : ''}>☀️ Light Mode</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Kitchen Order Ticket (KOT)</label>
                <select name="enable_kot">
                  <option value="1" ${s.enable_kot === '1' ? 'selected' : ''}>Enabled</option>
                  <option value="0" ${s.enable_kot === '0' ? 'selected' : ''}>Disabled</option>
                </select>
              </div>
            </div>
          </div>

          <div style="margin-top:24px;display:flex;justify-content:flex-end;">
            <button type="submit" class="btn btn-primary">Save Billing Preferences</button>
          </div>
        </form>
      </div>
    `;

    const themeSelect = document.getElementById('settings-theme-select');
    themeSelect?.addEventListener('change', (e) => {
      window.App.setTheme(e.target.value, false);
    });

    document.getElementById('settings-billing-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      this.saveBulk(data);
    });
  },

  async renderPrinterTab(container) {
    await this.fetchSettings();
    const s = this.settings;
    const isChecked = (val, defaultVal = true) => {
      if (val === undefined || val === null || val === '') return defaultVal;
      return val === '1' || val === true || val === 1 || val === 'true';
    };

    // Load installed printers
    let installedPrinters = [];
    try {
      if (window.api?.print?.getPrinters) {
        const res = await window.api.print.getPrinters();
        if (res && res.success && Array.isArray(res.data)) {
          installedPrinters = res.data;
        }
      }
    } catch (err) {
      console.warn('Could not load printers:', err);
    }

    container.innerHTML = `
      <div class="settings-section">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px;">
          <div>
            <h3 style="font-size:18px;font-weight:700;margin-bottom:6px;border-bottom:none;padding-bottom:0;">Printer & Print Content Controls</h3>
            <p style="color:var(--text-muted);font-size:13px;margin:0;">
              Choose your printer device, customize exactly what prints on your bills & receipts, and preview live.
            </p>
          </div>
          <div style="display:flex;gap:10px;">
            <button type="button" class="btn btn-outline" id="btn-top-test-print">🖨️ Test Print</button>
            <button type="button" class="btn btn-primary" id="btn-top-save-printer">Save Settings</button>
          </div>
        </div>

        <form id="settings-printer-form">
          <div class="printer-settings-container">
            <!-- Left Column: Controls & Toggles -->
            <div class="printer-settings-main">

              <!-- Mobile Direct Bluetooth Thermal Printer Setup Card -->
              <div class="printer-card" style="background: rgba(16, 185, 129, 0.06); border-color: rgba(16, 185, 129, 0.3);">
                <div class="printer-card-header">
                  <div class="printer-card-title">
                    <span>⚡</span>
                    <span>Direct Bluetooth Thermal Printing (No Third-Party Apps Needed!)</span>
                  </div>
                  <span class="printer-card-badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">Direct ESC/POS</span>
                </div>
                <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; padding: 4px 0;">
                  <p style="margin-bottom: 8px; font-weight: 600; color: var(--text-primary);">
                    RestoBill connects <b>directly</b> to your Bluetooth thermal printer (like Ezo Printer, ESC/POS 58mm/80mm) with <b>instant silent printing</b> and <b>zero confirmation dialogs</b>!
                  </p>
                  <ol style="padding-left: 20px; margin: 0 0 10px 0;">
                    <li style="margin-bottom: 5px;">
                      <b>Pair with Phone:</b> Turn on your Bluetooth printer, open your phone's <b>Settings &rarr; Bluetooth</b>, and pair with your printer (e.g. Ezo Printer, PIN <code>0000</code> or <code>1234</code>).
                    </li>
                    <li style="margin-bottom: 5px;">
                      <b>Select Device Below:</b> Tap <b>"🔄 Refresh List"</b> below and choose your paired printer from the <b>Target Printer Device</b> dropdown.
                    </li>
                    <li>
                      <b>Instant Silent Print:</b> Keep <i>Print Execution Mode</i> on <b>Direct Silent Print (Instant)</b>. When you tap <b>"Save & Print"</b> or <b>"Test Print"</b>, your bill prints immediately with no popups or external apps!
                    </li>
                  </ol>
                </div>
              </div>

              <!-- 1. Printer Hardware & Connection -->
              <div class="printer-card">
                <div class="printer-card-header">
                  <div class="printer-card-title">
                    <span>🖨️</span>
                    <span>Printer Hardware & Connection</span>
                  </div>
                  <span class="printer-card-badge">Hardware</span>
                </div>

                <div class="form-row" style="margin-bottom:14px;">
                  <div class="form-group" style="flex:2;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                      <label style="margin:0;">Target Printer Device</label>
                      <button type="button" id="btn-refresh-printers" style="background:none;border:none;color:var(--accent-primary);font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px;">
                        🔄 Refresh List
                      </button>
                    </div>
                    <select name="printer_device" id="printer-device-select">
                      <option value="" ${!s.printer_device ? 'selected' : ''}>System Default Printer</option>
                      ${installedPrinters.map(p => `
                        <option value="${p.name}" ${s.printer_device === p.name ? 'selected' : ''}>
                          ${p.displayName || p.name} ${p.isDefault ? '(Default)' : ''}
                        </option>
                      `).join('')}
                    </select>
                  </div>
                  <div class="form-group" style="flex:1;">
                    <label>Printer Type</label>
                    <select name="printer_type" id="printer-type-select">
                      <option value="thermal" ${s.printer_type !== 'standard' ? 'selected' : ''}>ESC/POS Thermal Receipt</option>
                      <option value="standard" ${s.printer_type === 'standard' ? 'selected' : ''}>Standard A4/A5 Laser/Inkjet</option>
                    </select>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>Thermal Paper Width</label>
                    <select name="printer_width" id="printer-width-select">
                      <option value="80" ${s.printer_width !== '58' ? 'selected' : ''}>80mm (Standard 3-Inch POS)</option>
                      <option value="58" ${s.printer_width === '58' ? 'selected' : ''}>58mm (Compact 2-Inch Thermal)</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Print Execution Mode</label>
                    <select name="silent_print">
                      <option value="1" ${s.silent_print !== '0' ? 'selected' : ''}>Direct Silent Print (Instant - No Dialog)</option>
                      <option value="0" ${s.silent_print === '0' ? 'selected' : ''}>Show System Print Dialog</option>
                    </select>
                  </div>
                </div>

                <div class="form-row" style="margin-top:14px;">
                  <div class="form-group">
                    <label>Number of Copies</label>
                    <select name="print_copies">
                      <option value="1" ${s.print_copies !== '2' ? 'selected' : ''}>1 Copy (Customer Bill)</option>
                      <option value="2" ${s.print_copies === '2' ? 'selected' : ''}>2 Copies (Customer + Kitchen)</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>POS Auto-Print on Settle</label>
                    <select name="auto_print_on_save">
                      <option value="0" ${s.auto_print_on_save !== '1' ? 'selected' : ''}>Manual (F4 / Save & Print)</option>
                      <option value="1" ${s.auto_print_on_save === '1' ? 'selected' : ''}>Auto-Print on Settle</option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- 2. Header & Business Details -->
              <div class="printer-card">
                <div class="printer-card-header">
                  <div class="printer-card-title">
                    <span>🏢</span>
                    <span>Receipt Header & Business Info</span>
                  </div>
                  <span class="printer-card-badge">Header</span>
                </div>

                <div class="form-group" style="margin-bottom:14px;">
                  <label>Receipt Header Title</label>
                  <input type="text" name="receipt_header_title" id="input-receipt-header-title" value="${s.receipt_header_title !== undefined ? s.receipt_header_title : 'TAX INVOICE'}" placeholder="e.g. TAX INVOICE, RESTAURANT BILL, CASH RECEIPT">
                </div>

                <div class="printer-toggles-grid">
                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Restaurant Logo</span>
                      <span class="printer-toggle-desc">Print uploaded logo at top</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_logo" ${isChecked(s.print_show_logo, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Restaurant Name</span>
                      <span class="printer-toggle-desc">Print business name heading</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_restaurant_name" ${isChecked(s.print_show_restaurant_name, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Restaurant Address</span>
                      <span class="printer-toggle-desc">Print outlet address text</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_address" ${isChecked(s.print_show_address, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Phone Number</span>
                      <span class="printer-toggle-desc">Print restaurant contact number</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_phone" ${isChecked(s.print_show_phone, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">GSTIN Number</span>
                      <span class="printer-toggle-desc">Print GST registration number</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_gstin" ${isChecked(s.print_show_gstin, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">FSSAI License No.</span>
                      <span class="printer-toggle-desc">Print food safety license</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_fssai" ${isChecked(s.print_show_fssai, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- 3. Order & Customer Info -->
              <div class="printer-card">
                <div class="printer-card-header">
                  <div class="printer-card-title">
                    <span>🧾</span>
                    <span>Order & Customer Information</span>
                  </div>
                  <span class="printer-card-badge">Order Meta</span>
                </div>

                <div class="printer-toggles-grid">
                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Bill / Order Number</span>
                      <span class="printer-toggle-desc">Print invoice identifier (e.g. INV-001)</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_order_no" ${isChecked(s.print_show_order_no, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Date & Time</span>
                      <span class="printer-toggle-desc">Print transaction timestamp</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_date" ${isChecked(s.print_show_date, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Table Number</span>
                      <span class="printer-toggle-desc">Print dining table identifier</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_table" ${isChecked(s.print_show_table, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Order Type</span>
                      <span class="printer-toggle-desc">Print Dine-In, Takeaway, Delivery</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_order_type" ${isChecked(s.print_show_order_type, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Cashier / Staff Name</span>
                      <span class="printer-toggle-desc">Print logged-in operator name</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_cashier" ${isChecked(s.print_show_cashier, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Customer Name & Phone</span>
                      <span class="printer-toggle-desc">Print guest customer details</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_customer" ${isChecked(s.print_show_customer, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Customer GSTIN</span>
                      <span class="printer-toggle-desc">Print B2B customer GSTIN</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_customer_gstin" ${isChecked(s.print_show_customer_gstin, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- 4. Items & Pricing Controls -->
              <div class="printer-card">
                <div class="printer-card-header">
                  <div class="printer-card-title">
                    <span>📋</span>
                    <span>Item Columns & Pricing Summary</span>
                  </div>
                  <span class="printer-card-badge">Line Items</span>
                </div>

                <div class="printer-toggles-grid">
                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Unit Rate / Price Column</span>
                      <span class="printer-toggle-desc">Show item unit price column</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_rate" ${isChecked(s.print_show_rate, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">HSN / SAC Codes</span>
                      <span class="printer-toggle-desc">Print HSN code under each item</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="show_hsn" ${isChecked(s.show_hsn, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Item Tax Rate (GST %)</span>
                      <span class="printer-toggle-desc">Print GST rate tag next to items</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_item_tax" ${isChecked(s.print_show_item_tax, false) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Subtotal Row</span>
                      <span class="printer-toggle-desc">Print subtotal before taxes</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_subtotal" ${isChecked(s.print_show_subtotal, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">GST Summary Breakdown</span>
                      <span class="printer-toggle-desc">Print CGST / SGST rates table</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_tax_breakdown" ${isChecked(s.print_show_tax_breakdown, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Payment Mode</span>
                      <span class="printer-toggle-desc">Print Cash / UPI / Card mode</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_payment_mode" ${isChecked(s.print_show_payment_mode, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Amount in Words</span>
                      <span class="printer-toggle-desc">Print Rupees in words text</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_amount_words" ${isChecked(s.print_show_amount_words, false) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Order Notes / Kitchen Notes</span>
                      <span class="printer-toggle-desc">Print special instructions</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_notes" ${isChecked(s.print_show_notes, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- 5. Footer, Terms & Branding -->
              <div class="printer-card">
                <div class="printer-card-header">
                  <div class="printer-card-title">
                    <span>💬</span>
                    <span>Footer Message, Terms & Branding</span>
                  </div>
                  <span class="printer-card-badge">Footer</span>
                </div>

                <div class="printer-toggles-grid" style="margin-bottom:14px;">
                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Show Footer Message</span>
                      <span class="printer-toggle-desc">Print thank you message</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_footer" ${isChecked(s.print_show_footer, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Show Terms & Conditions</span>
                      <span class="printer-toggle-desc">Print disclaimer & policy text</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_terms" ${isChecked(s.print_show_terms, false) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>

                  <label class="printer-toggle-item">
                    <div class="printer-toggle-info">
                      <span class="printer-toggle-title">Show Branding Footer</span>
                      <span class="printer-toggle-desc">"Made with ❤️ by astrorock"</span>
                    </div>
                    <div class="switch">
                      <input type="checkbox" name="print_show_branding" ${isChecked(s.print_show_branding, true) ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>
                </div>

                <div class="form-group" style="margin-bottom:12px;">
                  <label>Receipt Footer Note</label>
                  <input type="text" name="footer_text" id="input-footer-text" value="${s.footer_text || 'Thank you! Visit again!'}" placeholder="e.g. Thank you for dining with us!">
                </div>

                <div class="form-group">
                  <label>Terms & Conditions / Disclaimer Note</label>
                  <textarea name="terms_text" id="input-terms-text" rows="2" placeholder="e.g. Goods once sold cannot be returned. Please retain bill for queries.">${s.terms_text || 'Goods once sold cannot be returned.'}</textarea>
                </div>
              </div>

            </div>

            <!-- Right Column: Live Sticky Thermal Receipt Preview -->
            <div class="printer-preview-sidebar">
              <div class="printer-preview-container-box">
                <div class="printer-preview-topbar">
                  <div class="printer-preview-topbar-title">
                    <span>👁️</span>
                    <span>Live Receipt Preview</span>
                    <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px #22c55e;" title="Rendering live"></span>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <button type="button" id="btn-toggle-preview-source" style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-secondary);cursor:pointer;display:none;align-items:center;gap:4px;" title="Switch preview order source">
                      <span id="preview-source-label">⚡ Latest Bill</span>
                    </button>
                    <span id="preview-width-badge" style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:var(--accent-primary-glow);color:var(--accent-primary);">
                      ${s.printer_type === 'standard' ? 'A4 Invoice' : (s.printer_width === '58' ? '58mm' : '80mm')}
                    </span>
                  </div>
                </div>

                <div class="printer-preview-paper-card ${s.printer_type === 'standard' ? 'width-standard' : (s.printer_width === '58' ? 'width-58' : 'width-80')}" id="preview-paper-box">
                  <iframe id="printer-live-preview-frame" class="printer-preview-iframe" sandbox="allow-same-origin allow-scripts"></iframe>
                </div>

                <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">
                  <button type="button" class="btn btn-outline" id="btn-sidebar-test-print" style="width:100%;justify-content:center;">
                    🖨️ Test Print Receipt
                  </button>
                  <button type="submit" class="btn btn-primary" id="btn-sidebar-save" style="width:100%;justify-content:center;">
                    💾 Save Printer Settings
                  </button>
                </div>
              </div>
            </div>

          </div>
        </form>
      </div>
    `;

    // Realistic sample order for preview and test printing
    const defaultGst = parseFloat(s.default_gst_rate || '5');
    const isInc = s.gst_inclusive === '1';
    const sub = 590;
    const disc = 59;
    const taxBase = isInc ? ((sub - disc) * 100 / (100 + defaultGst)) : (sub - disc);
    const halfTax = Math.round((taxBase * (defaultGst / 2) / 100) * 100) / 100;
    const grand = isInc ? (sub - disc) : Math.round(taxBase + halfTax * 2);

    const sampleOrder = {
      order_no: 'INV-2026-0042',
      order_type: 'dine_in',
      table_no: 'T-04',
      user_name: window.App?.currentUser?.name || 'Rahul (Cashier)',
      customer_name: 'Vikram Sharma',
      customer_phone: '9876543210',
      customer_gstin: '07AAAAA0000A1Z5',
      created_at: new Date().toISOString(),
      items: [
        { name: 'Paneer Butter Masala', quantity: 1, price: 280, total: 280, gst_rate: defaultGst, hsn_code: '996331' },
        { name: 'Butter Garlic Naan', quantity: 3, price: 50, total: 150, gst_rate: defaultGst, hsn_code: '996331' },
        { name: 'Jeera Rice', quantity: 1, price: 160, total: 160, gst_rate: defaultGst, hsn_code: '996331' }
      ],
      subtotal: sub,
      discount_type: 'percent',
      discount_value: 10,
      discount_amount: disc,
      taxable_amount: Math.round(taxBase * 100) / 100,
      cgst: halfTax,
      sgst: halfTax,
      round_off: -0.28,
      total: grand,
      payment_mode: 'upi',
      payment_details: 'GPay Ref #4029184',
      notes: 'Extra spicy, serve hot'
    };

    // Try fetching the store's latest actual bill so preview reflects live business orders
    let latestOrder = null;
    let previewSource = 'latest';
    try {
      if (window.api?.orders?.getAll) {
        const orderRes = await window.api.orders.getAll({ limit: 1 });
        const ordersList = orderRes?.data?.orders || orderRes?.orders || [];
        if (ordersList.length > 0 && ordersList[0].id) {
          const fullRes = await window.api.orders.getById(ordersList[0].id);
          const fullOrder = fullRes?.data || fullRes;
          if (fullOrder && fullOrder.items && fullOrder.items.length > 0) {
            latestOrder = fullOrder;
          }
        }
      }
    } catch (e) {
      console.warn('Could not load latest order for preview:', e);
    }

    if (!latestOrder) {
      previewSource = 'sample';
    }

    // Toggle button to alternate between Latest Bill and Sample Bill
    const sourceToggleBtn = document.getElementById('btn-toggle-preview-source');
    const sourceLabel = document.getElementById('preview-source-label');
    if (sourceToggleBtn && latestOrder) {
      sourceToggleBtn.style.display = 'inline-flex';
      sourceLabel.textContent = (previewSource === 'latest') ? `⚡ Bill #${latestOrder.order_no || 'Latest'}` : '📋 Sample Bill';
      sourceToggleBtn.onclick = () => {
        previewSource = (previewSource === 'latest') ? 'sample' : 'latest';
        sourceLabel.textContent = (previewSource === 'latest') ? `⚡ Bill #${latestOrder.order_no || 'Latest'}` : '📋 Sample Bill';
        updatePreview(true);
      };
    }

    // Helper: Collect current form values live
    const getFormSettings = () => {
      const form = document.getElementById('settings-printer-form');
      if (!form) return this.settings;
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      // Collect all checkboxes explicitly (unchecked checkboxes are not in FormData)
      form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        data[cb.name] = cb.checked ? '1' : '0';
      });

      return { ...this.settings, ...data };
    };

    // Live preview updater with sequence counter & debounce
    let previewSeq = 0;
    let debounceTimer = null;

    const doUpdatePreview = async () => {
      const seq = ++previewSeq;
      const previewFrame = document.getElementById('printer-live-preview-frame');
      const paperBox = document.getElementById('preview-paper-box');
      const widthBadge = document.getElementById('preview-width-badge');
      if (!previewFrame) return;

      const currentS = getFormSettings();

      if (paperBox) {
        if (currentS.printer_type === 'standard') {
          paperBox.className = 'printer-preview-paper-card width-standard';
        } else if (currentS.printer_width === '58') {
          paperBox.className = 'printer-preview-paper-card width-58';
        } else {
          paperBox.className = 'printer-preview-paper-card width-80';
        }
      }
      if (widthBadge) {
        widthBadge.textContent = currentS.printer_type === 'standard' ? 'A4 Invoice' : (currentS.printer_width === '58' ? '58mm' : '80mm');
      }

      try {
        const orderToUse = (previewSource === 'latest' && latestOrder) ? latestOrder : sampleOrder;
        const previewType = currentS.printer_type === 'standard' ? 'invoice' : 'receipt';
        const res = await window.api.print.getPreview(orderToUse, currentS, previewType);
        if (seq !== previewSeq) return; // Discard stale out-of-order response

        const html = (res && typeof res === 'object' && res.data) ? res.data : (typeof res === 'string' ? res : '');
        previewFrame.srcdoc = html;

        previewFrame.onload = () => {
          try {
            const body = previewFrame.contentWindow.document.body;
            const htmlEl = previewFrame.contentWindow.document.documentElement;
            const scrollH = Math.max(body?.scrollHeight || 0, htmlEl?.scrollHeight || 0, 420);
            previewFrame.style.height = `${scrollH + 20}px`;
          } catch (e) {}
        };
      } catch (err) {
        console.error('Failed to render live preview:', err);
      }
    };

    const updatePreview = (immediate = false) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (immediate) {
        doUpdatePreview();
      } else {
        debounceTimer = setTimeout(doUpdatePreview, 35);
      }
    };

    // Initial preview render
    await doUpdatePreview();

    // Re-render preview on ANY form input, typing, or change event
    const form = document.getElementById('settings-printer-form');
    if (form) {
      form.addEventListener('input', () => updatePreview(false));
      form.addEventListener('change', () => updatePreview(true));

      // Attach directly to inputs, checkboxes, and selects for instantaneous responsiveness
      form.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', () => updatePreview(false));
        el.addEventListener('change', () => updatePreview(true));
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = getFormSettings();
        await this.saveBulk(data);
        await doUpdatePreview();
      });
    }

    // Top action buttons
    document.getElementById('btn-top-save-printer')?.addEventListener('click', () => {
      form?.requestSubmit();
    });

    const triggerTestPrint = async () => {
      const currentS = getFormSettings();
      const orderToPrint = (previewSource === 'latest' && latestOrder) ? latestOrder : sampleOrder;
      try {
        window.App.showToast('Sending test receipt to printer...', 'info');
        // If Android Direct Bluetooth is available and silent print is enabled
        if (window.AndroidPrinter && typeof window.AndroidPrinter.testPrintBluetooth === 'function' && currentS.silent_print !== '0') {
          const resJson = window.AndroidPrinter.testPrintBluetooth(currentS.printer_device || '', JSON.stringify(currentS));
          const res = JSON.parse(resJson || '{}');
          if (res.success) {
            window.App.showToast(res.message || 'Direct Bluetooth test print sent successfully!', 'success');
            return;
          } else {
            console.warn('[DirectTestPrint] Direct attempt error:', res.error);
          }
        }

        if (currentS.printer_type === 'standard') {
          await window.api.print.invoice(orderToPrint, currentS);
        } else {
          await window.api.print.receipt(orderToPrint, currentS);
        }
        window.App.showToast('Test print sent to printer successfully!', 'success');
      } catch (err) {
        window.App.showToast('Test print failed: ' + err.message, 'error');
      }
    };

    document.getElementById('btn-top-test-print')?.addEventListener('click', triggerTestPrint);
    document.getElementById('btn-sidebar-test-print')?.addEventListener('click', triggerTestPrint);

    // Refresh Printers button
    document.getElementById('btn-refresh-printers')?.addEventListener('click', async () => {
      const select = document.getElementById('printer-device-select');
      if (!select) return;
      try {
        window.App.showToast('Scanning printers...', 'info');
        const res = await window.api.print.getPrinters();
        if (res && res.success && Array.isArray(res.data)) {
          const currentVal = select.value;
          select.innerHTML = `
            <option value="">System Default Printer</option>
            ${res.data.map(p => `
              <option value="${p.name}" ${currentVal === p.name ? 'selected' : ''}>
                ${p.displayName || p.name} ${p.isDefault ? '(Default)' : ''}
              </option>
            `).join('')}
          `;
          window.App.showToast(`Found ${res.data.length} printer(s)`, 'success');
        }
      } catch (e) {
        window.App.showToast('Could not refresh printers: ' + e.message, 'error');
      }
    });
  },

  async renderBackupTab(container) {
    const s = this.settings;
    const lastAutoRestore = localStorage.getItem('gdrive_last_auto_restore') || s.last_auto_restore;
    const lastAutoRestoreText = lastAutoRestore ? window.App.formatDateTime(lastAutoRestore) : 'None yet';
    const lastRestoredBackupName = localStorage.getItem('gdrive_last_restored_backup_name') || '';

    container.innerHTML = `
      <div class="settings-section">
        <!-- 💾 Local SQLite Database (.db File) Backup & Restore Card -->
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:16px;margin-bottom:20px;width:100%;box-sizing:border-box;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;width:100%;box-sizing:border-box;">
            <div style="flex:1 1 220px;min-width:0;">
              <h4 style="font-size:15px;font-weight:700;margin:0 0 4px 0;display:flex;align-items:center;gap:8px;color:var(--text-primary);">
                <span>💾</span> Local SQLite Database (.db File)
              </h4>
              <p style="font-size:12px;color:var(--text-muted);margin:0;line-height:1.4;">
                Download your complete database file (.db) to your device, or upload an existing .db file to instantly restore all data.
              </p>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%;max-width:100%;">
              <button type="button" class="btn btn-outline btn-sm" id="btn-download-db" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:600;flex:1 1 auto;min-width:0;padding:8px 10px;font-size:12px;">
                <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 011.414 0zM11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
                <span>📥 Download DB</span>
              </button>
              <input type="file" id="input-upload-db" accept=".db,application/x-sqlite3,application/octet-stream" style="display:none;">
              <button type="button" class="btn btn-primary btn-sm" id="btn-upload-db" style="display:inline-flex;align-items:center;justify-content:center;gap:6px;font-weight:600;flex:1 1 auto;min-width:0;padding:8px 10px;font-size:12px;">
                <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 011.414 0zM11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
                <span>📤 Upload &amp; Restore</span>
              </button>
            </div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 style="font-size:17px;font-weight:700;margin:0 0 4px 0;">Google Drive Cloud Backup</h3>
            <p style="color:var(--text-muted);font-size:12px;margin:0;">
              Automatically or manually backup your restaurant database (menu, orders, customers) to Google Drive.
            </p>
          </div>
          <button type="button" id="btn-lock-backup" class="btn btn-outline btn-sm" style="font-size:12px;padding:6px 12px;display:flex;align-items:center;gap:6px;">
            🔒 Lock Page
          </button>
        </div>

        <div id="backup-status-container" style="padding:14px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);margin-bottom:18px;width:100%;box-sizing:border-box;">
          <div class="loading-overlay"><div class="spinner"></div> Checking Google Drive connection...</div>
        </div>

        <!-- Automatic Backup Schedule Card -->
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:16px;margin-bottom:20px;width:100%;box-sizing:border-box;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
            <div>
              <h4 style="font-size:15px;font-weight:700;margin:0 0 2px 0;display:flex;align-items:center;gap:8px;">
                <span>⏰</span> Automatic Backup Schedule
              </h4>
              <p style="font-size:12px;color:var(--text-muted);margin:0;">
                Keep your restaurant data safe without manual effort. Runs in the background and uploads snapshots to Google Drive.
              </p>
            </div>
            <span style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:12px;font-size:11px;font-weight:600;background:${s.backup_enabled === '1' ? 'rgba(34,197,94,0.15)' : 'var(--bg-tertiary)'};color:${s.backup_enabled === '1' ? 'var(--color-success)' : 'var(--text-muted)'};border:1px solid ${s.backup_enabled === '1' ? 'rgba(34,197,94,0.3)' : 'var(--border-color)'};">
              ${s.backup_enabled === '1' ? '● Auto-Backup Active' : '○ Auto-Backup Disabled'}
            </span>
          </div>

          <form id="settings-auto-backup-form">
            <div class="form-row">
              <div class="form-group">
                <label>Auto-Backup Status</label>
                <select name="backup_enabled" id="select-backup-enabled">
                  <option value="1" ${s.backup_enabled === '1' ? 'selected' : ''}>✅ Enabled (Automated Cloud Sync)</option>
                  <option value="0" ${s.backup_enabled !== '1' ? 'selected' : ''}>⛔ Disabled (Manual Only)</option>
                </select>
              </div>

              <div class="form-group">
                <label>Backup Frequency</label>
                <select name="backup_frequency" id="select-backup-frequency">
                  <option value="daily" ${s.backup_frequency === 'daily' || !s.backup_frequency ? 'selected' : ''}>Daily (Recommended at End of Day)</option>
                  <option value="every_4_hours" ${s.backup_frequency === 'every_4_hours' ? 'selected' : ''}>Every 4 Hours (Best for busy places)</option>
                  <option value="every_12_hours" ${s.backup_frequency === 'every_12_hours' ? 'selected' : ''}>Every 12 Hours (Twice daily)</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" id="group-backup-time">
                <label>Daily Auto-Backup Time</label>
                <input type="time" name="backup_time" value="${s.backup_time || '23:00'}">
                <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:3px;">
                  Suggested: 11:00 PM (23:00) or when closing register.
                </span>
              </div>

              <div class="form-group">
                <label>Backup on Application Exit</label>
                <select name="backup_on_exit">
                  <option value="1" ${s.backup_on_exit !== '0' ? 'selected' : ''}>Yes, backup on exit (Recommended)</option>
                  <option value="0" ${s.backup_on_exit === '0' ? 'selected' : ''}>No, skip backup on close</option>
                </select>
                <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:3px;">
                  Automatically saves a fresh snapshot when closing app at night.
                </span>
              </div>
            </div>

            <div style="display:flex;justify-content:flex-end;margin-top:14px;">
              <button type="submit" class="btn btn-primary btn-sm" style="min-width:180px;">💾 Save Backup Schedule</button>
            </div>
          </form>
        </div>

        <!-- Automatic Cloud Restore (Multi-Device Sync) Card -->
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:16px;margin-bottom:20px;width:100%;box-sizing:border-box;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
            <div>
              <h4 style="font-size:15px;font-weight:700;margin:0 0 2px 0;display:flex;align-items:center;gap:8px;">
                <span>🔄</span> Multi-Device Sync (Automatic Cloud Restore)
              </h4>
              <p style="font-size:12px;color:var(--text-muted);margin:0;">
                Connect two or more devices to the same Google Drive account. When ON, this device automatically restores the latest database backup every 4 or 12 hours. When OFF, restore is manual only.
              </p>
            </div>
            <span style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:12px;font-size:11px;font-weight:600;background:${s.auto_restore_enabled === '1' ? 'rgba(59,130,246,0.15)' : 'var(--bg-tertiary)'};color:${s.auto_restore_enabled === '1' ? 'var(--color-primary)' : 'var(--text-muted)'};border:1px solid ${s.auto_restore_enabled === '1' ? 'rgba(59,130,246,0.3)' : 'var(--border-color)'};">
              ${s.auto_restore_enabled === '1' ? `● Auto-Restore Active (${s.auto_restore_frequency === 'every_12_hours' ? 'Every 12h' : 'Every 4h'})` : '○ Manual Restore Only'}
            </span>
          </div>

          <form id="settings-auto-restore-form">
            <div class="form-row">
              <div class="form-group">
                <label>Auto-Restore Mode</label>
                <select name="auto_restore_enabled" id="select-auto-restore-enabled">
                  <option value="1" ${s.auto_restore_enabled === '1' ? 'selected' : ''}>✅ ON (Auto-Restore Every 4h / 12h)</option>
                  <option value="0" ${s.auto_restore_enabled !== '1' ? 'selected' : ''}>⛔ OFF (Manual Restore Only)</option>
                </select>
                <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:3px;">
                  Turn <b>ON</b> on secondary/new devices. Keep <b>OFF</b> on primary billing counter.
                </span>
              </div>

              <div class="form-group" id="group-auto-restore-freq" style="${s.auto_restore_enabled === '1' ? '' : 'opacity:0.6;'}">
                <label>Restore Frequency</label>
                <select name="auto_restore_frequency" id="select-auto-restore-frequency">
                  <option value="every_4_hours" ${s.auto_restore_frequency === 'every_4_hours' || !s.auto_restore_frequency ? 'selected' : ''}>Every 4 Hours (Regular Sync)</option>
                  <option value="every_12_hours" ${s.auto_restore_frequency === 'every_12_hours' ? 'selected' : ''}>Every 12 Hours (Twice Daily)</option>
                </select>
                <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:3px;">
                  Checks Drive in background and updates DB whenever a newer backup is available.
                </span>
              </div>
            </div>

            <!-- Sync Status and Instant Sync Row -->
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:12px;padding:12px 14px;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-sm);">
              <div style="font-size:12px;color:var(--text-secondary);min-width:200px;">
                <div>Last Auto-Restored: <b id="text-last-auto-restore" style="color:var(--text-primary);">${lastAutoRestoreText}</b></div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;" id="text-last-backup-name">${lastRestoredBackupName ? 'Snapshot: ' + lastRestoredBackupName : 'No cloud snapshot restored yet'}</div>
              </div>

              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-outline btn-sm" id="btn-sync-drive-now" style="display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:6px 12px;border-color:var(--color-primary);color:var(--color-primary);font-weight:600;">
                  <span>⚡ Restore Latest Backup Now</span>
                </button>
                <button type="submit" class="btn btn-primary btn-sm" style="min-width:160px;">
                  💾 Save Auto-Restore
                </button>
              </div>
            </div>

            <div style="margin-top:10px;font-size:11px;color:var(--text-secondary);line-height:1.4;background:rgba(99,102,241,0.06);padding:8px 12px;border-radius:6px;border:1px dashed rgba(99,102,241,0.2);">
              💡 <b>Recommended Multi-Device Setup:</b><br>
              &bull; <b>Primary Register / Main Billing Phone:</b> Keep Auto-Backup <b>ENABLED</b> and Auto-Restore <b>OFF</b>.<br>
              &bull; <b>Secondary Devices / Manager Tablet / Second Phone:</b> Keep Auto-Restore <b>ON</b> (Every 4h or 12h) to automatically receive all new orders, menu edits, and customer data from the primary device!
            </div>
          </form>
        </div>

        <!-- Snapshots / Manual Backups -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
          <div>
            <h4 style="font-size:15px;font-weight:700;margin:0 0 2px 0;">Latest Cloud Backup Snapshot</h4>
            <span style="font-size:12px;color:var(--text-muted);">
              Safely keeps only the single latest verified backup in Google Drive.
            </span>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary btn-sm" id="btn-trigger-backup">
              ☁️ Backup Now
            </button>
            <button class="btn btn-outline btn-sm" id="btn-refresh-backups">
              🔄 Refresh
            </button>
          </div>
        </div>

        <div id="backups-list-container">
          <p style="color:var(--text-muted);font-size:13px;">Loading backup history...</p>
        </div>
      </div>
    `;

    // Bind auto backup schedule form
    document.getElementById('settings-auto-backup-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      await this.saveBulk(data, 'Automatic backup schedule saved successfully!');
      if (window.api.gdrive.updateSchedule) {
        await window.api.gdrive.updateSchedule(data);
      }
      // Re-fetch all settings to ensure local state is completely synchronized
      const fresh = await window.api.settings.getAll();
      const sMap = fresh?.data || fresh;
      if (sMap) {
        this.settings = sMap;
        window.App.settings = sMap;
      }
      this.render();
    });

    // Bind auto restore toggle & form
    const selectAutoRestore = document.getElementById('select-auto-restore-enabled');
    const groupAutoRestoreFreq = document.getElementById('group-auto-restore-freq');
    selectAutoRestore?.addEventListener('change', (e) => {
      if (groupAutoRestoreFreq) {
        groupAutoRestoreFreq.style.opacity = e.target.value === '1' ? '1' : '0.6';
      }
    });

    document.getElementById('settings-auto-restore-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      await this.saveBulk(data, 'Auto-restore settings saved successfully!');
      if (window.api.gdrive.updateSchedule) {
        await window.api.gdrive.updateSchedule(data);
      }
      const fresh = await window.api.settings.getAll();
      const sMap = fresh?.data || fresh;
      if (sMap) {
        this.settings = sMap;
        window.App.settings = sMap;
      }
      this.render();
    });

    document.getElementById('btn-sync-drive-now')?.addEventListener('click', async () => {
      const confirmed = confirm('Restore the latest Google Drive backup to this device now?');
      if (!confirmed) return;

      const btn = document.getElementById('btn-sync-drive-now');
      if (btn) {
        btn.disabled = true;
        btn.innerText = '⏳ Syncing...';
      }

      try {
        window.App.showToast('Checking Google Drive and downloading latest backup...', 'info', 4000);
        const res = await window.api.gdrive.syncFromDriveNow();
        const data = res?.data || res;
        if (res?.success && data?.success) {
          if (data.updated) {
            const bName = data.backup?.name || 'latest backup';
            window.App.showToast(`✅ Database updated successfully from ${bName}! Reloading...`, 'success', 3000);
            setTimeout(() => {
              window.location.reload();
            }, 1200);
          } else {
            window.App.showToast('ℹ️ Database is already up to date with the latest Google Drive backup.', 'info', 4000);
            this.render();
          }
        } else {
          window.App.showToast(data?.reason || res?.error || 'Restore sync failed', 'error');
        }
      } catch (err) {
        window.App.showToast('Sync error: ' + err.message, 'error');
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>⚡ Restore Latest Backup Now</span>';
        }
      }
    });

    // Check status
    try {
      const statusRes = await window.api.gdrive.getStatus();
      const statusBox = document.getElementById('backup-status-container');
      if (statusBox) {
        const isConnected = statusRes?.data?.connected;
        const hasCreds = statusRes?.data?.hasCredentials;
        const hasToken = statusRes?.data?.hasToken;
        const email = statusRes?.data?.email || 'Google Drive Connected';
        const lastBackupText = statusRes?.data?.lastBackup
          ? window.App.formatDateTime(statusRes.data.lastBackup)
          : 'None';

        const folderLink = statusRes?.data?.folderUrl || (statusRes?.data?.folderId ? `https://drive.google.com/drive/folders/${statusRes.data.folderId}` : 'https://drive.google.com/drive/my-drive');

        statusBox.innerHTML = `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;">
            <div style="display:flex;align-items:flex-start;gap:14px;flex:1;min-width:240px;">
              <div style="width:42px;height:42px;border-radius:50%;background:${isConnected ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.12)'};display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;">
                ${isConnected ? '🟢' : '☁️'}
              </div>
              <div>
                <div style="font-weight:700;font-size:15px;color:${isConnected ? 'var(--color-success)' : 'var(--text-primary)'};">
                  ${isConnected ? 'Connected to Google Drive' : 'Google Drive Cloud Backup'}
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
                  <span>Credentials: <b>${hasCreds ? '✅ Saved in App' : '⚠️ Missing'}</b></span> &bull; 
                  <span>Token: <b>${hasToken ? '✅ Active' : '⚠️ Missing'}</b></span>
                </div>
                <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                  ${isConnected ? `Account: <b>${email}</b> &bull; Last Backup: <b>${lastBackupText}</b>` : 'Paste your Google Drive credentials.json & token JSON directly below to backup safely.'}
                </p>
              </div>
            </div>

            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-outline btn-sm" id="btn-paste-creds" style="font-size:12px;">
                📋 ${hasCreds ? 'Edit credentials.json' : 'Paste credentials.json'}
              </button>
              <button type="button" class="btn btn-outline btn-sm" id="btn-paste-token" style="font-size:12px;">
                🔑 ${hasToken ? 'Edit Token' : 'Paste Token / Code'}
              </button>
              ${isConnected ? `
                <button type="button" class="btn btn-outline btn-sm btn-danger" id="btn-disconnect-gdrive">Disconnect</button>
              ` : `
                <button type="button" class="btn btn-primary btn-sm" id="btn-open-gdrive-auth">Authorize Google</button>
              `}
            </div>
          </div>

          ${isConnected ? `
            <div style="margin-top:14px;padding:12px 14px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div>
                  <div style="font-weight:700;font-size:13px;color:var(--text-primary);display:flex;align-items:center;gap:6px;">
                    <span>📁</span> <span>Backup Folder in Google Drive: <b>RestoBill_Backups</b></span>
                  </div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                    All your cloud database snapshots are automatically saved to this dedicated folder.
                  </div>
                </div>
                <a href="${folderLink}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="font-size:12px;padding:6px 14px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">
                  <span>📂 Open in Drive</span> ↗
                </a>
              </div>
              <div style="margin-top:8px;font-size:11px;color:var(--text-secondary);line-height:1.4;border-top:1px dashed rgba(255,255,255,0.1);padding-top:6px;">
                💡 <b>Looking in Google Drive?</b> Due to Google security policies (<code>drive.file</code> scope), backups are strictly stored inside <b>RestoBill_Backups</b> (they cannot be written into manually created folders such as "Database"). Click the button above to view all files!
              </div>
            </div>
          ` : ''}
        `;

        // Event: Paste credentials.json
        document.getElementById('btn-paste-creds')?.addEventListener('click', async () => {
          this.promptPasteCredentials();
        });

        // Event: Paste token
        document.getElementById('btn-paste-token')?.addEventListener('click', async () => {
          this.promptPasteToken();
        });

        // Event: Authorize Google
        document.getElementById('btn-open-gdrive-auth')?.addEventListener('click', async () => {
          try {
            const urlRes = await window.api.gdrive.getAuthUrl();
            const authUrl = urlRes?.data || (typeof urlRes === 'string' ? urlRes : null);
            if (authUrl) {
              try { window.open(authUrl, '_blank'); } catch (ignore) {}
              this.promptAuthCode(authUrl);
            } else {
              window.App.showToast(urlRes?.error || 'Please paste credentials.json content first!', 'warning');
              this.promptPasteCredentials();
            }
          } catch (err) {
            window.App.showToast(err.message || 'Please paste credentials.json first', 'warning');
            this.promptPasteCredentials();
          }
        });

        // Event: Disconnect
        document.getElementById('btn-disconnect-gdrive')?.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const confirmed = confirm('Disconnect Google Drive? You can re-authorize or switch accounts anytime.');
          if (!confirmed) return;
          try {
            await window.api.gdrive.disconnect();
            window.App.showToast('Google Drive disconnected', 'info');
            this.render();
          } catch (err) {
            window.App.showToast('Disconnect error: ' + err.message, 'error');
          }
        });
      }
    } catch (err) {
      console.warn('Google drive status error:', err);
    }

    // Download .db Database
    const btnDownloadDb = document.getElementById('btn-download-db');
    if (btnDownloadDb) {
      btnDownloadDb.addEventListener('click', async () => {
        try {
          window.App.showToast('📥 Preparing SQLite database export...', 'info', 1500);
          await window.api.app.exportDatabase();
          window.App.showToast('Database (.db) downloaded successfully!', 'success', 3000);
        } catch (err) {
          window.App.showToast('Export failed: ' + err.message, 'error');
        }
      });
    }

    // Upload .db Database
    const btnUploadDb = document.getElementById('btn-upload-db');
    const inputUploadDb = document.getElementById('input-upload-db');
    if (btnUploadDb && inputUploadDb) {
      btnUploadDb.addEventListener('click', () => {
        inputUploadDb.value = '';
        inputUploadDb.click();
      });

      inputUploadDb.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 100 * 1024 * 1024) {
          window.App.showToast('Database file size cannot exceed 100MB', 'warning');
          return;
        }

        const sizeFormatted = (file.size / 1024).toFixed(1) + ' KB';
        const reader = new FileReader();

        reader.onload = async (ev) => {
          try {
            const arrayBuffer = ev.target.result;
            const uint8 = new Uint8Array(arrayBuffer);
            const magic = String.fromCharCode(...uint8.slice(0, 16));

            if (!magic.startsWith('SQLite format 3')) {
              window.App.showToast('Invalid file: Selected file is not a valid SQLite 3 database.', 'error', 5000);
              return;
            }

            // Prompt user confirmation before overwriting active database
            window.App.showModal({
              title: '⚠️ Restore Database from File?',
              bodyHtml: `
                <div style="padding:12px 6px;">
                  <div style="background:rgba(239, 68, 68, 0.1);border:1px solid rgba(239, 68, 68, 0.3);border-radius:8px;padding:14px;margin-bottom:16px;">
                    <div style="font-weight:700;font-size:14px;color:var(--color-danger);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                      <span>⚠️</span> Overwrite Warning
                    </div>
                    <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
                      Restoring this database file will replace all current menu items, categories, orders, customers, and settings with the uploaded backup.
                    </div>
                  </div>

                  <div style="background:var(--bg-tertiary);border-radius:8px;padding:12px;border:1px solid var(--border-color);font-size:12px;margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                      <span style="color:var(--text-muted);">Selected File:</span>
                      <span style="font-weight:700;color:var(--text-primary);">${file.name}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                      <span style="color:var(--text-muted);">File Size:</span>
                      <span style="font-weight:700;color:var(--text-primary);">${sizeFormatted}</span>
                    </div>
                  </div>

                  <p style="font-size:12px;color:var(--text-muted);margin:0;">
                    Click <b>Restore & Populate</b> to import this database and refresh all records.
                  </p>
                </div>
              `,
              footerButtons: [
                {
                  text: 'Cancel',
                  className: 'btn btn-outline btn-sm',
                  onClick: () => window.App.closeModal()
                },
                {
                  text: '⚡ Restore & Populate All Records',
                  className: 'btn btn-primary btn-sm btn-danger',
                  onClick: async () => {
                    try {
                      window.App.closeModal();
                      window.App.showToast('Restoring database and populating all records...', 'info', 4000);
                      const res = await window.api.app.importDatabase(arrayBuffer);
                      if (res.success) {
                        window.App.showToast('✅ Database restored successfully! Reloading...', 'success', 3000);
                        setTimeout(() => {
                          window.location.reload();
                        }, 1200);
                      } else {
                        window.App.showToast(res.error || 'Database restoration failed', 'error');
                      }
                    } catch (err) {
                      window.App.showToast('Failed to import database: ' + err.message, 'error');
                    }
                  }
                }
              ]
            });
          } catch (readErr) {
            window.App.showToast('Failed to read database file: ' + readErr.message, 'error');
          }
        };

        reader.readAsArrayBuffer(file);
      });
    }

    // Backup Now Button
    document.getElementById('btn-trigger-backup')?.addEventListener('click', async () => {
      try {
        window.App.showToast('Creating database backup to Google Drive...', 'info');
        const res = await window.api.gdrive.backup();
        const data = res?.data || res || {};
        const isUploaded = Boolean(data.uploadedToDrive || res.uploadedToDrive || (res.success && data.backup));
        if (isUploaded) {
          const name = data.backup?.name || res.backup?.name || 'database backup';
          window.App.showToast(`✅ Database uploaded to Google Drive ("RestoBill_Backups") as ${name}!`, 'success', 6000);
          this.render();
        } else {
          const reason = data.driveError || res.driveError || (res.error ? res.error : 'Google Drive is not connected');
          window.App.showToast(`⚠️ ${reason}. Database downloaded locally instead.`, 'warning', 6000);
          this.render();
        }
      } catch (err) {
        window.App.showToast(err.message, 'error');
      }
    });

    document.getElementById('btn-refresh-backups')?.addEventListener('click', () => {
      this.loadBackupsList();
    });

    document.getElementById('btn-lock-backup')?.addEventListener('click', () => {
      this.unlockedTabs['backup'] = false;
      this.activeTab = 'restaurant';
      this.syncTabButtons();
      this.render();
      window.App.showToast('🔒 Cloud Backup locked', 'info');
    });

    this.loadBackupsList();
  },

  async loadBackupsList() {
    const listContainer = document.getElementById('backups-list-container');
    if (!listContainer) return;

    try {
      const res = await window.api.gdrive.getBackups();
      const backups = (res?.success && Array.isArray(res?.data)) ? res.data : (Array.isArray(res) ? res : []);
      if (backups && backups.length > 0) {
        listContainer.innerHTML = backups.map(b => `
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:12px 14px;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-sm);margin-bottom:8px;width:100%;box-sizing:border-box;">
            <div style="display:flex;align-items:center;gap:10px;flex:1 1 200px;min-width:0;">
              <span style="font-size:20px;flex-shrink:0;">📁</span>
              <div style="min-width:0;flex:1;">
                <div style="font-weight:600;color:var(--text-primary);display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
                  <span style="word-break:break-all;overflow-wrap:anywhere;font-size:13px;">${b.name}</span>
                  <span style="font-size:9px;padding:2px 5px;border-radius:4px;background:rgba(34,197,94,0.15);color:var(--color-success);font-weight:700;flex-shrink:0;">${b.uploadedToDrive ? 'GOOGLE DRIVE' : 'LOCAL'}</span>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                  ${window.App.formatDateTime(b.createdAt || b.createdTime || b.created_at)} &bull; Size: ${b.sizeFormatted || ''}
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;">
              ${b.driveUrl ? `<a href="${b.driveUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="font-size:11px;text-decoration:none;padding:5px 9px;">View in Drive ↗</a>` : ''}
              <button class="btn btn-outline btn-sm btn-restore-backup" data-id="${b.id}" style="color:var(--color-primary);border-color:var(--color-primary);font-size:11px;padding:5px 12px;">
                Restore
              </button>
            </div>
          </div>
        `).join('');

        listContainer.querySelectorAll('.btn-restore-backup').forEach(btn => {
          btn.onclick = async () => {
            const fileId = btn.getAttribute('data-id');
            if (confirm('Warning: Restoring will overwrite the current database with this backup. Proceed?')) {
              try {
                window.App.showToast('Restoring database from Google Drive...', 'info');
                const r = await window.api.gdrive.restore(fileId);
                if (r.success) {
                  window.App.showToast('✅ Database restored successfully! Reloading...', 'success', 3000);
                  setTimeout(() => {
                    window.location.reload();
                  }, 1200);
                } else {
                  window.App.showToast(r.error || 'Restore failed', 'error');
                }
              } catch (err) {
                window.App.showToast(err.message, 'error');
              }
            }
          };
        });
      } else {
        listContainer.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No backups found in Google Drive yet. Click "Backup Now" above to create your first backup.</p>`;
      }
    } catch (e) {
      listContainer.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">Connect Google Drive to view backup history.</p>`;
    }
  },

  promptAuthCode(authUrl) {
    window.App.showModal({
      title: 'Google Drive Authorization',
      bodyHtml: `
        <div style="background:rgba(99, 102, 241, 0.1);border:1px solid rgba(99, 102, 241, 0.3);border-radius:8px;padding:14px;margin-bottom:16px;">
          <div style="font-weight:700;font-size:13px;color:var(--accent-light);margin-bottom:6px;">
            📌 Quick Steps to Authorize:
          </div>
          <ol style="font-size:12px;color:var(--text-secondary);margin:0;padding-left:18px;line-height:1.7;">
            ${authUrl ? `
              <li style="margin-bottom:6px;">
                Open Google Login:<br>
                <a href="${authUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:6px;margin:6px 0;text-decoration:none;font-weight:600;">
                  <span>🌐 Open Google Authorization Page</span> ↗
                </a>
              </li>
            ` : '<li>Sign in to your Google account.</li>'}
            <li>Log in with your Google account and click <b>Continue / Allow</b>.</li>
            <li>Google will redirect to a page starting with <code>http://localhost/?code=4/0A...</code> (the browser may say <i>"This site can't be reached"</i> – that is 100% normal!).</li>
            <li>Copy the full address from the address bar (or just the code), paste it below, and click <b>Verify & Connect</b>.</li>
          </ol>
        </div>

        <div class="form-group">
          <label style="font-weight:600;">Authorization Code or Redirected URL</label>
          <input type="text" id="modal-gdrive-code" placeholder="Paste code or redirected URL here (e.g. http://localhost/?code=4/0A...)" style="font-size:13px;" autofocus>
          <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:4px;">
            💡 RestoBill will automatically extract the code if you paste the entire address bar URL.
          </span>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Verify & Connect',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            let code = document.getElementById('modal-gdrive-code')?.value.trim();
            if (!code) {
              window.App.showToast('Please paste the authorization code or redirected URL', 'warning');
              return;
            }

            // Auto-clean if full URL is pasted
            if (code.includes('code=')) {
              try {
                const parsedUrl = new URL(code.startsWith('http') ? code : `http://localhost/${code}`);
                code = parsedUrl.searchParams.get('code') || code;
              } catch (e) {
                const match = code.match(/[?&]code=([^&]+)/);
                if (match) code = decodeURIComponent(match[1]);
              }
            }

            try {
              window.App.showToast('Verifying with Google...', 'info');
              const res = await window.api.gdrive.authenticate(code);
              const data = res?.data || res;
              if (data?.success || res?.success) {
                window.App.showToast('✅ Google Drive connected successfully!', 'success');
                window.App.closeModal();
                this.render();
              } else {
                window.App.showToast(data?.error || res?.error || 'Authentication failed. Please verify the code and try again.', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  async promptPasteCredentials() {
    let existing = '';
    try {
      const creds = await window.api.gdrive.getCredentials();
      if (creds) existing = JSON.stringify(creds, null, 2);
    } catch (e) {}

    window.App.showModal({
      title: '📋 Paste credentials.json Content',
      bodyHtml: `
        <div style="background:rgba(99, 102, 241, 0.08);border:1px solid rgba(99, 102, 241, 0.25);border-radius:8px;padding:12px;margin-bottom:14px;">
          <div style="font-weight:700;font-size:12px;color:var(--accent-primary);margin-bottom:4px;">
            ℹ️ Direct In-App Credentials Setup
          </div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
            Paste the raw JSON content of your Google Cloud OAuth <code>credentials.json</code> file below. No file placement needed!
          </div>
        </div>

        <div class="form-group">
          <label style="font-weight:600;font-size:13px;">credentials.json (OAuth Client JSON)</label>
          <textarea id="modal-gdrive-creds-json" rows="9" style="font-family:monospace;font-size:11px;width:100%;padding:10px;line-height:1.4;" placeholder='{\n  "installed": {\n    "client_id": "...",\n    "client_secret": "..."\n  }\n}'>${existing}</textarea>
        </div>
      `,
      footerButtons: [
        {
          text: 'Cancel',
          class: 'btn-outline',
          action: () => window.App.closeModal()
        },
        {
          text: 'Save Credentials',
          class: 'btn-primary',
          action: async () => {
            const raw = document.getElementById('modal-gdrive-creds-json')?.value.trim();
            if (!raw) {
              window.App.showToast('Please paste your credentials.json text', 'warning');
              return;
            }
            try {
              window.App.showToast('Validating credentials...', 'info');
              const res = await window.api.gdrive.saveCredentials(raw);
              if (res.success) {
                window.App.showToast('credentials.json saved successfully in app!', 'success');
                window.App.closeModal();
                this.render();
              } else {
                window.App.showToast(res.error || 'Invalid credentials JSON', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  async promptPasteToken() {
    let existing = '';
    try {
      const tok = await window.api.gdrive.getToken();
      if (tok) existing = typeof tok === 'string' ? tok : JSON.stringify(tok, null, 2);
    } catch (e) {}

    window.App.showModal({
      title: '🔑 Paste Google Drive Token / Code',
      bodyHtml: `
        <div style="background:rgba(34, 197, 94, 0.08);border:1px solid rgba(34, 197, 94, 0.25);border-radius:8px;padding:12px;margin-bottom:14px;">
          <div style="font-weight:700;font-size:12px;color:var(--color-success);margin-bottom:4px;">
            🔒 Paste OAuth Token, Token JSON, or Authorization Code
          </div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;">
            Paste your <code>gdrive_token.json</code> content, OAuth Access Token, or the <code>4/0A...</code> authorization code from Google.
          </div>
        </div>

        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label style="font-weight:600;font-size:13px;margin:0;">Token JSON or Authorization Code</label>
            ${existing ? `<button type="button" class="btn btn-outline btn-sm" id="btn-copy-token-modal" style="font-size:11px;padding:2px 8px;cursor:pointer;">📋 Copy Token</button>` : ''}
          </div>
          <textarea id="modal-gdrive-token-json" rows="8" style="font-family:monospace;font-size:11px;width:100%;padding:10px;line-height:1.4;" placeholder='Paste token JSON or raw auth code here...'>${existing}</textarea>
        </div>
      `,
      footerButtons: [
        {
          text: 'Cancel',
          class: 'btn-outline',
          action: () => window.App.closeModal()
        },
        {
          text: 'Save Token & Connect',
          class: 'btn-primary',
          action: async () => {
            const raw = document.getElementById('modal-gdrive-token-json')?.value.trim();
            if (!raw) {
              window.App.showToast('Please paste your token JSON or code', 'warning');
              return;
            }
            try {
              window.App.showToast('Saving & verifying token with Google...', 'info');
              const res = await window.api.gdrive.saveToken(raw);
              const data = res?.data || res;
              if (data?.success || res?.success) {
                window.App.showToast('✅ Google Drive connected successfully!', 'success');
                window.App.closeModal();
                this.render();
              } else {
                window.App.showToast(data?.error || res?.error || 'Failed to save token', 'error', 6000);
              }
            } catch (err) {
              window.App.showToast(err.message || 'Failed to save token', 'error', 6000);
            }
          }
        }
      ]
    });

    setTimeout(() => {
      document.getElementById('btn-copy-token-modal')?.addEventListener('click', () => {
        const text = document.getElementById('modal-gdrive-token-json')?.value;
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            window.App.showToast('📋 Token copied to clipboard! You can paste it into your mobile app.', 'success', 4000);
          }).catch(() => {
            window.App.showToast('Please select and copy the text in the box above', 'info');
          });
        }
      });
    }, 50);
  },

  async renderAboutTab(container) {
    let version = '1.0.0';
    let dbPath = 'Local SQLite Database';

    try {
      const verRes = await window.api.app.getVersion();
      if (verRes?.success) version = verRes.data;

      const pathRes = await window.api.app.getDbPath();
      if (pathRes?.success) dbPath = pathRes.data;
    } catch (e) {}

    container.innerHTML = `
      <div class="settings-section about-page-wrapper">
        <!-- 1. RestoBill Brand Hero Card -->
        <div class="about-hero-card">
          <div class="about-hero-header">
            <div class="about-logo-badge">
              <span class="about-logo-letters">RB</span>
            </div>
            <div class="about-hero-info">
              <div class="about-title-row">
                <h3 class="about-app-name">RestoBill POS</h3>
                <span class="about-version-badge">v${version}</span>
              </div>
              <p class="about-app-tagline">Modern, GST-Compliant Restaurant POS & Billing Solution</p>
            </div>
          </div>

          <p class="about-hero-description">
            High-performance, offline-first billing system engineered for Indian restaurants, cafes, cloud kitchens, bakeries, and food trucks. Features 100% offline data autonomy, zero cloud lock-in, lightning-fast thermal printing, and optional Google Drive synchronization.
          </p>

          <div class="about-pill-tags">
            <span class="about-pill">⚡ 100% Offline-First</span>
            <span class="about-pill">🧾 GST &amp; GSTR-1 Ready</span>
            <span class="about-pill">🖨️ 80mm &amp; 58mm Thermal</span>
            <span class="about-pill">☁️ Auto Cloud Backup</span>
          </div>
        </div>

        <!-- 2. Developer & Creator Showcase Card -->
        <div class="about-developer-card">
          <div class="about-dev-header">
            <div class="about-dev-avatar">
              <span>RS</span>
            </div>
            <div class="about-dev-intro">
              <div class="about-dev-name-row">
                <h4 class="about-dev-name">Rahul Singh</h4>
                <span class="about-dev-badge">Author &amp; Architect</span>
              </div>
              <p class="about-dev-role">Lead Software Engineer &amp; System Architect</p>
            </div>
          </div>

          <p class="about-dev-summary">
            Designed and developed RestoBill's core architecture, local SQLite database storage engine, high-speed ESC/POS receipt generation, responsive mobile UI, and automated Google Drive cloud backup sync.
          </p>

          <div class="about-contact-grid">
            <!-- Phone -->
            <div class="about-contact-box">
              <div class="about-contact-lead">
                <span class="about-icon-circle">📞</span>
                <div class="about-contact-labels">
                  <span class="about-meta-label">Phone</span>
                  <a href="tel:+919450161899" class="about-primary-text">+91 9450161899</a>
                </div>
              </div>
              <div class="about-actions-pair">
                <a href="tel:+919450161899" class="btn btn-outline btn-xs">Call</a>
                <a href="https://wa.me/919450161899" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-xs btn-wa-chat">WhatsApp</a>
              </div>
            </div>

            <!-- Email -->
            <div class="about-contact-box">
              <div class="about-contact-lead">
                <span class="about-icon-circle">✉️</span>
                <div class="about-contact-labels">
                  <span class="about-meta-label">Email ID</span>
                  <a href="mailto:100rahulsingh100@gmail.com" class="about-primary-text">100rahulsingh100@gmail.com</a>
                </div>
              </div>
              <div class="about-actions-pair">
                <a href="mailto:100rahulsingh100@gmail.com" class="btn btn-outline btn-xs">Send Email</a>
              </div>
            </div>

            <!-- LinkedIn (Strictly Hypertext) -->
            <div class="about-contact-box about-contact-linkedin">
              <div class="about-contact-lead">
                <span class="about-icon-circle" style="background:rgba(10,102,194,0.18);color:#0a66c2;">💼</span>
                <div class="about-contact-labels">
                  <span class="about-meta-label">LinkedIn</span>
                  <a href="https://www.linkedin.com/in/astrorock" target="_blank" rel="noopener noreferrer" class="about-linkedin-hyperlink">
                    <span>Connect with Rahul Singh on LinkedIn</span>
                    <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. System & Runtime Specifications -->
        <div class="about-specs-container">
          <h4 class="about-specs-heading">System &amp; Technology Specs</h4>
          <div class="about-specs-grid">
            <div class="about-spec-tile">
              <span class="about-spec-title">Data Storage</span>
              <span class="about-spec-detail">${dbPath}</span>
            </div>
            <div class="about-spec-tile">
              <span class="about-spec-title">Platform Runtime</span>
              <span class="about-spec-detail">Capacitor Native (Android APK) / Electron (Desktop)</span>
            </div>
            <div class="about-spec-tile">
              <span class="about-spec-title">Tax Compliance</span>
              <span class="about-spec-detail">GST Act, GSTR-1 Tax Invoices, B2B/B2C, HSN/SAC</span>
            </div>
            <div class="about-spec-tile">
              <span class="about-spec-title">Printing Engine</span>
              <span class="about-spec-detail">80mm &amp; 58mm Thermal ESC/POS &amp; Standard A4 Laser</span>
            </div>
          </div>
        </div>

        <div class="about-footer-bar">
          <span>RestoBill POS &bull; Developed by Rahul Singh &bull; All Rights Reserved</span>
        </div>
      </div>
    `;
  },

  renderMetricsTab(container) {
    const s = this.settings;
    const isEnabled = s.supabase_enabled === '1';
    const supabaseUrl = s.supabase_url || sessionStorage.getItem('draft_supabase_url') || '';
    const anonKey = s.supabase_anon_key || sessionStorage.getItem('draft_supabase_anon_key') || '';
    const outletName = s.supabase_outlet_name || s.restaurant_name || sessionStorage.getItem('draft_supabase_outlet') || 'RestoBill Main Branch';

    const sqlScript = `-- ═══════════════════════════════════════════════════════════════
-- RESTOBILL LIVE METRICS & SALES TELEMETRY SCHEMA FOR SUPABASE
-- Run this in your Supabase SQL Editor (Click 'Run' once)
-- ═══════════════════════════════════════════════════════════════

-- 1. Create Live Orders & Metrics Table
create table if not exists restobill_orders (
  id bigint generated by default as identity primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  order_no text not null,
  outlet_name text not null default 'RestoBill Outlet',
  order_type text default 'dine_in',
  table_no text default '',
  payment_mode text default 'cash',
  subtotal numeric(12,2) default 0,
  discount numeric(12,2) default 0,
  tax_amount numeric(12,2) default 0,
  total numeric(12,2) not null default 0,
  items_count integer default 0,
  items_summary text default '',
  customer_name text default '',
  customer_phone text default '',
  cashier_name text default '',
  app_version text default '1.0.0',
  device_info text default '',
  order_date date default (now() at time zone 'Asia/Kolkata')::date,
  constraint uq_order_outlet unique (order_no, outlet_name)
);

-- Indexes for instant fast querying
create index if not exists idx_restobill_orders_date on restobill_orders(order_date desc, outlet_name);
create index if not exists idx_restobill_orders_payment on restobill_orders(payment_mode);

-- 2. Create Device Heartbeats Table (Online/Offline Device Tracking)
create table if not exists restobill_heartbeats (
  device_id text primary key,
  outlet_name text not null default 'RestoBill Outlet',
  device_name text default '',
  platform text default '',
  app_version text default '1.0.0',
  today_orders integer default 0,
  today_revenue numeric(12,2) default 0,
  last_seen_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Row Level Security (RLS) - Allows POS app to insert/sync using Anon Key
alter table restobill_orders enable row level security;
drop policy if exists "Allow anon read write restobill_orders" on restobill_orders;
create policy "Allow anon read write restobill_orders" on restobill_orders
  for all to anon using (true) with check (true);

alter table restobill_heartbeats enable row level security;
drop policy if exists "Allow anon read write restobill_heartbeats" on restobill_heartbeats;
create policy "Allow anon read write restobill_heartbeats" on restobill_heartbeats
  for all to anon using (true) with check (true);

-- 4. Grant Schema & Table Permissions to Anon Role (Crucial for PostgREST API visibility)
grant usage on schema public to anon, authenticated;
grant all on table restobill_orders to anon, authenticated;
grant all on table restobill_heartbeats to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- 5. Force PostgREST to reload schema cache immediately
notify pgrst, 'reload schema';

-- 4. Analytical Views for instant Charts & Dashboards
create or replace view v_daily_sales_summary as
select
  order_date,
  outlet_name,
  count(*) as total_orders,
  coalesce(sum(total), 0) as total_revenue,
  coalesce(avg(total), 0)::numeric(10,2) as avg_order_value,
  coalesce(sum(case when payment_mode = 'cash' then total else 0 end), 0) as cash_sales,
  coalesce(sum(case when payment_mode = 'upi' then total else 0 end), 0) as upi_sales,
  coalesce(sum(case when payment_mode = 'card' then total else 0 end), 0) as card_sales,
  coalesce(sum(case when payment_mode in ('split', 'credit') then total else 0 end), 0) as other_sales,
  coalesce(sum(tax_amount), 0) as total_tax_collected,
  coalesce(sum(discount), 0) as total_discount_given
from restobill_orders
group by order_date, outlet_name
order by order_date desc;

create or replace view v_hourly_sales as
select
  order_date,
  outlet_name,
  extract(hour from created_at at time zone 'Asia/Kolkata') as hour_of_day,
  count(*) as orders_count,
  coalesce(sum(total), 0) as hourly_revenue
from restobill_orders
group by order_date, outlet_name, hour_of_day
order by order_date desc, hour_of_day asc;`;

    container.innerHTML = `
      <div class="settings-section">
        <!-- Status Header Card -->
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:18px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:24px;">📊</span>
              <div>
                <h3 style="font-size:17px;font-weight:700;margin:0;">Cloud Metrics &amp; Live Telemetry (Supabase)</h3>
                <p style="font-size:12px;color:var(--text-muted);margin:2px 0 0 0;">
                  Stream live sales, order summaries, and device status to your free Supabase cloud database.
                </p>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span id="badge-supabase-status" style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${isEnabled && supabaseUrl ? 'rgba(34,197,94,0.15)' : 'var(--bg-tertiary)'};color:${isEnabled && supabaseUrl ? 'var(--color-success)' : 'var(--text-muted)'};border:1px solid ${isEnabled && supabaseUrl ? 'rgba(34,197,94,0.3)' : 'var(--border-color)'};">
                ${isEnabled && supabaseUrl ? '● Live Sync Active' : '○ Cloud Sync Disabled'}
              </span>
              <button type="button" id="btn-lock-metrics" class="btn btn-outline btn-sm" style="font-size:12px;padding:6px 12px;display:flex;align-items:center;gap:6px;">
                🔒 Lock Page
              </button>
            </div>
          </div>

          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;background:var(--bg-surface);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);">
            💡 <b>How it works:</b> Every time a cashier settles a bill, RestoBill sends a clean lightweight summary to your Supabase PostgreSQL database in under 1 second. You can open <b>supabase.com/dashboard</b> on your phone or computer anytime to monitor live sales from anywhere in the world! If the internet drops, bills are queued locally and automatically synced once reconnected.
          </div>
        </div>

        <!-- 3-Step Setup Guide Accordion -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;margin-bottom:20px;">
          <!-- Step 1 -->
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:14px;">
            <div style="font-size:13px;font-weight:700;color:var(--accent-primary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
              <span style="width:20px;height:20px;border-radius:50%;background:var(--accent-primary);color:white;display:inline-flex;align-items:center;justify-content:center;font-size:11px;">1</span>
              Create Free Project
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px 0;line-height:1.4;">
              Go to Supabase (100% Free Forever) and click <b>New Project</b>.
            </p>
            <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="width:100%;font-size:11px;padding:6px 10px;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:4px;">
              <span>Open Supabase.com ↗</span>
            </a>
          </div>

          <!-- Step 2 -->
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:14px;">
            <div style="font-size:13px;font-weight:700;color:var(--accent-primary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
              <span style="width:20px;height:20px;border-radius:50%;background:var(--accent-primary);color:white;display:inline-flex;align-items:center;justify-content:center;font-size:11px;">2</span>
              Run 1-Click SQL Script
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px 0;line-height:1.4;">
              In your Supabase sidebar, open <b>SQL Editor</b>, paste our script and click <b>Run</b>.
            </p>
            <button type="button" class="btn btn-outline btn-sm" id="btn-copy-sql-script" style="width:100%;font-size:11px;padding:6px 10px;display:flex;align-items:center;justify-content:center;gap:4px;">
              <span>📋 Copy SQL Script</span>
            </button>
          </div>

          <!-- Step 3 -->
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:14px;">
            <div style="font-size:13px;font-weight:700;color:var(--accent-primary);margin-bottom:6px;display:flex;align-items:center;gap:6px;">
              <span style="width:20px;height:20px;border-radius:50%;background:var(--accent-primary);color:white;display:inline-flex;align-items:center;justify-content:center;font-size:11px;">3</span>
              Copy Project API Keys
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin:0;line-height:1.4;">
              In Supabase, go to <b>Project Settings &gt; API</b>. Copy your <b>Project URL</b> and public <b>anon key</b> into the form below.
            </p>
          </div>
        </div>

        <!-- Supabase Configuration Form Card -->
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:18px;margin-bottom:20px;">
          <h4 style="font-size:15px;font-weight:700;margin:0 0 14px 0;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
            <span>⚡</span> Supabase API Connection Settings
          </h4>

          <form id="settings-supabase-form">
            <div class="form-row">
              <div class="form-group">
                <label>Live Metrics Sync Status</label>
                <select name="supabase_enabled" id="select-supabase-enabled">
                  <option value="1" ${isEnabled ? 'selected' : ''}>✅ Enabled (Live Cloud Metrics Sync)</option>
                  <option value="0" ${!isEnabled ? 'selected' : ''}>⛔ Disabled</option>
                </select>
              </div>
              <div class="form-group">
                <label>Outlet / Branch Display Name</label>
                <input type="text" name="supabase_outlet_name" id="input-supabase-outlet" value="${outletName}" placeholder="e.g. RestoBill Main Branch">
              </div>
            </div>

            <div class="form-group">
              <label>Supabase Project URL</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="text" name="supabase_url" id="input-supabase-url" value="${supabaseUrl}" placeholder="https://xyzprojectref.supabase.co" autocomplete="off" style="flex:1;" required>
                <button type="button" class="btn btn-outline btn-sm" id="btn-paste-url" title="Paste Project URL from Clipboard" style="padding:7px 12px;white-space:nowrap;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
                  📋 Paste
                </button>
              </div>
              <span style="font-size:11px;color:var(--text-muted);margin-top:4px;display:block;">
                Found in Supabase under Project Settings &gt; Configuration &gt; API &gt; Project URL
              </span>
            </div>

            <div class="form-group">
              <label>Supabase Public Anon Key (apikey)</label>
              <div style="display:flex;gap:6px;align-items:center;">
                <div style="position:relative;flex:1;">
                  <input type="password" name="supabase_anon_key" id="input-supabase-key" value="${anonKey}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." autocomplete="off" style="width:100%;padding-right:38px;" required>
                  <button type="button" id="btn-toggle-key-visibility" title="Show / Hide Key" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;padding:4px;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;z-index:2;">
                    👁️
                  </button>
                </div>
                <button type="button" class="btn btn-outline btn-sm" id="btn-paste-key" title="Paste Anon Key from Clipboard" style="padding:7px 12px;white-space:nowrap;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
                  📋 Paste
                </button>
              </div>
              <span style="font-size:11px;color:var(--text-muted);margin-top:4px;display:block;">
                Found in Supabase under Project Settings &gt; Configuration &gt; API &gt; Project API keys &gt; 'anon' public
              </span>
            </div>

            <!-- Connection Test Feedback Box -->
            <div id="supabase-test-result" style="display:none;margin-bottom:14px;padding:12px;border-radius:var(--radius-sm);font-size:12px;line-height:1.5;"></div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
              <button type="submit" class="btn btn-primary btn-sm" style="min-width:180px;">
                💾 Save Metrics Settings
              </button>
              <button type="button" class="btn btn-outline btn-sm" id="btn-test-supabase">
                ⚡ Test Supabase Connection
              </button>
            </div>
          </form>
        </div>

        <!-- Historical Backfill Card -->
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:18px;margin-bottom:20px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div style="flex:1 1 240px;">
              <h4 style="font-size:15px;font-weight:700;margin:0 0 4px 0;display:flex;align-items:center;gap:8px;">
                <span>📤</span> Historical Data Sync (Upload Past Orders)
              </h4>
              <p style="font-size:12px;color:var(--text-muted);margin:0;line-height:1.4;">
                Upload your existing SQLite bills to Supabase so your cloud dashboards and analytics immediately reflect all previous business history.
              </p>
            </div>
            <button type="button" class="btn btn-outline btn-sm" id="btn-sync-past-orders" style="display:inline-flex;align-items:center;gap:6px;font-weight:600;">
              <span>☁️ Upload Past Orders</span>
            </button>
          </div>
          <div id="past-sync-progress" style="display:none;margin-top:14px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
              <span id="past-sync-label">Syncing orders...</span>
              <span id="past-sync-percent">0%</span>
            </div>
            <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
              <div id="past-sync-bar" style="height:100%;width:0%;background:var(--accent-primary);transition:width 0.2s;"></div>
            </div>
          </div>
        </div>

        <!-- Pre-Built Dashboards & Visualizations Link Card -->
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:18px;">
          <h4 style="font-size:15px;font-weight:700;margin:0 0 10px 0;display:flex;align-items:center;gap:8px;">
            <span>📈</span> Viewing Your Live Metrics &amp; Dashboards in Supabase
          </h4>
          <p style="font-size:12px;color:var(--text-muted);margin:0 0 14px 0;line-height:1.5;">
            Once connected, your live data is accessible in Supabase via multiple powerful tools:
          </p>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:12px;">
            <div style="background:var(--bg-surface);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--text-primary);">1. Table Editor</div>
              <div style="font-size:11px;color:var(--text-muted);line-height:1.4;">
                Open <code>restobill_orders</code> to watch new customer bills stream in live with items, totals, and payment modes.
              </div>
            </div>
            <div style="background:var(--bg-surface);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--text-primary);">2. Daily Revenue Summary</div>
              <div style="font-size:11px;color:var(--text-muted);line-height:1.4;">
                Open view <code>v_daily_sales_summary</code> to see daily gross sales, UPI vs Cash totals, and average bill value.
              </div>
            </div>
            <div style="background:var(--bg-surface);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--text-primary);">3. Hourly Rush Peak View</div>
              <div style="font-size:11px;color:var(--text-muted);line-height:1.4;">
                Open view <code>v_hourly_sales</code> to visualize peak customer rush hours (lunch vs dinner) for staff scheduling.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // ── Attach Event Listeners ──

    // Copy SQL Script button
    const copySqlBtn = document.getElementById('btn-copy-sql-script');
    if (copySqlBtn) {
      copySqlBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(sqlScript);
          copySqlBtn.innerHTML = '<span>✅ SQL Copied to Clipboard!</span>';
          window.App.showToast('SQL schema copied! Open Supabase SQL Editor and click Run.', 'success', 4000);
          setTimeout(() => {
            copySqlBtn.innerHTML = '<span>📋 Copy SQL Script</span>';
          }, 3000);
        } catch (e) {
          window.App.showModal({
            title: '📋 Supabase SQL Schema Script',
            bodyHtml: `
              <p style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
                Copy and run this in your Supabase SQL Editor:
              </p>
              <textarea readonly style="width:100%;height:220px;font-family:monospace;font-size:11px;background:var(--bg-primary);color:var(--text-primary);padding:10px;border-radius:4px;">${sqlScript}</textarea>
            `,
            footerButtons: [{ text: 'Close', class: 'btn-outline', action: () => window.App.closeModal() }]
          });
        }
      };
    }

    // Toggle Anon Key visibility
    const eyeBtn = document.getElementById('btn-toggle-key-visibility');
    const keyField = document.getElementById('input-supabase-key');
    if (eyeBtn && keyField) {
      eyeBtn.onclick = () => {
        if (keyField.type === 'password') {
          keyField.type = 'text';
          eyeBtn.textContent = '🙈';
          eyeBtn.title = 'Hide Key';
        } else {
          keyField.type = 'password';
          eyeBtn.textContent = '👁️';
          eyeBtn.title = 'Show Key';
        }
      };
    }

    // Clipboard Paste helper for URL and Key
    const pasteToInput = async (targetInput, fieldName) => {
      if (!targetInput) return;
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text && text.trim()) {
            targetInput.value = text.trim();
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            window.App?.showToast(`Pasted ${fieldName} from clipboard!`, 'success', 2000);
            return;
          }
        }
        targetInput.focus();
        window.App?.showToast('Please long-press the field and tap Paste', 'info', 3000);
      } catch (err) {
        console.warn(`[Paste] Could not read clipboard for ${fieldName}:`, err);
        targetInput.focus();
        window.App?.showToast('Please long-press the field and tap Paste', 'info', 3000);
      }
    };

    const pasteUrlBtn = document.getElementById('btn-paste-url');
    if (pasteUrlBtn) {
      pasteUrlBtn.onclick = () => {
        pasteToInput(document.getElementById('input-supabase-url'), 'Project URL');
      };
    }

    const pasteKeyBtn = document.getElementById('btn-paste-key');
    if (pasteKeyBtn) {
      pasteKeyBtn.onclick = () => {
        pasteToInput(document.getElementById('input-supabase-key'), 'Anon Key');
      };
    }

    // Test Connection Button
    const testBtn = document.getElementById('btn-test-supabase');
    const resultBox = document.getElementById('supabase-test-result');
    if (testBtn) {
      testBtn.onclick = async () => {
        const urlInput = document.getElementById('input-supabase-url');
        const keyInput = document.getElementById('input-supabase-key');

        let rawUrl = urlInput?.value || '';
        let rawKey = keyInput?.value || '';

        // Clean values and write back to inputs so user sees sanitized values
        const cleanUrl = window.SupabaseSync.cleanSupabaseUrl(rawUrl);
        const cleanKey = window.SupabaseSync.cleanSupabaseKey(rawKey);
        if (urlInput && cleanUrl && cleanUrl !== rawUrl) {
          urlInput.value = cleanUrl;
        }
        if (keyInput && cleanKey && cleanKey !== rawKey) {
          keyInput.value = cleanKey;
        }

        testBtn.disabled = true;
        testBtn.innerHTML = '<span>Testing connection...</span>';
        if (resultBox) {
          resultBox.style.display = 'block';
          resultBox.style.background = 'var(--bg-tertiary)';
          resultBox.style.color = 'var(--text-secondary)';
          resultBox.style.border = '1px solid var(--border-color)';
          resultBox.textContent = 'Connecting to Supabase...';
        }

        const res = await window.SupabaseSync.testConnection(cleanUrl || rawUrl, cleanKey || rawKey);
        testBtn.disabled = false;
        testBtn.innerHTML = '<span>⚡ Test Supabase Connection</span>';

        if (resultBox) {
          resultBox.style.display = 'block';
          if (res.success) {
            if (res.tablesPending) {
              resultBox.style.background = 'rgba(234, 179, 8, 0.12)';
              resultBox.style.color = '#eab308';
              resultBox.style.border = '1px solid rgba(234, 179, 8, 0.35)';
              resultBox.innerHTML = `
                <div style="font-weight:700;font-size:13px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
                  <span>🟡</span> Credentials Verified &amp; Connected!
                </div>
                <div style="color:var(--text-primary);line-height:1.5;white-space:pre-line;">${res.message}</div>
              `;
              window.App.showToast('Credentials verified! Run SQL script to finish.', 'warning', 6000);
            } else {
              resultBox.style.background = 'rgba(34, 197, 94, 0.12)';
              resultBox.style.color = 'var(--color-success)';
              resultBox.style.border = '1px solid rgba(34, 197, 94, 0.3)';
              resultBox.innerHTML = `
                <div style="font-weight:700;font-size:13px;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                  <span>✅</span> Connection Successful!
                </div>
                <div style="line-height:1.4;">${res.message}</div>
              `;
              window.App.showToast('Supabase connection verified!', 'success');
            }
          } else {
            resultBox.style.background = 'rgba(239, 68, 68, 0.12)';
            resultBox.style.color = 'var(--color-danger)';
            resultBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            resultBox.innerHTML = `
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                <span>❌</span> Connection Failed
              </div>
              <div style="line-height:1.5;white-space:pre-line;color:var(--text-primary);">${res.message}</div>
            `;
            window.App.showToast('Connection failed. See details below.', 'error');
          }
        }
      };
    }

    // Save Form
    const form = document.getElementById('settings-supabase-form');
    if (form) {
      // Auto-save draft inputs as user types so switching to Notepad never loses values
      const urlInput = document.getElementById('input-supabase-url');
      const keyInput = document.getElementById('input-supabase-key');
      const outletInput = document.getElementById('input-supabase-outlet');

      urlInput?.addEventListener('input', () => sessionStorage.setItem('draft_supabase_url', urlInput.value));
      keyInput?.addEventListener('input', () => sessionStorage.setItem('draft_supabase_anon_key', keyInput.value));
      outletInput?.addEventListener('input', () => sessionStorage.setItem('draft_supabase_outlet', outletInput.value));

      form.onsubmit = async (e) => {
        e.preventDefault();
        sessionStorage.removeItem('draft_supabase_url');
        sessionStorage.removeItem('draft_supabase_anon_key');
        sessionStorage.removeItem('draft_supabase_outlet');

        const enabled = document.getElementById('select-supabase-enabled')?.value || '0';
        const rawUrl = document.getElementById('input-supabase-url')?.value || '';
        const rawKey = document.getElementById('input-supabase-key')?.value || '';
        const outlet = (document.getElementById('input-supabase-outlet')?.value || '').trim();

        const cleanUrl = window.SupabaseSync.cleanSupabaseUrl(rawUrl);
        const cleanKey = window.SupabaseSync.cleanSupabaseKey(rawKey);

        const urlInputEl = document.getElementById('input-supabase-url');
        const keyInputEl = document.getElementById('input-supabase-key');
        if (urlInputEl && cleanUrl) urlInputEl.value = cleanUrl;
        if (keyInputEl && cleanKey) keyInputEl.value = cleanKey;

        await this.saveBulk({
          supabase_enabled: enabled,
          supabase_url: cleanUrl,
          supabase_anon_key: cleanKey,
          supabase_outlet_name: outlet
        }, 'Supabase metrics settings saved!');

        // Update status badge
        const badge = document.getElementById('badge-supabase-status');
        if (badge) {
          const active = enabled === '1' && cleanUrl;
          badge.style.background = active ? 'rgba(34,197,94,0.15)' : 'var(--bg-tertiary)';
          badge.style.color = active ? 'var(--color-success)' : 'var(--text-muted)';
          badge.style.border = `1px solid ${active ? 'rgba(34,197,94,0.3)' : 'var(--border-color)'}`;
          badge.textContent = active ? '● Live Sync Active' : '○ Cloud Sync Disabled';
        }

        // Send a test heartbeat
        if (enabled === '1' && window.SupabaseSync?.sendHeartbeat) {
          window.SupabaseSync.sendHeartbeat();
        }
      };
    }

    // Historical Backfill Sync Button
    const syncPastBtn = document.getElementById('btn-sync-past-orders');
    const pastProgress = document.getElementById('past-sync-progress');
    const pastBar = document.getElementById('past-sync-bar');
    const pastLabel = document.getElementById('past-sync-label');
    const pastPercent = document.getElementById('past-sync-percent');

    if (syncPastBtn) {
      syncPastBtn.onclick = async () => {
        if (!confirm('This will upload your previous local orders to Supabase for historical charts. Proceed?')) {
          return;
        }

        syncPastBtn.disabled = true;
        if (pastProgress) pastProgress.style.display = 'block';

        try {
          const result = await window.SupabaseSync.syncAllPastOrders((synced, total) => {
            const pct = Math.round((synced / total) * 100);
            if (pastBar) pastBar.style.width = `${pct}%`;
            if (pastLabel) pastLabel.textContent = `Uploaded ${synced} of ${total} orders...`;
            if (pastPercent) pastPercent.textContent = `${pct}%`;
          });

          window.App.showToast(`Successfully uploaded ${result.synced} past orders to Supabase!`, 'success', 5000);
          if (pastLabel) pastLabel.textContent = `Completed! ${result.synced} orders uploaded.`;
        } catch (err) {
          console.error('[SupabaseSync] Past sync failed:', err);
          window.App.showToast(`Upload failed: ${err.message}`, 'error', 6000);
          if (pastLabel) pastLabel.textContent = `Failed: ${err.message}`;
        } finally {
          syncPastBtn.disabled = false;
        }
      };
    }

    document.getElementById('btn-lock-metrics')?.addEventListener('click', () => {
      this.unlockedTabs['metrics'] = false;
      this.activeTab = 'restaurant';
      this.syncTabButtons();
      this.render();
      window.App.showToast('🔒 Cloud Metrics locked', 'info');
    });
  },

  async saveBulk(settingsObj, customToast = 'Settings saved successfully!') {
    try {
      if (settingsObj.theme) {
        window.App.setTheme(settingsObj.theme, false);
      }
      const res = await window.api.settings.updateBulk(settingsObj);
      const data = (res && res.data && res.data.data) ? res.data.data : (res?.data || res);
      if (res.success && data) {
        this.settings = data;
        window.App.settings = data;
        if (customToast) {
          window.App.showToast(customToast, 'success');
        }
      } else {
        window.App.showToast(res?.error || 'Failed to save settings', 'error');
      }
    } catch (err) {
      window.App.showToast(err.message, 'error');
    }
  }
};
