/**
 * RestoBill - Customer Management Controller
 * Handles customer directory, search & filtering, adding/editing customers, and quick POS billing
 */

window.CustomersUI = {
  customers: [],
  searchQuery: '',

  async load() {
    this.setupEventListeners();
    await this.fetchCustomers();
  },

  setupEventListeners() {
    const searchInput = document.getElementById('customers-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderTable();
      });
    }

    const addBtn = document.getElementById('btn-add-customer');
    if (addBtn) {
      addBtn.onclick = () => this.openAddCustomerModal();
    }

    const exportBtn = document.getElementById('btn-export-customers');
    if (exportBtn) {
      exportBtn.onclick = () => this.exportCustomers();
    }
  },

  async fetchCustomers() {
    const tbody = document.getElementById('customers-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 40px; text-align: center;">
            <div class="loading-overlay"><div class="spinner"></div> Loading customer directory...</div>
          </td>
        </tr>
      `;
    }

    try {
      const res = await window.api.customers.getAll();
      if (res.success && res.data) {
        this.customers = res.data;
        this.updateStats();
        this.renderTable();
      } else {
        window.App.showToast(res.error || 'Failed to load customers', 'error');
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
      window.App.showToast(err.message, 'error');
    }
  },

  updateStats() {
    const totalEl = document.getElementById('stats-total-customers');
    const phoneEl = document.getElementById('stats-with-phone');
    const gstinEl = document.getElementById('stats-with-gstin');

    const total = this.customers.length;
    const withPhone = this.customers.filter(c => c.phone && c.phone.trim().length > 0).length;
    const withGstin = this.customers.filter(c => c.gstin && c.gstin.trim().length > 0).length;

    if (totalEl) totalEl.textContent = total;
    if (phoneEl) phoneEl.textContent = withPhone;
    if (gstinEl) gstinEl.textContent = withGstin;
  },

  renderTable() {
    const tbody = document.getElementById('customers-tbody');
    if (!tbody) return;

    let filtered = this.customers;
    if (this.searchQuery) {
      const q = this.searchQuery;
      filtered = this.customers.filter(c => {
        return (c.name && c.name.toLowerCase().includes(q)) ||
               (c.phone && c.phone.includes(q)) ||
               (c.gstin && c.gstin.toLowerCase().includes(q)) ||
               (c.email && c.email.toLowerCase().includes(q)) ||
               (c.address && c.address.toLowerCase().includes(q));
      });
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 40px; text-align: center;">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="margin-bottom:12px;opacity:0.5;">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
              </svg>
              <p style="font-weight:600;font-size:15px;color:var(--text-secondary);margin-bottom:6px;">No customers found</p>
              <span style="font-size:13px;color:var(--text-muted);display:block;margin-bottom:14px;">${this.searchQuery ? 'No customer matches your search query' : 'Your customer list is currently empty'}</span>
              <button class="btn btn-primary btn-sm" onclick="window.CustomersUI.openAddCustomerModal()">+ Add New Customer</button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(cust => {
      const initial = (cust.name || 'C')[0].toUpperCase();
      const hasGstin = cust.gstin && cust.gstin.trim().length > 0;

      return `
        <tr data-id="${cust.id}">
          <td>
            <div class="customer-avatar-cell">
              <div class="customer-avatar">${initial}</div>
              <div>
                <div class="customer-details-name">${this.escapeHtml(cust.name)}</div>
                ${cust.created_at ? `<small style="color:var(--text-muted);font-size:11px;">Added ${new Date(cust.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</small>` : ''}
              </div>
            </div>
          </td>
          <td>
            ${cust.phone ? `<span style="font-family:monospace;font-weight:600;color:var(--text-primary);">${this.escapeHtml(cust.phone)}</span>` : '<span style="color:var(--text-muted);font-size:12px;">—</span>'}
          </td>
          <td>
            ${cust.email ? `<span style="color:var(--text-secondary);font-size:12px;">${this.escapeHtml(cust.email)}</span>` : '<span style="color:var(--text-muted);font-size:12px;">—</span>'}
          </td>
          <td>
            ${hasGstin ? `<span class="cust-badge-gstin">${this.escapeHtml(cust.gstin)}</span>` : '<span style="color:var(--text-muted);font-size:12px;">Consumer</span>'}
          </td>
          <td>
            ${cust.address ? `<span style="color:var(--text-secondary);font-size:12px;">${this.escapeHtml(cust.address)}</span>` : '<span style="color:var(--text-muted);font-size:12px;">—</span>'}
          </td>
          <td>
            <div class="customer-action-btns">
              <button class="btn btn-outline btn-sm btn-start-bill" data-id="${cust.id}" title="Start Bill for this customer" style="padding: 4px 8px; font-size: 11px;">
                <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13" style="margin-right:2px;"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>
                Bill
              </button>
              <button class="action-btn btn-edit-customer" data-id="${cust.id}" title="Edit Customer Details">
                <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
              </button>
              <button class="action-btn action-delete btn-delete-customer" data-id="${cust.id}" data-name="${this.escapeHtml(cust.name)}" title="Delete Customer">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row events
    tbody.querySelectorAll('.btn-start-bill').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const cust = this.customers.find(c => c.id === id);
        if (cust) this.startBill(cust);
      };
    });

    tbody.querySelectorAll('.btn-edit-customer').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const cust = this.customers.find(c => c.id === id);
        if (cust) this.openEditCustomerModal(cust);
      };
    });

    tbody.querySelectorAll('.btn-delete-customer').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const name = btn.getAttribute('data-name');
        this.confirmDeleteCustomer(id, name);
      };
    });
  },

  startBill(customer) {
    window.App.navigate('pos');
    if (window.POS?.selectCustomer) {
      window.POS.selectCustomer(customer);
    }
    const searchInput = document.getElementById('pos-search');
    if (searchInput) searchInput.focus();
  },

  openAddCustomerModal(initialName = '', initialPhone = '') {
    window.App.showModal({
      title: 'Add New Customer',
      bodyHtml: `
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" id="modal-cust-name" value="${this.escapeHtml(initialName)}" placeholder="e.g. Rahul Sharma" required autofocus>
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="text" id="modal-cust-phone" value="${this.escapeHtml(initialPhone)}" placeholder="10-digit Mobile Number" maxlength="15">
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="modal-cust-email" placeholder="customer@example.com">
        </div>
        <div class="form-group">
          <label>GSTIN (Optional - for B2B Invoices)</label>
          <input type="text" id="modal-cust-gstin" placeholder="15-digit GSTIN, e.g. 07AAAAA0000A1Z5" maxlength="15" style="text-transform:uppercase;">
        </div>
        <div class="form-group">
          <label>Billing / Delivery Address</label>
          <textarea id="modal-cust-address" rows="2" placeholder="Address, City, State, PIN"></textarea>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Save Customer',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const name = (document.getElementById('modal-cust-name')?.value || '').trim();
            const phone = (document.getElementById('modal-cust-phone')?.value || '').trim();
            const email = (document.getElementById('modal-cust-email')?.value || '').trim();
            const gstin = (document.getElementById('modal-cust-gstin')?.value || '').trim().toUpperCase();
            const address = (document.getElementById('modal-cust-address')?.value || '').trim();

            if (!name) {
              window.App.showToast('Customer name is required', 'warning');
              return;
            }

            try {
              const res = await window.api.customers.add({ name, phone, email, gstin, address });
              if (res.success && res.data) {
                window.App.closeModal();
                window.App.showToast(`Customer "${name}" added to list!`, 'success');

                // Refresh this list
                await this.fetchCustomers();

                // If POS is available, refresh POS customer list and select
                if (window.POS) {
                  await window.POS.loadCustomers();
                  window.POS.selectCustomer(res.data);
                }
              } else {
                window.App.showToast(res.error || 'Failed to add customer', 'error');
              }
            } catch (err) {
              console.error('Error adding customer:', err);
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  openEditCustomerModal(customer) {
    window.App.showModal({
      title: 'Edit Customer Details',
      bodyHtml: `
        <div class="form-group">
          <label>Customer Name *</label>
          <input type="text" id="modal-edit-cust-name" value="${this.escapeHtml(customer.name)}" required autofocus>
        </div>
        <div class="form-group">
          <label>Phone Number</label>
          <input type="text" id="modal-edit-cust-phone" value="${this.escapeHtml(customer.phone || '')}" placeholder="10-digit Mobile Number" maxlength="15">
        </div>
        <div class="form-group">
          <label>Email Address</label>
          <input type="email" id="modal-edit-cust-email" value="${this.escapeHtml(customer.email || '')}" placeholder="customer@example.com">
        </div>
        <div class="form-group">
          <label>GSTIN</label>
          <input type="text" id="modal-edit-cust-gstin" value="${this.escapeHtml(customer.gstin || '')}" placeholder="15-digit GSTIN" maxlength="15" style="text-transform:uppercase;">
        </div>
        <div class="form-group">
          <label>Address</label>
          <textarea id="modal-edit-cust-address" rows="2">${this.escapeHtml(customer.address || '')}</textarea>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Update Customer',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const name = (document.getElementById('modal-edit-cust-name')?.value || '').trim();
            const phone = (document.getElementById('modal-edit-cust-phone')?.value || '').trim();
            const email = (document.getElementById('modal-edit-cust-email')?.value || '').trim();
            const gstin = (document.getElementById('modal-edit-cust-gstin')?.value || '').trim().toUpperCase();
            const address = (document.getElementById('modal-edit-cust-address')?.value || '').trim();

            if (!name) {
              window.App.showToast('Customer name is required', 'warning');
              return;
            }

            try {
              const res = await window.api.customers.update(customer.id, { name, phone, email, gstin, address });
              if (res.success) {
                window.App.closeModal();
                window.App.showToast(`Customer "${name}" updated!`, 'success');
                await this.fetchCustomers();

                if (window.POS) {
                  await window.POS.loadCustomers();
                  if (window.POS.customerId === customer.id) {
                    window.POS.selectCustomer(res.data || { ...customer, name, phone, email, gstin, address });
                  }
                }
              } else {
                window.App.showToast(res.error || 'Failed to update customer', 'error');
              }
            } catch (err) {
              console.error('Error updating customer:', err);
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  confirmDeleteCustomer(id, name) {
    window.App.showModal({
      title: 'Delete Customer',
      bodyHtml: `
        <div style="padding:10px 0;">
          <p style="color:var(--text-primary);margin-bottom:8px;">Are you sure you want to delete <strong>${this.escapeHtml(name)}</strong> from the customer list?</p>
          <p style="color:var(--text-muted);font-size:12px;">Note: Past invoices and orders associated with this customer will remain intact in order history.</p>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Delete Customer',
          className: 'btn btn-danger btn-sm',
          onClick: async () => {
            try {
              const res = await window.api.customers.delete(id);
              if (res.success) {
                window.App.closeModal();
                window.App.showToast(`Customer "${name}" deleted`, 'info');
                await this.fetchCustomers();

                if (window.POS) {
                  await window.POS.loadCustomers();
                  if (window.POS.customerId === id) {
                    window.POS.customerId = null;
                  }
                }
              } else {
                window.App.showToast(res.error || 'Failed to delete customer', 'error');
              }
            } catch (err) {
              console.error('Error deleting customer:', err);
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  async exportCustomers() {
    if (!this.customers || this.customers.length === 0) {
      window.App.showToast('No customers to export', 'warning');
      return;
    }
    const headers = ['Name', 'Phone', 'Email', 'GSTIN', 'Address', 'Total Visits', 'Total Spend'];
    const escapeCsv = (s) => `"${String(s === null || s === undefined ? '' : s).replace(/"/g, '""')}"`;
    const rows = this.customers.map(c => [
      escapeCsv(c.name),
      escapeCsv(c.phone),
      escapeCsv(c.email),
      escapeCsv(c.gstin),
      escapeCsv(c.address),
      c.total_visits || 0,
      c.total_spend || 0
    ].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    await window.App.exportDataWithEmail({
      type: 'customers',
      csvContent,
      title: 'Customer Directory',
      count: this.customers.length
    });
  }
};
