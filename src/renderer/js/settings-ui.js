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
    container.innerHTML = `
      <div class="settings-section">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:6px;">Google Drive Cloud Backup</h3>
        <p style="color:var(--text-muted);font-size:13px;margin-bottom:20px;">
          Automatically or manually backup your restaurant database (menu, orders, customers) to Google Drive.
        </p>

        <div id="backup-status-container" style="padding:16px;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-color);margin-bottom:24px;">
          <div class="loading-overlay"><div class="spinner"></div> Checking Google Drive connection...</div>
        </div>

        <div style="display:flex;gap:10px;margin-bottom:24px;">
          <button class="btn btn-primary btn-sm" id="btn-trigger-backup">
            ☁️ Backup Now
          </button>
          <button class="btn btn-outline btn-sm" id="btn-refresh-backups">
            🔄 Refresh Backups
          </button>
        </div>

        <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">Available Backups</h4>
        <div id="backups-list-container">
          <p style="color:var(--text-muted);font-size:13px;">Loading backup history...</p>
        </div>
      </div>
    `;

    // Check status
    try {
      const statusRes = await window.api.gdrive.getStatus();
      const statusBox = document.getElementById('backup-status-container');
      const isConnected = statusRes?.success && statusRes.data?.connected;

      if (statusBox) {
        if (isConnected) {
          statusBox.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:24px;">🟢</span>
                <div>
                  <strong style="color:var(--color-success);">Connected to Google Drive</strong>
                  <p style="font-size:12px;color:var(--text-muted);">Account: ${statusRes.data.email || 'Authorized'}</p>
                </div>
              </div>
              <button class="btn btn-outline btn-sm btn-danger" id="btn-disconnect-gdrive">Disconnect</button>
            </div>
          `;

          document.getElementById('btn-disconnect-gdrive')?.addEventListener('click', async () => {
            await window.api.gdrive.disconnect();
            window.App.showToast('Google Drive disconnected', 'info');
            this.render();
          });
        } else {
          statusBox.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:24px;">⚪</span>
                <div>
                  <strong>Not Connected to Google Drive</strong>
                  <p style="font-size:12px;color:var(--text-muted);">Connect your Google account to enable 1-click cloud backups.</p>
                </div>
              </div>
              <button class="btn btn-primary btn-sm" id="btn-connect-gdrive">Connect Google Drive</button>
            </div>
          `;

          document.getElementById('btn-connect-gdrive')?.addEventListener('click', async () => {
            try {
              const urlRes = await window.api.gdrive.getAuthUrl();
              if (urlRes.success && urlRes.data) {
                window.api.app.openExternal(urlRes.data);
                this.promptAuthCode();
              } else {
                window.App.showToast(urlRes.error || 'Google Drive client credentials not configured', 'warning');
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
        window.App.showToast('Creating database backup...', 'info');
        const res = await window.api.gdrive.backup();
        if (res.success) {
          window.App.showToast('Database backed up to Google Drive successfully!', 'success');
          this.loadBackupsList();
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
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${b.name}</div>
              <div style="font-size:11px;color:var(--text-muted);">${window.App.formatDateTime(b.createdTime || b.created_at)}</div>
            </div>
            <button class="btn btn-outline btn-sm btn-restore-backup" data-id="${b.id}">
              Restore
            </button>
          </div>
        `).join('');

        listContainer.querySelectorAll('.btn-restore-backup').forEach(btn => {
          btn.onclick = async () => {
            const fileId = btn.getAttribute('data-id');
            if (confirm('Warning: Restoring will overwrite the current database. Proceed?')) {
              try {
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
        listContainer.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No backups found on Google Drive yet.</p>`;
      }
    } catch (e) {
      listContainer.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">Connect Google Drive to see backup history.</p>`;
    }
  },

  promptAuthCode() {
    window.App.showModal({
      title: 'Google Drive Authorization',
      bodyHtml: `
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
          A browser window has opened for Google sign-in. Please sign in, allow access, and paste the authorization code below:
        </p>
        <div class="form-group">
          <label>Authorization Code</label>
          <input type="text" id="modal-gdrive-code" placeholder="Paste code here" autofocus>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Verify & Connect',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const code = document.getElementById('modal-gdrive-code')?.value.trim();
            if (!code) {
              window.App.showToast('Please paste the authorization code', 'warning');
              return;
            }
            try {
              const res = await window.api.gdrive.authenticate(code);
              if (res.success) {
                window.App.showToast('Google Drive connected successfully!', 'success');
                window.App.closeModal();
                this.render();
              } else {
                window.App.showToast(res.error || 'Authentication failed', 'error');
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
