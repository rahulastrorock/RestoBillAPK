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

  renderPrinterTab(container) {
    const s = this.settings;
    container.innerHTML = `
      <div class="settings-section">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:6px;">Thermal Printer Setup</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">
          Configure ESC/POS thermal receipt printer options, paper width, and footer text.
        </p>

        <form id="settings-printer-form">
          <div class="modal-body" style="padding:0;overflow:visible;">
            <div class="form-row">
              <div class="form-group">
                <label>Printer Type</label>
                <select name="printer_type">
                  <option value="thermal" ${s.printer_type === 'thermal' ? 'selected' : ''}>ESC/POS Thermal Printer</option>
                  <option value="standard" ${s.printer_type === 'standard' ? 'selected' : ''}>Standard A4/A5 Laser/Inkjet</option>
                </select>
              </div>
              <div class="form-group">
                <label>Paper Width</label>
                <select name="printer_width">
                  <option value="80" ${s.printer_width === '80' ? 'selected' : ''}>80mm (Standard POS)</option>
                  <option value="58" ${s.printer_width === '58' ? 'selected' : ''}>58mm (Compact Mobile/Desktop)</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label>Receipt Footer Note</label>
              <input type="text" name="footer_text" value="${s.footer_text || 'Thank you! Visit again!'}" placeholder="e.g. Thank you for dining with us!">
            </div>

            <div class="form-group">
              <label>HSN / SAC on Thermal Receipt</label>
              <select name="show_hsn">
                <option value="1" ${s.show_hsn === '1' ? 'selected' : ''}>Show HSN/SAC code</option>
                <option value="0" ${s.show_hsn === '0' ? 'selected' : ''}>Hide HSN/SAC code</option>
              </select>
            </div>
          </div>

          <div style="margin-top:24px;display:flex;justify-content:space-between;align-items:center;">
            <button type="button" class="btn btn-outline" id="btn-test-print">🖨️ Test Print Receipt</button>
            <button type="submit" class="btn btn-primary">Save Printer Settings</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('settings-printer-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      this.saveBulk(data);
    });

    document.getElementById('btn-test-print')?.addEventListener('click', async () => {
      const sampleOrder = {
        order_no: 'INV-TEST-000001',
        order_type: 'dine_in',
        table_no: '1',
        customer_name: 'Test Customer',
        created_at: new Date().toISOString(),
        items: [
          { name: 'Paneer Butter Masala', quantity: 1, price: 260, total: 260 },
          { name: 'Butter Naan', quantity: 2, price: 45, total: 90 }
        ],
        subtotal: 350,
        discount_amount: 0,
        cgst: 8.75,
        sgst: 8.75,
        total: 350,
        payment_mode: 'cash'
      };

      try {
        await window.api.print.receipt(sampleOrder, this.settings);
        window.App.showToast('Test receipt sent to printer', 'success');
      } catch (err) {
        window.App.showToast('Test print failed: ' + err.message, 'error');
      }
    });
  },

  async renderBackupTab(container) {
    const s = this.settings;
    container.innerHTML = `
      <div class="settings-section">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:6px;">Google Drive Cloud Backup</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">
          Automatically or manually backup your restaurant database (menu, orders, customers) to Google Drive.
        </p>

        <div id="backup-status-container" style="padding:16px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);margin-bottom:20px;">
          <div class="loading-overlay"><div class="spinner"></div> Checking Google Drive connection...</div>
        </div>

        <!-- Automatic Backup Schedule Card -->
        <div style="background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);padding:20px;margin-bottom:24px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
            <div>
              <h4 style="font-size:15px;font-weight:700;margin:0 0 4px 0;display:flex;align-items:center;gap:8px;">
                <span>⏰</span> Automatic Backup Schedule
              </h4>
              <p style="font-size:12px;color:var(--text-muted);margin:0;">
                Keep your restaurant data safe without manual effort. Runs in the background and uploads snapshots to Google Drive.
              </p>
            </div>
            <span style="display:inline-flex;align-items:center;padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${s.backup_enabled === '1' ? 'rgba(34,197,94,0.15)' : 'var(--bg-tertiary)'};color:${s.backup_enabled === '1' ? 'var(--color-success)' : 'var(--text-muted)'};border:1px solid ${s.backup_enabled === '1' ? 'rgba(34,197,94,0.3)' : 'var(--border-color)'};">
              ${s.backup_enabled === '1' ? '● Auto-Backup Active' : '○ Auto-Backup Disabled'}
            </span>
          </div>

          <form id="settings-auto-backup-form">
            <div class="form-row">
              <div class="form-group">
                <label>Auto-Backup Status</label>
                <select name="backup_enabled" id="select-backup-enabled">
                  <option value="1" ${s.backup_enabled === '1' ? 'selected' : ''}>✅ Enabled (Automated Cloud Sync)</option>
                  <option value="0" ${s.backup_enabled !== '1' ? 'selected' : ''}>⛔ Disabled (Manual Backup Only)</option>
                </select>
              </div>

              <div class="form-group">
                <label>Backup Frequency</label>
                <select name="backup_frequency" id="select-backup-frequency">
                  <option value="daily" ${s.backup_frequency === 'daily' || !s.backup_frequency ? 'selected' : ''}>Daily (Recommended at End of Day)</option>
                  <option value="every_4_hours" ${s.backup_frequency === 'every_4_hours' ? 'selected' : ''}>Every 4 Hours (Best for busy restaurants)</option>
                  <option value="every_12_hours" ${s.backup_frequency === 'every_12_hours' ? 'selected' : ''}>Every 12 Hours (Twice daily)</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group" id="group-backup-time">
                <label>Daily Auto-Backup Time</label>
                <input type="time" name="backup_time" value="${s.backup_time || '23:00'}">
                <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:4px;">
                  Suggested: 11:00 PM (23:00) or when closing your cash register.
                </span>
              </div>

              <div class="form-group">
                <label>Backup on Application Exit</label>
                <select name="backup_on_exit">
                  <option value="1" ${s.backup_on_exit !== '0' ? 'selected' : ''}>Yes, backup when RestoBill is closed (Recommended)</option>
                  <option value="0" ${s.backup_on_exit === '0' ? 'selected' : ''}>No, skip backup on close</option>
                </select>
                <span style="font-size:11px;color:var(--text-muted);display:block;margin-top:4px;">
                  Automatically saves a fresh snapshot when shutting down RestoBill at night.
                </span>
              </div>
            </div>

            <div style="display:flex;justify-content:flex-end;margin-top:16px;">
              <button type="submit" class="btn btn-primary btn-sm">💾 Save Backup Schedule</button>
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
      await this.saveBulk(data);
      if (window.api.gdrive.updateSchedule) {
        await window.api.gdrive.updateSchedule();
      }
      window.App.showToast('Automatic backup schedule saved successfully!', 'success');
      this.render();
    });

    // Check status
    try {
      const statusRes = await window.api.gdrive.getStatus();
      const statusBox = document.getElementById('backup-status-container');
      const isConnected = statusRes?.success && (statusRes.data?.connected || statusRes.data?.authenticated);

      if (statusBox) {
        if (isConnected) {
          const email = statusRes.data?.email || 'Authorized Google Account';
          const lastBackup = statusRes.data?.lastBackup;
          const lastBackupText = lastBackup?.lastBackup
            ? window.App.formatDateTime(lastBackup.lastBackup)
            : 'None yet';

          statusBox.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
              <div style="display:flex;align-items:center;gap:14px;">
                <div style="width:42px;height:42px;border-radius:50%;background:rgba(34,197,94,0.15);display:flex;align-items:center;justify-content:center;font-size:22px;">
                  🟢
                </div>
                <div>
                  <div style="font-weight:700;color:var(--color-success);font-size:15px;">Connected to Google Drive</div>
                  <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Account: <b>${email}</b></div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Target Folder: <code>RestoBill_Backups</code> &bull; Last Backup: <b>${lastBackupText}</b></div>
                </div>
              </div>
              <button class="btn btn-outline btn-sm btn-danger" id="btn-disconnect-gdrive">Disconnect</button>
            </div>
          `;

          document.getElementById('btn-disconnect-gdrive')?.addEventListener('click', async () => {
            if (confirm('Are you sure you want to disconnect Google Drive?')) {
              await window.api.gdrive.disconnect();
              window.App.showToast('Google Drive disconnected', 'info');
              this.render();
            }
          });
        } else {
          const hasCreds = statusRes?.data?.hasCredentials;
          statusBox.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
              <div style="display:flex;align-items:center;gap:14px;">
                <div style="width:42px;height:42px;border-radius:50%;background:rgba(99,102,241,0.12);display:flex;align-items:center;justify-content:center;font-size:22px;">
                  ☁️
                </div>
                <div>
                  <div style="font-weight:700;font-size:15px;">Not Connected to Google Drive</div>
                  <p style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                    ${hasCreds ? 'OAuth credentials found! Click Connect to authorize your Google Drive.' : 'Credentials not detected. Place credentials.json in app directory.'}
                  </p>
                </div>
              </div>
              <button class="btn btn-primary btn-sm" id="btn-connect-gdrive">Connect Google Drive</button>
            </div>
          `;

          document.getElementById('btn-connect-gdrive')?.addEventListener('click', async () => {
            try {
              window.App.showToast('Opening Google authorization in your browser...', 'info');
              const urlRes = await window.api.gdrive.getAuthUrl();
              if (urlRes.success && urlRes.data) {
                window.api.app.openExternal(urlRes.data);
                this.promptAuthCode();
              } else {
                window.App.showToast(urlRes.error || 'Google Drive client credentials not found', 'warning');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          });
        }
      }
    } catch (e) {
      console.error(e);
    }

    // Backup Now Button
    document.getElementById('btn-trigger-backup')?.addEventListener('click', async () => {
      try {
        window.App.showToast('Creating database backup to Google Drive...', 'info');
        const res = await window.api.gdrive.backup();
        if (res.success) {
          window.App.showToast('Database backed up to Google Drive successfully!', 'success');
          this.render();
        } else {
          window.App.showToast(res.error || 'Backup failed', 'error');
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
      if (res.success && res.data && res.data.length > 0) {
        listContainer.innerHTML = res.data.map(b => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-sm);margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:22px;">📁</span>
              <div>
                <div style="font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
                  <span>${b.name}</span>
                  <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,0.15);color:var(--color-success);font-weight:700;">LATEST</span>
                </div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                  ${window.App.formatDateTime(b.createdAt || b.createdTime || b.created_at)} &bull; Size: ${b.sizeFormatted || ''}
                </div>
              </div>
            </div>
            <button class="btn btn-outline btn-sm btn-restore-backup" data-id="${b.id}" style="color:var(--color-primary);border-color:var(--color-primary);">
              Restore
            </button>
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
                  window.App.showToast('Database restored! Please restart RestoBill.', 'success');
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

  promptAuthCode() {
    window.App.showModal({
      title: 'Google Drive Authorization',
      bodyHtml: `
        <div style="background:rgba(99, 102, 241, 0.1);border:1px solid rgba(99, 102, 241, 0.3);border-radius:8px;padding:14px;margin-bottom:16px;">
          <div style="font-weight:700;font-size:13px;color:var(--accent-light);margin-bottom:6px;">
            📌 Quick Steps to Authorize:
          </div>
          <ol style="font-size:12px;color:var(--text-secondary);margin:0;padding-left:18px;line-height:1.7;">
            <li>In the browser window that just opened, log in with your Google account and click <b>Continue / Allow</b>.</li>
            <li>Your browser will redirect to a page starting with <code>http://localhost/?code=...</code> (the page might say <i>"This site can't be reached"</i> – that is normal!).</li>
            <li>Copy the full address from the browser's address bar (or just the code), paste it below, and click <b>Verify & Connect</b>.</li>
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
              if (res.success) {
                window.App.showToast('Google Drive connected successfully!', 'success');
                window.App.closeModal();
                this.render();
              } else {
                window.App.showToast(res.error || 'Authentication failed. Please verify the code and try again.', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  async renderAboutTab(container) {
    let version = '1.0.0';
    let dbPath = 'Local SQLite Database';

    try {
      const verRes = await window.api.app.getVersion();
      if (verRes.success) version = verRes.data;

      const pathRes = await window.api.app.getDbPath();
      if (pathRes.success) dbPath = pathRes.data;
    } catch (e) {}

    container.innerHTML = `
      <div class="settings-section">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:6px;">About RestoBill</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:24px;">
          Modern, GST-Compliant Restaurant POS & Billing Software designed for Indian restaurants, cafes, and cloud kitchens.
        </p>

        <div style="background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:var(--radius-md);padding:20px;margin-bottom:24px;">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
            <div style="width:50px;height:50px;border-radius:12px;background:linear-gradient(135deg, #f97316, #ef4444);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:22px;">
              RB
            </div>
            <div>
              <h4 style="font-size:18px;font-weight:800;color:var(--text-primary);">RestoBill Desktop</h4>
              <p style="font-size:12px;color:var(--text-muted);">Version ${version} (Electron & SQLite)</p>
            </div>
          </div>

          <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
            <div><strong>Database:</strong> <code>${dbPath}</code></div>
            <div><strong>Engine:</strong> Electron + better-sqlite3 (High Performance)</div>
            <div><strong>Compliance:</strong> GST Act, GSTR-1 Tax Invoices, HSN/SAC Mapping</div>
            <div><strong>Printing:</strong> 80mm & 58mm Thermal Printers, A4 Tax Invoices</div>
          </div>
        </div>

        <div style="color:var(--text-muted);font-size:12px;line-height:1.6;">
          <p>RestoBill runs 100% offline with zero cloud subscription fees. Data is stored locally on your device with optional Google Drive backup.</p>
        </div>
      </div>
    `;
  },

  async saveBulk(settingsObj) {
    try {
      if (settingsObj.theme) {
        window.App.setTheme(settingsObj.theme, false);
      }
      const res = await window.api.settings.updateBulk(settingsObj);
      if (res.success && res.data) {
        this.settings = res.data;
        window.App.settings = res.data;
        window.App.showToast('Settings saved successfully!', 'success');
      } else {
        window.App.showToast(res.error || 'Failed to save settings', 'error');
      }
    } catch (err) {
      window.App.showToast(err.message, 'error');
    }
  }
};
