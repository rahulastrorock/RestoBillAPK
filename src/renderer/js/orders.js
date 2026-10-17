/**
 * RestoBill - Orders History Controller
 * Handles order search & filtering, order detail slide-in panel, re-printing, voiding, and CSV exports
 */

window.OrdersUI = {
  orders: [],
  filters: {
    startDate: '',
    endDate: '',
    status: '',
    phone: '',
    allDates: false,
    page: 1,
    limit: 50
  },

  async load() {
    this.setupDefaultDates();
    this.setupEventListeners();
    await this.fetchOrders();
  },

  setupDefaultDates() {
    const today = new Date().toISOString().slice(0, 10);
    const startInput = document.getElementById('orders-start-date');
    const endInput = document.getElementById('orders-end-date');

    if (startInput && !startInput.value) {
      startInput.value = today;
      this.filters.startDate = today;
    }
    if (endInput && !endInput.value) {
      endInput.value = today;
      this.filters.endDate = today;
    }
  },

  setupEventListeners() {
    // Phone search input (filters on keystroke debounce and Enter)
    const phoneInput = document.getElementById('orders-search-phone');
    if (phoneInput) {
      let debounceTimer;
      phoneInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.filters.phone = (e.target.value || '').trim();
          this.filters.page = 1;
          this.fetchOrders();
        }, 300);
      });

      phoneInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(debounceTimer);
          this.filters.phone = (e.target.value || '').trim();
          this.filters.page = 1;
          this.fetchOrders();
        }
      });
    }

    // All dates checkbox toggle
    const allDatesCheckbox = document.getElementById('orders-all-dates');
    const startInput = document.getElementById('orders-start-date');
    const endInput = document.getElementById('orders-end-date');
    if (allDatesCheckbox) {
      allDatesCheckbox.addEventListener('change', () => {
        this.filters.allDates = allDatesCheckbox.checked;
        if (startInput) startInput.disabled = this.filters.allDates;
        if (endInput) endInput.disabled = this.filters.allDates;
        this.filters.page = 1;
        this.fetchOrders();
      });
    }

    // Filter button
    const filterBtn = document.getElementById('btn-filter-orders');
    if (filterBtn) {
      filterBtn.onclick = () => {
        const start = document.getElementById('orders-start-date')?.value;
        const end = document.getElementById('orders-end-date')?.value;
        const status = document.getElementById('orders-status-filter')?.value;
        const phone = document.getElementById('orders-search-phone')?.value;

        this.filters.startDate = start || '';
        this.filters.endDate = end || '';
        this.filters.status = status || '';
        this.filters.phone = (phone || '').trim();
        this.filters.page = 1;
        this.fetchOrders();
      };
    }

    // Reset button
    const resetBtn = document.getElementById('btn-reset-orders');
    if (resetBtn) {
      resetBtn.onclick = () => {
        const today = new Date().toISOString().slice(0, 10);
        const phoneEl = document.getElementById('orders-search-phone');
        const startEl = document.getElementById('orders-start-date');
        const endEl = document.getElementById('orders-end-date');
        const statusEl = document.getElementById('orders-status-filter');
        const allDatesEl = document.getElementById('orders-all-dates');

        if (phoneEl) phoneEl.value = '';
        if (startEl) {
          startEl.value = today;
          startEl.disabled = false;
        }
        if (endEl) {
          endEl.value = today;
          endEl.disabled = false;
        }
        if (statusEl) statusEl.value = '';
        if (allDatesEl) allDatesEl.checked = false;

        this.filters = {
          startDate: today,
          endDate: today,
          status: '',
          phone: '',
          allDates: false,
          page: 1,
          limit: 50
        };
        this.fetchOrders();
      };
    }

    const exportBtn = document.getElementById('btn-export-orders');
    if (exportBtn) {
      exportBtn.onclick = () => this.exportCsv();
    }
  },

  async fetchOrders() {
    const tbody = document.getElementById('orders-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding:40px;">
            <div class="loading-overlay"><div class="spinner"></div> Loading orders...</div>
          </td>
        </tr>
      `;
    }

    try {
      const offset = (this.filters.page - 1) * this.filters.limit;
      const payload = {
        status: this.filters.status,
        phone: this.filters.phone,
        limit: this.filters.limit,
        offset: offset
      };

      if (!this.filters.allDates) {
        if (this.filters.startDate) payload.startDate = this.filters.startDate;
        if (this.filters.endDate) payload.endDate = this.filters.endDate;
      }

      const res = await window.api.orders.getAll(payload);

      if (res.success && res.data) {
        this.orders = res.data.orders || [];
        this.renderTable();
        this.renderPagination(res.data.total || 0);
      } else {
        window.App.showToast(res.error || 'Failed to load orders', 'error');
      }
    } catch (err) {
      console.error('Failed to load orders:', err);
      window.App.showToast(err.message, 'error');
    }
  },

  renderTable() {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;

    if (this.orders.length === 0) {
      const msg = this.filters.phone
        ? `No orders found matching phone "${window.App.escapeHtml(this.filters.phone)}".`
        : 'No orders found for the selected period.';
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding: 40px; color: var(--text-muted);">
            ${msg}
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.orders.map(order => {
      const typeIcons = {
        dine_in: '🍽️ Dine In',
        takeaway: '🥡 Takeaway',
        delivery: '🛵 Delivery'
      };

      const isVoided = order.status === 'voided';

      return `
        <tr style="${isVoided ? 'opacity:0.6;' : ''}">
          <td><strong>${order.order_no}</strong></td>
          <td>${window.App.formatDateTime(order.created_at)}</td>
          <td><span class="badge badge-manager">${typeIcons[order.order_type] || order.order_type}</span></td>
          <td>${order.table_no ? `Table ${order.table_no}` : '-'}</td>
          <td>
            <div style="font-weight:600; color:var(--text-primary);">${order.customer_name || 'Walk-in'}</div>
            ${order.customer_phone ? `<div style="font-size:11px; color:var(--accent-primary); font-family:monospace; margin-top:2px;">📞 ${order.customer_phone}</div>` : ''}
          </td>
          <td style="font-weight:700; color:${isVoided ? 'var(--text-muted)' : 'var(--accent-primary)'};">${window.App.formatCurrency(order.total)}</td>
          <td><span class="badge badge-cashier">${(order.payment_mode || 'cash').toUpperCase()}</span></td>
          <td>
            <span class="badge ${isVoided ? 'badge-voided' : 'badge-completed'}">
              ${isVoided ? 'Deleted' : 'Completed'}
            </span>
          </td>
          <td>
            <div class="action-btns">
              <button class="action-btn action-view btn-preview-order" data-id="${order.id}" title="Print Preview">
                <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
              </button>
              <button class="action-btn action-view btn-view-order" data-id="${order.id}" title="View Details">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
              </button>
              <button class="action-btn action-print btn-print-order" data-id="${order.id}" title="Print Receipt">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd"/></svg>
              </button>
              ${!isVoided ? `
                <button class="action-btn action-delete btn-void-order" data-id="${order.id}" data-no="${order.order_no}" title="Delete Order">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row button events
    tbody.querySelectorAll('.btn-preview-order').forEach(btn => {
      btn.onclick = async () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        await this.previewOrder(id);
      };
    });

    tbody.querySelectorAll('.btn-view-order').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        this.openOrderDetail(id);
      };
    });

    tbody.querySelectorAll('.btn-print-order').forEach(btn => {
      btn.onclick = async () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        await this.printOrderReceipt(id);
      };
    });

    tbody.querySelectorAll('.btn-void-order').forEach(btn => {
      btn.onclick = () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        const orderNo = btn.getAttribute('data-no');
        this.promptDeleteOrder(id, orderNo);
      };
    });
  },

  renderPagination(totalCount) {
    const container = document.getElementById('orders-pagination');
    if (!container) return;

    const totalPages = Math.ceil(totalCount / this.filters.limit) || 1;
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    if (this.filters.page > 1) {
      html += `<button class="btn btn-outline btn-sm" id="btn-page-prev">&laquo; Previous</button>`;
    }

    html += `<span style="color:var(--text-muted);font-size:12px;padding:0 8px;">Page ${this.filters.page} of ${totalPages} (${totalCount} orders)</span>`;

    if (this.filters.page < totalPages) {
      html += `<button class="btn btn-outline btn-sm" id="btn-page-next">Next &raquo;</button>`;
    }

    container.innerHTML = html;

    const prevBtn = document.getElementById('btn-page-prev');
    const nextBtn = document.getElementById('btn-page-next');

    if (prevBtn) {
      prevBtn.onclick = () => {
        this.filters.page -= 1;
        this.fetchOrders();
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        this.filters.page += 1;
        this.fetchOrders();
      };
    }
  },

  async openOrderDetail(orderId) {
    try {
      const res = await window.api.orders.getById(orderId);
      if (!res.success || !res.data) {
        window.App.showToast(res.error || 'Failed to load order detail', 'error');
        return;
      }

      const order = res.data;
      const isVoided = order.status === 'voided';

      const itemsHtml = (order.items || []).map(item => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-color);font-size:13px;">
          <div>
            <div style="font-weight:600;color:var(--text-primary);">${item.name}</div>
            <div style="font-size:11px;color:var(--text-muted);">${item.quantity} x ${window.App.formatCurrency(item.price)} (${item.gst_rate}% GST)</div>
          </div>
          <div style="font-weight:700;color:var(--text-primary);">${window.App.formatCurrency(item.total)}</div>
        </div>
      `).join('');

      const detailHtml = `
        <div class="detail-info-grid">
          <div class="detail-info-item">
            <span class="detail-info-label">Invoice Number</span>
            <div class="detail-info-value">${order.order_no}</div>
          </div>
          <div class="detail-info-item">
            <span class="detail-info-label">Date & Time</span>
            <div class="detail-info-value" style="font-size:12px;">${window.App.formatDateTime(order.created_at)}</div>
          </div>
          <div class="detail-info-item">
            <span class="detail-info-label">Order Type</span>
            <div class="detail-info-value" style="text-transform:capitalize;">${order.order_type.replace('_', ' ')} ${order.table_no ? `(Table ${order.table_no})` : ''}</div>
          </div>
          <div class="detail-info-item">
            <span class="detail-info-label">Cashier / Staff</span>
            <div class="detail-info-value">${order.user_name || 'Admin'}</div>
          </div>
          ${(order.customer_name || order.customer_phone) ? `
            <div class="detail-info-item">
              <span class="detail-info-label">Customer & Contact</span>
              <div class="detail-info-value">
                <div>${order.customer_name || 'Walk-in'}</div>
                ${order.customer_phone ? `<div style="font-size:12px;color:var(--accent-primary);margin-top:2px;">📞 ${order.customer_phone}</div>` : ''}
              </div>
            </div>
          ` : ''}
          ${order.customer_gstin ? `
            <div class="detail-info-item">
              <span class="detail-info-label">Customer GSTIN</span>
              <div class="detail-info-value"><code>${order.customer_gstin}</code></div>
            </div>
          ` : ''}
          <div class="detail-info-item">
            <span class="detail-info-label">Status</span>
            <div class="detail-info-value">
              <span class="badge ${isVoided ? 'badge-voided' : 'badge-completed'}">
                ${isVoided ? 'Deleted' : 'Completed'}
              </span>
            </div>
          </div>
          <div class="detail-info-item">
            <span class="detail-info-label">Payment Mode</span>
            <div class="detail-info-value" style="text-transform:uppercase;">${order.payment_mode}</div>
          </div>
        </div>

        <h4 style="font-size:13px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin:16px 0 8px;">Order Items</h4>
        <div style="background:var(--bg-surface);padding:10px 14px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:16px;">
          ${itemsHtml}
        </div>

        <div style="background:var(--bg-tertiary);padding:14px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;">
            <span style="color:var(--text-secondary);">Subtotal</span>
            <span>${window.App.formatCurrency(order.subtotal)}</span>
          </div>
          ${order.discount_amount > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:13px;color:var(--color-success);">
              <span>Discount</span>
              <span>-${window.App.formatCurrency(order.discount_amount)}</span>
            </div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--text-muted);">
            <span>CGST</span>
            <span>${window.App.formatCurrency(order.cgst)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--text-muted);">
            <span>SGST</span>
            <span>${window.App.formatCurrency(order.sgst)}</span>
          </div>
          ${order.round_off ? `
            <div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;color:var(--text-muted);">
              <span>Round Off</span>
              <span>${window.App.formatCurrency(order.round_off)}</span>
            </div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;padding-top:8px;margin-top:6px;border-top:1px solid var(--border-color);font-size:18px;font-weight:700;color:var(--text-primary);">
            <span>Total</span>
            <span style="color:var(--accent-primary);">${window.App.formatCurrency(order.total)}</span>
          </div>
        </div>

        ${isVoided ? `
          <div style="background:var(--color-danger-bg);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--color-danger);margin-bottom:16px;">
            <strong style="color:var(--color-danger);">Void Reason:</strong>
            <p style="font-size:13px;color:var(--text-primary);margin-top:4px;">${order.void_reason || 'No reason provided'}</p>
          </div>
        ` : ''}

        <div style="display:flex;gap:8px;flex-direction:column;">
          <button class="btn btn-outline btn-sm" id="panel-btn-preview" style="border-color:var(--accent-primary);color:var(--accent-primary);">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
            Print Preview
          </button>
          <button class="btn btn-primary btn-sm" id="panel-btn-receipt">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd"/></svg>
            Print Thermal Receipt
          </button>
          <button class="btn btn-outline btn-sm" id="panel-btn-invoice">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd"/></svg>
            Print A4 Tax Invoice
          </button>
          ${!isVoided ? `
            <button class="btn btn-outline btn-sm btn-danger" id="panel-btn-void">
              Delete Order
            </button>
          ` : ''}
        </div>
      `;

      window.App.openDetailPanel(`Order ${order.order_no}`, detailHtml);

      // Panel Action Listeners
      const btnPreview = document.getElementById('panel-btn-preview');
      const btnReceipt = document.getElementById('panel-btn-receipt');
      const btnInvoice = document.getElementById('panel-btn-invoice');
      const btnVoid = document.getElementById('panel-btn-void');

      if (btnPreview) {
        btnPreview.onclick = () => this.previewOrder(order.id);
      }
      if (btnReceipt) {
        btnReceipt.onclick = () => this.printOrderReceipt(order.id);
      }
      if (btnInvoice) {
        btnInvoice.onclick = () => this.printOrderInvoice(order.id);
      }
      if (btnVoid) {
        btnVoid.onclick = () => this.promptDeleteOrder(order.id, order.order_no);
      }
    } catch (err) {
      console.error('Error opening order detail:', err);
      window.App.showToast(err.message, 'error');
    }
  },

  async printOrderReceipt(orderId) {
    try {
      const res = await window.api.orders.getById(orderId);
      if (res.success && res.data) {
        await window.api.print.receipt(res.data, window.App.settings);
        window.App.showToast('Receipt printed', 'success');
      }
    } catch (err) {
      window.App.showToast('Printing failed: ' + err.message, 'error');
    }
  },

  async printOrderInvoice(orderId) {
    try {
      const res = await window.api.orders.getById(orderId);
      if (res.success && res.data) {
        await window.api.print.invoice(res.data, window.App.settings);
        window.App.showToast('Tax Invoice printed', 'success');
      }
    } catch (err) {
      window.App.showToast('Printing failed: ' + err.message, 'error');
    }
  },

  async previewOrder(orderId) {
    try {
      const res = await window.api.orders.getById(orderId);
      if (res.success && res.data) {
        await window.App.showPrintPreview(res.data, window.App.settings);
      }
    } catch (err) {
      window.App.showToast('Could not load preview: ' + err.message, 'error');
    }
  },

  promptDeleteOrder(orderId, orderNo) {
    window.App.showModal({
      title: `Delete Order #${orderNo}`,
      bodyHtml: `
        <p style="color:var(--color-danger);font-weight:600;margin-bottom:12px;">
          Warning: Deleting this order cancels the sale and excludes it from revenue reports.
        </p>
        <div class="form-group">
          <label>Reason for Deletion *</label>
          <input type="text" id="modal-void-reason" placeholder="e.g. Customer cancelled, punch mistake, test order" required autofocus>
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Confirm Delete',
          className: 'btn btn-primary btn-sm btn-danger',
          onClick: async () => {
            const reason = document.getElementById('modal-void-reason')?.value.trim();
            if (!reason) {
              window.App.showToast('Please provide a reason for deleting', 'warning');
              return;
            }

            try {
              const userId = window.App.currentUser?.id || 1;
              const res = await window.api.orders.void(orderId, userId, reason);

              if (res.success) {
                window.App.showToast(`Order #${orderNo} deleted`, 'info');
                window.App.closeModal();
                window.App.closeDetailPanel();
                await this.fetchOrders();
              } else {
                window.App.showToast(res.error || 'Failed to delete order', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  async exportCsv() {
    if (this.orders.length === 0) {
      window.App.showToast('No orders to export', 'warning');
      return;
    }

    const headers = [
      'Order No',
      'Date Time',
      'Order Type',
      'Table',
      'Customer Name',
      'Customer Phone',
      'Customer GSTIN',
      'Cashier',
      'Subtotal',
      'Discount',
      'CGST',
      'SGST',
      'Round Off',
      'Grand Total',
      'Payment Mode',
      'Status',
      'Void Reason'
    ];

    const escapeCsv = (str) => {
      const val = str === null || str === undefined ? '' : String(str);
      return `"${val.replace(/"/g, '""')}"`;
    };

    const rows = this.orders.map(o => [
      escapeCsv(o.order_no),
      escapeCsv(o.created_at),
      escapeCsv(o.order_type),
      escapeCsv(o.table_no),
      escapeCsv(o.customer_name),
      escapeCsv(o.customer_phone),
      escapeCsv(o.customer_gstin),
      escapeCsv(o.user_name),
      o.subtotal,
      o.discount_amount,
      o.cgst,
      o.sgst,
      o.round_off,
      o.total,
      escapeCsv(o.payment_mode),
      escapeCsv(o.status),
      escapeCsv(o.void_reason)
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    try {
      const res = await window.api.app.exportData('orders', csvContent);
      if (res.success && res.data) {
        window.App.showToast('Orders exported successfully!', 'success');
      }
    } catch (err) {
      window.App.showToast('Export failed: ' + err.message, 'error');
    }
  }
};
