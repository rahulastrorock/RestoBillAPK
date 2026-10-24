/**
 * RestoBill - Settings Controller
 * Handles restaurant details, billing preferences, thermal printer setup, and Google Drive backup
 */

window.SettingsUI = {
  activeTab: 'restaurant',
  settings: {},

  async load() {
    this.setupEventListeners();
    await this.fetchSettings();
    this.render();
  },

  setupEventListeners() {
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = tab.getAttribute('data-settings-tab') || 'restaurant';
        this.render();
      };
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

    if (this.activeTab === 'restaurant') {
      this.renderRestaurantTab(container);
    } else if (this.activeTab === 'billing') {
      this.renderBillingTab(container);
    } else if (this.activeTab === 'printer') {
      this.renderPrinterTab(container);
    } else if (this.activeTab === 'backup') {
      this.renderBackupTab(container);
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

              <!-- Mobile Bluetooth Thermal Printer Setup Card -->
              <div class="printer-card" style="background: rgba(249, 115, 22, 0.06); border-color: rgba(249, 115, 22, 0.3);">
                <div class="printer-card-header">
                  <div class="printer-card-title">
                    <span>📱</span>
                    <span>Using Bluetooth Thermal Printer with Mobile</span>
                  </div>
                  <span class="printer-card-badge" style="background: rgba(34, 197, 94, 0.15); color: #22c55e;">Bluetooth Ready</span>
                </div>
                <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; padding: 4px 0;">
                  <p style="margin-bottom: 8px; font-weight: 600; color: var(--text-primary);">
                    Yes! Bluetooth thermal printers work seamlessly with RestoBill on your mobile phone.
                  </p>
                  <ol style="padding-left: 20px; margin: 0 0 10px 0;">
                    <li style="margin-bottom: 5px;">
                      <b>Pair with Phone:</b> Turn on your Bluetooth thermal printer, open your phone's <b>Settings &rarr; Bluetooth</b>, and pair with your printer (default PIN is usually <code>0000</code> or <code>1234</code>).
                    </li>
                    <li style="margin-bottom: 5px;">
                      <b>Print Service (Recommended):</b> Install <b>RawBT Print Service</b> (free on Google Play Store). Open it once and select your paired Bluetooth printer. This adds a direct ESC/POS print driver to Android.
                    </li>
                    <li>
                      <b>Ready to Print:</b> When you tap <b>"Save & Print"</b> in Billing or <b>"Test Print"</b> above, RestoBill sends the formatted 58mm/80mm receipt with logo, GST, and QR code directly to your printer!
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
                      <option value="1" ${s.silent_print !== '0' ? 'selected' : ''}>Direct Silent Print (Instant)</option>
                      <option value="0" ${s.silent_print === '0' ? 'selected' : ''}>Show Windows Print Dialog</option>
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
                  </div>
                  <span id="preview-width-badge" style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;background:var(--accent-primary-glow);color:var(--accent-primary);">
                    ${s.printer_width === '58' ? '58mm' : '80mm'}
                  </span>
                </div>

                <div class="printer-preview-paper-card ${s.printer_width === '58' ? 'width-58' : 'width-80'}" id="preview-paper-box">
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

    // Sample order used for live preview and test prints
    const sampleOrder = {
      order_no: 'INV-2026-0042',
      order_type: 'dine_in',
      table_no: 'T-04',
      user_name: 'Rahul (Cashier)',
      customer_name: 'Vikram Sharma',
      customer_phone: '9876543210',
      customer_gstin: '07AAAAA0000A1Z5',
      created_at: new Date().toISOString(),
      items: [
        { name: 'Paneer Butter Masala', quantity: 1, price: 280, total: 280, gst_rate: 5, hsn_code: '996331' },
        { name: 'Butter Garlic Naan', quantity: 3, price: 50, total: 150, gst_rate: 5, hsn_code: '996331' },
        { name: 'Jeera Rice', quantity: 1, price: 160, total: 160, gst_rate: 5, hsn_code: '996331' }
      ],
      subtotal: 590,
      discount_type: 'percent',
      discount_value: 10,
      discount_amount: 59,
      taxable_amount: 505.71,
      cgst: 12.64,
      sgst: 12.64,
      round_off: -0.28,
      total: 531,
      payment_mode: 'upi',
      payment_details: 'GPay Ref #4029184',
      notes: 'Extra spicy, serve hot'
    };

    // Helper: Collect current form values
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

    // Helper: Update live preview iframe
    const updatePreview = async () => {
      const previewFrame = document.getElementById('printer-live-preview-frame');
      const paperBox = document.getElementById('preview-paper-box');
      const widthBadge = document.getElementById('preview-width-badge');
      if (!previewFrame) return;

      const currentS = getFormSettings();

      if (paperBox) {
        if (currentS.printer_width === '58') {
          paperBox.className = 'printer-preview-paper-card width-58';
        } else {
          paperBox.className = 'printer-preview-paper-card width-80';
        }
      }
      if (widthBadge) {
        widthBadge.textContent = currentS.printer_type === 'standard' ? 'A4 Invoice' : (currentS.printer_width === '58' ? '58mm' : '80mm');
      }

      try {
        const previewType = currentS.printer_type === 'standard' ? 'invoice' : 'receipt';
        const res = await window.api.print.getPreview(sampleOrder, currentS, previewType);
        const html = (res && typeof res === 'object' && res.data) ? res.data : (typeof res === 'string' ? res : '');
        previewFrame.srcdoc = html;
      } catch (err) {
        console.error('Failed to render live preview:', err);
      }
    };

    // Initial preview render
    await updatePreview();

    // Re-render preview on any form input/change
    const form = document.getElementById('settings-printer-form');
    if (form) {
      form.addEventListener('input', () => updatePreview());
      form.addEventListener('change', () => updatePreview());

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = getFormSettings();
        await this.saveBulk(data);
      });
    }

    // Top action buttons
    document.getElementById('btn-top-save-printer')?.addEventListener('click', () => {
      form?.requestSubmit();
    });

    const triggerTestPrint = async () => {
      const currentS = getFormSettings();
      try {
        window.App.showToast('Sending test receipt to printer...', 'info');
        if (currentS.printer_type === 'standard') {
          await window.api.print.invoice(sampleOrder, currentS);
        } else {
          await window.api.print.receipt(sampleOrder, currentS);
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

        <h3 style="font-size:17px;font-weight:700;margin-bottom:4px;">Google Drive Cloud Backup</h3>
        <p style="color:var(--text-muted);font-size:12px;margin-bottom:16px;">
          Automatically or manually backup your restaurant database (menu, orders, customers) to Google Drive.
        </p>

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
