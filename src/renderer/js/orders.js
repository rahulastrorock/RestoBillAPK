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

  listenersAttached: false,

  async load() {
    this.setupDefaultDates();
    this.setupEventListeners();
    await this.fetchOrders();
  },

  getLocalDate(d = new Date()) {
    if (window.App?.getLocalDateString) return window.App.getLocalDateString(d);
    const dateObj = (d instanceof Date) ? d : new Date(d);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  setupDefaultDates() {
    const today = this.getLocalDate();
    const startInput = document.getElementById('orders-start-date');
    const endInput = document.getElementById('orders-end-date');

    if (startInput) {
      if (!startInput.value) {
        startInput.value = today;
      }
      this.filters.startDate = startInput.value;
    }
    if (endInput) {
      if (!endInput.value) {
        endInput.value = today;
      }
      this.filters.endDate = endInput.value;
    }
  },

  setupEventListeners() {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

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
        const today = this.getLocalDate();
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
    const cardsList = document.getElementById('orders-cards-list');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center" style="padding:40px;">
            <div class="loading-overlay"><div class="spinner"></div> Loading orders...</div>
          </td>
        </tr>
      `;
    }
    if (cardsList) {
      cardsList.innerHTML = `
        <div class="text-center" style="padding:40px; color:var(--text-muted); background:var(--bg-surface); border-radius:var(--radius-md);">
          <div class="spinner" style="margin:0 auto 12px auto;"></div>
          <div>Loading orders...</div>
        </div>
      `;
    }

    try {
      const offset = (this.filters.page - 1) * this.filters.limit;
      const payload = {
        status: this.filters.status,
        search: this.filters.phone,
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
    const cardsList = document.getElementById('orders-cards-list');
    if (!tbody && !cardsList) return;

    if (this.orders.length === 0) {
      const msg = this.filters.phone
        ? `No orders found matching "${window.App.escapeHtml(this.filters.phone)}".`
        : 'No orders found for the selected period.';
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="9" class="text-center" style="padding: 40px; color: var(--text-muted);">
              ${msg}
            </td>
          </tr>
        `;
      }
      if (cardsList) {
        cardsList.innerHTML = `
          <div class="orders-empty-state" style="padding: 36px 16px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
            <div style="font-size: 28px; margin-bottom: 8px; opacity: 0.7;">🧾</div>
            <div style="font-size: 14px; font-weight: 600;">${msg}</div>
          </div>
        `;
      }
      return;
    }

    const typeIcons = {
      dine_in: '🍽️ Dine In',
      takeaway: '🥡 Takeaway',
      delivery: '🛵 Delivery'
    };

    // 1. Generate Desktop Table Rows (for screens > 900px)
    if (tbody) {
      tbody.innerHTML = this.orders.map(order => {
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
                <button class="action-btn action-share btn-share-order" data-id="${order.id}" title="Share via WhatsApp or Email" style="color:#22c55e;">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg>
                </button>
                ${!isVoided ? `
                  <button class="action-btn action-edit btn-edit-order" data-id="${order.id}" title="Edit Order">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                  </button>
                  <button class="action-btn action-delete btn-void-order" data-id="${order.id}" data-no="${order.order_no}" title="Delete Order">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 2. Generate Mobile Smart Cards (for screens <= 900px)
    if (cardsList) {
      cardsList.innerHTML = this.orders.map(order => {
        const isVoided = order.status === 'voided';
        return `
          <div class="order-smart-card ${isVoided ? 'order-card-voided' : ''}">
            <!-- Top row: Order Number, Date/Time & Badges -->
            <div class="order-card-header">
              <div class="order-card-header-left">
                <span class="order-card-id">${order.order_no}</span>
                <span class="order-card-time">${window.App.formatDateTime(order.created_at)}</span>
              </div>
              <div class="order-card-header-right">
                <span class="badge ${isVoided ? 'badge-voided' : 'badge-completed'}">${isVoided ? 'Deleted' : 'Completed'}</span>
                <span class="badge badge-manager">${typeIcons[order.order_type] || order.order_type}</span>
              </div>
            </div>

            <!-- Middle row: Customer, Table, Payment & Total -->
            <div class="order-card-body">
              <div class="order-card-meta">
                <div class="order-card-customer">
                  <div class="customer-name">${order.customer_name || 'Walk-in'}</div>
                  ${order.customer_phone ? `<div class="customer-phone">📞 ${order.customer_phone}</div>` : ''}
                </div>
                ${order.table_no ? `<span class="order-card-table">🪑 Table ${order.table_no}</span>` : ''}
              </div>

              <div class="order-card-financials">
                <span class="badge badge-cashier">${(order.payment_mode || 'cash').toUpperCase()}</span>
                <div class="order-card-total ${isVoided ? 'total-voided' : ''}">${window.App.formatCurrency(order.total)}</div>
              </div>
            </div>

            <!-- Bottom row: Full action toolbar shifted down inside the card -->
            <div class="order-card-actions">
              <button class="order-action-pill btn-preview-order" data-id="${order.id}" title="Print Preview">
                <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
                <span>Preview</span>
              </button>
              <button class="order-action-pill btn-view-order" data-id="${order.id}" title="View Details">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>
                <span>Details</span>
              </button>
              <button class="order-action-pill btn-print-order" data-id="${order.id}" title="Print Receipt">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clip-rule="evenodd"/></svg>
                <span>Print</span>
              </button>
              <button class="order-action-pill action-share-pill btn-share-order" data-id="${order.id}" title="Share via WhatsApp">
                <svg viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg>
                <span>Share</span>
              </button>
              ${!isVoided ? `
                <button class="order-action-pill btn-edit-order" data-id="${order.id}" title="Edit Order">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                  <span>Edit</span>
                </button>
                <button class="order-action-pill action-delete-pill btn-void-order" data-id="${order.id}" data-no="${order.order_no}" title="Delete Order">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
                  <span>Delete</span>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    // 3. Attach action button events across page-orders (handles both desktop table and mobile cards)
    const pageOrders = document.getElementById('page-orders');
    if (pageOrders) {
      pageOrders.querySelectorAll('.btn-preview-order').forEach(btn => {
        btn.onclick = async () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          await this.previewOrder(id);
        };
      });

      pageOrders.querySelectorAll('.btn-view-order').forEach(btn => {
        btn.onclick = () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          this.openOrderDetail(id);
        };
      });

      pageOrders.querySelectorAll('.btn-print-order').forEach(btn => {
        btn.onclick = async () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          await this.printOrderReceipt(id);
        };
      });

      pageOrders.querySelectorAll('.btn-share-order').forEach(btn => {
        btn.onclick = async () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          const res = await window.api.orders.getById(id);
          if (res.success && res.data) {
            window.App.openShareBillModal(res.data);
          } else {
            window.App.showToast('Failed to load order for sharing', 'error');
          }
        };
      });

      pageOrders.querySelectorAll('.btn-edit-order').forEach(btn => {
        btn.onclick = async () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          const res = await window.api.orders.getById(id);
          if (res.success && res.data) {
            window.POS.startEditingOrder(res.data);
          } else {
            this.openEditOrderModal(id);
          }
        };
      });

      pageOrders.querySelectorAll('.btn-void-order').forEach(btn => {
        btn.onclick = () => {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          const orderNo = btn.getAttribute('data-no');
          this.promptDeleteOrder(id, orderNo);
        };
      });
    }
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
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:2px;">
            <button class="btn btn-outline btn-sm" id="panel-btn-whatsapp" style="border-color:#22c55e;color:#22c55e;font-weight:600;">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/></svg>
              WhatsApp Bill
            </button>
            <button class="btn btn-outline btn-sm" id="panel-btn-email" style="border-color:#3b82f6;color:#60a5fa;font-weight:600;">
              <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
              Email Bill
            </button>
          </div>
          ${!isVoided ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <button class="btn btn-outline btn-sm" id="panel-btn-edit-pos" style="border-color:var(--accent-primary);color:var(--accent-primary);font-weight:700;">
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
                Edit in POS
              </button>
              <button class="btn btn-outline btn-sm" id="panel-btn-edit" style="color:var(--text-secondary);font-weight:600;">
                Quick Edit
              </button>
            </div>
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
      const btnWhatsApp = document.getElementById('panel-btn-whatsapp');
      const btnEmail = document.getElementById('panel-btn-email');
      const btnEditPos = document.getElementById('panel-btn-edit-pos');
      const btnEdit = document.getElementById('panel-btn-edit');
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
      if (btnWhatsApp) {
        btnWhatsApp.onclick = () => window.App.openShareBillModal(order, 'whatsapp');
      }
      if (btnEmail) {
        btnEmail.onclick = () => window.App.openShareBillModal(order, 'email');
      }
      if (btnEditPos) {
        btnEditPos.onclick = () => {
          window.App.closeDetailPanel();
          window.POS.startEditingOrder(order);
        };
      }
      if (btnEdit) {
        btnEdit.onclick = () => this.openEditOrderModal(order.id);
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

    window.App.showToast('Preparing orders export...', 'info');

    // Fetch all matching orders without pagination so complete register is exported
    let ordersToExport = this.orders;
    try {
      const payload = {
        status: this.filters.status,
        search: this.filters.phone,
        phone: this.filters.phone,
        limit: 10000,
        offset: 0
      };
      if (!this.filters.allDates) {
        if (this.filters.startDate) payload.startDate = this.filters.startDate;
        if (this.filters.endDate) payload.endDate = this.filters.endDate;
      }
      const res = await window.api.orders.getAll(payload);
      if (res.success && res.data && res.data.orders && res.data.orders.length > 0) {
        ordersToExport = res.data.orders;
      }
    } catch (e) {
      console.warn('Could not fetch all orders, using current page instead:', e);
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

    let totalRevenue = 0;
    const rows = ordersToExport.map(o => {
      totalRevenue += parseFloat(o.total || 0);
      return [
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
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');

    await window.App.exportDataWithEmail({
      type: 'orders',
      csvContent,
      title: 'Orders Register',
      count: ordersToExport.length,
      totalAmount: totalRevenue
    });
  },

  async openEditOrderModal(orderId) {
    try {
      const res = await window.api.orders.getById(orderId);
      if (!res.success || !res.data) {
        window.App.showToast(res.error || 'Failed to load order for editing', 'error');
        return;
      }

      const order = res.data;
      if (order.status === 'voided') {
        window.App.showToast('Deleted/voided orders cannot be edited', 'warning');
        return;
      }

      // Fetch menu items so user can easily add new items
      let menuItems = [];
      try {
        const getMenuFn = window.api?.menu?.getAll || window.api?.menu?.getAllItems;
        const menuRes = getMenuFn ? await getMenuFn() : { success: false };
        if (menuRes.success && menuRes.data) {
          menuItems = menuRes.data.filter(m => m.active !== 0);
        }
      } catch (e) {
        console.warn('Could not load menu items:', e);
      }

      // Clone items list for local editing in modal
      let editItems = (order.items || []).map(item => ({
        menu_item_id: item.menu_item_id || item.id || null,
        name: item.name,
        price: parseFloat(item.price) || 0,
        gst_rate: parseFloat(item.gst_rate !== undefined ? item.gst_rate : 5),
        quantity: parseFloat(item.quantity) || 1,
        notes: item.notes || ''
      }));

      let editDiscount = {
        type: order.discount_type || 'percent',
        value: parseFloat(order.discount_value) || 0
      };

      const isInclusive = window.App?.settings?.gst_inclusive === '1';

      const calcTotals = () => {
        let subtotal = 0;
        let totalTaxable = 0;
        let totalGst = 0;

        for (const item of editItems) {
          const lineTotal = item.price * item.quantity;
          subtotal += lineTotal;
          const rate = item.gst_rate || 5;
          if (isInclusive) {
            const taxable = (lineTotal * 100) / (100 + rate);
            totalTaxable += taxable;
            totalGst += (lineTotal - taxable);
          } else {
            totalTaxable += lineTotal;
            totalGst += (lineTotal * rate) / 100;
          }
        }

        let discountAmount = 0;
        if (editDiscount.value > 0) {
          if (editDiscount.type === 'percent') {
            discountAmount = (subtotal * editDiscount.value) / 100;
          } else {
            discountAmount = Math.min(editDiscount.value, subtotal);
          }
          if (window.App?.settings?.tax_on_discount === 'after' && subtotal > 0) {
            const discountRatio = discountAmount / subtotal;
            totalGst = totalGst * (1 - discountRatio);
          }
        }

        const cgst = totalGst / 2;
        const sgst = totalGst / 2;
        const grandTotal = isInclusive ? Math.max(0, subtotal - discountAmount) : Math.max(0, subtotal - discountAmount + totalGst);
        const roundOff = Math.round(grandTotal) - grandTotal;
        const finalTotal = Math.round(grandTotal);

        return { subtotal: isInclusive ? totalTaxable : subtotal, discountAmount, cgst, sgst, roundOff, finalTotal };
      };

      const renderItemsList = () => {
        const container = document.getElementById('modal-items-container');
        if (!container) return;

        if (editItems.length === 0) {
          container.innerHTML = `
            <div style="padding:14px;text-align:center;color:var(--color-danger);font-size:12px;background:var(--color-danger-bg);border:1px dashed var(--color-danger);border-radius:var(--radius-sm);">
              ⚠️ Order has no items! Add at least one item below before updating.
            </div>
          `;
          return;
        }

        container.innerHTML = editItems.map((item, idx) => {
          const lineTotal = item.price * item.quantity;
          return `
            <div class="edit-order-item-row" data-idx="${idx}" style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-sm);margin-bottom:6px;">
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${window.App.escapeHtml(item.name)}</div>
                <div style="font-size:11px;color:var(--text-muted);">${window.App.formatCurrency(item.price)} each • ${item.gst_rate}% GST</div>
              </div>
              <div style="display:flex;align-items:center;gap:3px;">
                <button type="button" class="btn btn-outline btn-sm btn-edit-qty-minus" data-idx="${idx}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;font-weight:700;">&minus;</button>
                <input type="number" min="0.5" step="any" class="input-sm edit-item-qty-input" data-idx="${idx}" value="${item.quantity}" style="width:52px;text-align:center;padding:2px 4px;height:26px;">
                <button type="button" class="btn btn-outline btn-sm btn-edit-qty-plus" data-idx="${idx}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;font-weight:700;">&#43;</button>
              </div>
              <div style="font-weight:700;font-size:13px;min-width:70px;text-align:right;color:var(--text-primary);">
                ${window.App.formatCurrency(lineTotal)}
              </div>
              <button type="button" class="btn btn-outline btn-sm btn-danger btn-edit-item-remove" data-idx="${idx}" title="Remove item" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;line-height:1;">&times;</button>
            </div>
          `;
        }).join('');

        // Attach item events
        container.querySelectorAll('.btn-edit-qty-minus').forEach(btn => {
          btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            if (editItems[idx]) {
              editItems[idx].quantity -= 1;
              if (editItems[idx].quantity <= 0) {
                editItems.splice(idx, 1);
              }
              updateModalView();
            }
          };
        });

        container.querySelectorAll('.btn-edit-qty-plus').forEach(btn => {
          btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            if (editItems[idx]) {
              editItems[idx].quantity += 1;
              updateModalView();
            }
          };
        });

        container.querySelectorAll('.edit-item-qty-input').forEach(input => {
          input.onchange = () => {
            const idx = parseInt(input.getAttribute('data-idx'), 10);
            const val = parseFloat(input.value);
            if (editItems[idx]) {
              if (val > 0) {
                editItems[idx].quantity = val;
              } else {
                editItems.splice(idx, 1);
              }
              updateModalView();
            }
          };
        });

        container.querySelectorAll('.btn-edit-item-remove').forEach(btn => {
          btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-idx'), 10);
            editItems.splice(idx, 1);
            updateModalView();
          };
        });
      };

      const updateModalTotals = () => {
        const totals = calcTotals();
        const subtotalEl = document.getElementById('modal-total-subtotal');
        const discRow = document.getElementById('modal-discount-row');
        const discEl = document.getElementById('modal-total-discount');
        const cgstEl = document.getElementById('modal-total-cgst');
        const sgstEl = document.getElementById('modal-total-sgst');
        const grandEl = document.getElementById('modal-total-grand');
        const countEl = document.getElementById('modal-items-count');

        if (subtotalEl) subtotalEl.textContent = window.App.formatCurrency(totals.subtotal);
        if (discRow) discRow.style.display = totals.discountAmount > 0 ? 'flex' : 'none';
        if (discEl) discEl.textContent = `-${window.App.formatCurrency(totals.discountAmount)}`;
        if (cgstEl) cgstEl.textContent = window.App.formatCurrency(totals.cgst);
        if (sgstEl) sgstEl.textContent = window.App.formatCurrency(totals.sgst);
        if (grandEl) grandEl.textContent = window.App.formatCurrency(totals.finalTotal);
        if (countEl) countEl.textContent = `(${editItems.length})`;
      };

      const updateModalView = () => {
        renderItemsList();
        updateModalTotals();
      };

      const menuOptionsHtml = menuItems.map(m => `
        <option value="${m.id}" data-price="${m.price}" data-gst="${m.gst_rate || 5}" data-name="${window.App.escapeHtml(m.name)}">
          ${window.App.escapeHtml(m.name)} (${window.App.formatCurrency(m.price)})
        </option>
      `).join('');

      const bodyHtml = `
        <div class="edit-order-modal-body" style="max-height:72vh;overflow-y:auto;padding-right:4px;">
          <!-- Top info bar with Open in POS shortcut -->
          <div style="display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg, rgba(249,115,22,0.1), rgba(99,102,241,0.1));border:1px solid rgba(249,115,22,0.3);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
            <div>
              <span style="font-size:11px;font-weight:800;letter-spacing:0.05em;color:var(--accent-primary);text-transform:uppercase;">Invoice #${order.order_no}</span>
              <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Original Date: ${window.App.formatDateTime(order.created_at)}</div>
            </div>
            <button type="button" class="btn btn-outline btn-sm" id="modal-btn-open-pos" style="border-color:var(--accent-primary);color:var(--accent-primary);display:flex;align-items:center;gap:6px;font-weight:600;">
              <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/></svg>
              <span>Edit in Full POS Screen</span>
            </button>
          </div>

          <!-- Customer & Order Meta Fields -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(135px, 1fr));gap:10px;margin-bottom:14px;background:var(--bg-tertiary);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);">
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block;">Order Type</label>
              <select id="modal-edit-order-type" class="input-sm" style="width:100%;">
                <option value="dine_in" ${order.order_type === 'dine_in' ? 'selected' : ''}>🍽️ Dine In</option>
                <option value="takeaway" ${order.order_type === 'takeaway' ? 'selected' : ''}>🥡 Takeaway</option>
                <option value="delivery" ${order.order_type === 'delivery' ? 'selected' : ''}>🛵 Delivery</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block;">Table #</label>
              <input type="text" id="modal-edit-table-no" class="input-sm" value="${window.App.escapeHtml(order.table_no || '')}" placeholder="e.g. 4" style="width:100%;">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block;">Customer Name</label>
              <input type="text" id="modal-edit-cust-name" class="input-sm" value="${window.App.escapeHtml(order.customer_name || '')}" placeholder="Customer name" style="width:100%;">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block;">Customer Phone</label>
              <input type="text" id="modal-edit-cust-phone" class="input-sm" value="${window.App.escapeHtml(order.customer_phone || '')}" placeholder="Mobile number" style="width:100%;">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block;">Customer GSTIN</label>
              <input type="text" id="modal-edit-cust-gstin" class="input-sm" value="${window.App.escapeHtml(order.customer_gstin || '')}" placeholder="15-digit GSTIN" maxlength="15" style="width:100%;text-transform:uppercase;">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block;">Payment Mode</label>
              <select id="modal-edit-payment-mode" class="input-sm" style="width:100%;">
                <option value="cash" ${order.payment_mode === 'cash' ? 'selected' : ''}>💵 Cash</option>
                <option value="upi" ${order.payment_mode === 'upi' ? 'selected' : ''}>📱 UPI / QR</option>
                <option value="card" ${order.payment_mode === 'card' ? 'selected' : ''}>💳 Card</option>
                <option value="credit" ${order.payment_mode === 'credit' ? 'selected' : ''}>📋 Credit / Due</option>
                <option value="split" ${order.payment_mode === 'split' ? 'selected' : ''}>🔀 Split Payment</option>
              </select>
            </div>
          </div>

          <!-- Items List Section -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <h4 style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin:0;">
              Order Items <span id="modal-items-count">(${editItems.length})</span>
            </h4>
          </div>

          <div id="modal-items-container" style="margin-bottom:12px;"></div>

          <!-- Add Item Form inside modal -->
          ${menuItems.length > 0 ? `
            <div style="background:var(--bg-tertiary);border:1px dashed var(--border-color);border-radius:var(--radius-sm);padding:10px;margin-bottom:14px;">
              <span style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:6px;">➕ Add Item from Menu</span>
              <div style="display:flex;gap:6px;align-items:center;">
                <select id="modal-add-item-select" class="input-sm" style="flex:1;">
                  <option value="">-- Select menu item to add --</option>
                  ${menuOptionsHtml}
                </select>
                <input type="number" id="modal-add-item-qty" class="input-sm" value="1" min="1" step="any" style="width:55px;text-align:center;" title="Quantity">
                <button type="button" class="btn btn-secondary btn-sm" id="modal-btn-add-item" style="white-space:nowrap;">
                  + Add
                </button>
              </div>
            </div>
          ` : ''}

          <!-- Discount & Totals -->
          <div style="background:var(--bg-tertiary);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:12px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border-color);">
              <span style="font-size:12px;font-weight:600;color:var(--text-secondary);">Discount</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <select id="modal-edit-discount-type" class="input-sm" style="width:75px;">
                  <option value="percent" ${editDiscount.type === 'percent' ? 'selected' : ''}>%</option>
                  <option value="amount" ${editDiscount.type === 'amount' ? 'selected' : ''}>₹</option>
                </select>
                <input type="number" id="modal-edit-discount-val" class="input-sm" value="${editDiscount.value}" min="0" step="any" style="width:75px;text-align:right;">
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);padding:2px 0;">
              <span>Subtotal</span>
              <span id="modal-total-subtotal">₹0.00</span>
            </div>
            <div id="modal-discount-row" style="display:none;justify-content:space-between;font-size:12px;color:var(--color-success);padding:2px 0;">
              <span>Discount</span>
              <span id="modal-total-discount">-₹0.00</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);padding:2px 0;">
              <span>CGST</span>
              <span id="modal-total-cgst">₹0.00</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);padding:2px 0;">
              <span>SGST</span>
              <span id="modal-total-sgst">₹0.00</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:var(--text-primary);padding-top:6px;margin-top:6px;border-top:1px solid var(--border-color);">
              <span>Updated Total</span>
              <span id="modal-total-grand" style="color:var(--accent-primary);">₹0.00</span>
            </div>
          </div>

          <!-- Notes -->
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:11px;font-weight:600;margin-bottom:4px;display:block;">Notes / Reason for Edit</label>
            <input type="text" id="modal-edit-notes" class="input-sm" value="${window.App.escapeHtml(order.notes || '')}" placeholder="Optional notes" style="width:100%;">
          </div>
        </div>
      `;

      const saveUpdatedOrder = async (shouldPrint = false) => {
        if (editItems.length === 0) {
          window.App.showToast('Please add at least one item to the order', 'warning');
          return;
        }

        const tableNo = (document.getElementById('modal-edit-table-no')?.value || '').trim();
        const orderType = document.getElementById('modal-edit-order-type')?.value || 'dine_in';
        const customerName = (document.getElementById('modal-edit-cust-name')?.value || '').trim();
        const customerPhone = (document.getElementById('modal-edit-cust-phone')?.value || '').trim();
        const customerGstin = (document.getElementById('modal-edit-cust-gstin')?.value || '').trim().toUpperCase();
        const paymentMode = document.getElementById('modal-edit-payment-mode')?.value || 'cash';
        const notes = (document.getElementById('modal-edit-notes')?.value || '').trim();

        const payload = {
          items: editItems,
          table_no: tableNo,
          order_type: orderType,
          customer_id: order.customer_id || null,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_gstin: customerGstin,
          user_id: window.App?.currentUser?.id || order.user_id || 1,
          user_name: window.App?.currentUser?.name || window.App?.currentUser?.username || order.user_name || 'Admin',
          discount_type: editDiscount.type,
          discount_value: editDiscount.value,
          payment_mode: paymentMode,
          payment_details: order.payment_details || '',
          notes: notes
        };

        try {
          const updateRes = await window.api.orders.update(order.id, payload);
          if (updateRes.success && updateRes.data) {
            const updated = updateRes.data;
            window.App.showToast(`Order #${updated.order_no} updated successfully! (₹${updated.total})`, 'success');
            window.App.closeModal();

            if (shouldPrint) {
              try {
                await window.api.print.receipt(updated, window.App.settings);
                window.App.showToast('Receipt printed', 'info');
              } catch (pErr) {
                console.error('Print error:', pErr);
                window.App.showToast('Could not print receipt automatically', 'warning');
              }
            }

            await this.fetchOrders();
            // If detail panel is open, refresh it
            const panel = document.getElementById('order-detail-panel');
            if (panel && !panel.classList.contains('hidden')) {
              this.openOrderDetail(order.id);
            }
          } else {
            window.App.showToast(updateRes.error || 'Failed to update order', 'error');
          }
        } catch (err) {
          console.error('Order update error:', err);
          window.App.showToast(err.message || 'Error updating order', 'error');
        }
      };

      window.App.showModal({
        title: `Edit Order #${order.order_no}`,
        bodyHtml: bodyHtml,
        footerButtons: [
          { text: 'Cancel', className: 'btn btn-outline btn-sm' },
          {
            text: 'Save & Print',
            className: 'btn btn-secondary btn-sm',
            onClick: () => saveUpdatedOrder(true)
          },
          {
            text: 'Update Order',
            className: 'btn btn-primary btn-sm',
            onClick: () => saveUpdatedOrder(false)
          }
        ]
      });

      // Populate item list and initial totals inside modal
      updateModalView();

      // Open in POS button listener
      const openPosBtn = document.getElementById('modal-btn-open-pos');
      if (openPosBtn) {
        openPosBtn.onclick = () => {
          // Gather currently edited fields into order object before opening in POS
          const currentOrder = {
            ...order,
            items: editItems,
            table_no: (document.getElementById('modal-edit-table-no')?.value || '').trim(),
            order_type: document.getElementById('modal-edit-order-type')?.value || 'dine_in',
            customer_name: (document.getElementById('modal-edit-cust-name')?.value || '').trim(),
            customer_phone: (document.getElementById('modal-edit-cust-phone')?.value || '').trim(),
            customer_gstin: (document.getElementById('modal-edit-cust-gstin')?.value || '').trim().toUpperCase(),
            payment_mode: document.getElementById('modal-edit-payment-mode')?.value || 'cash',
            notes: (document.getElementById('modal-edit-notes')?.value || '').trim(),
            discount_type: editDiscount.type,
            discount_value: editDiscount.value
          };
          window.POS.startEditingOrder(currentOrder);
        };
      }

      // Add item button listener
      const addItemBtn = document.getElementById('modal-btn-add-item');
      const itemSelect = document.getElementById('modal-add-item-select');
      const itemQtyInput = document.getElementById('modal-add-item-qty');

      if (addItemBtn && itemSelect && itemQtyInput) {
        addItemBtn.onclick = () => {
          const selectedOption = itemSelect.options[itemSelect.selectedIndex];
          if (!selectedOption || !selectedOption.value) {
            window.App.showToast('Please select an item to add', 'warning');
            return;
          }

          const menuItemId = parseInt(selectedOption.value, 10);
          const name = selectedOption.getAttribute('data-name');
          const price = parseFloat(selectedOption.getAttribute('data-price')) || 0;
          const gstRate = parseFloat(selectedOption.getAttribute('data-gst')) || 5;
          const qty = parseFloat(itemQtyInput.value) || 1;

          const existingIdx = editItems.findIndex(i => (i.menu_item_id && i.menu_item_id === menuItemId) || (i.name === name));
          if (existingIdx > -1) {
            editItems[existingIdx].quantity += qty;
          } else {
            editItems.push({
              menu_item_id: menuItemId,
              name: name,
              price: price,
              gst_rate: gstRate,
              quantity: qty,
              notes: ''
            });
          }

          itemSelect.value = '';
          itemQtyInput.value = '1';
          updateModalView();
        };
      }

      // Discount inputs change listener
      const discTypeSelect = document.getElementById('modal-edit-discount-type');
      const discValInput = document.getElementById('modal-edit-discount-val');

      if (discTypeSelect) {
        discTypeSelect.onchange = () => {
          editDiscount.type = discTypeSelect.value;
          updateModalTotals();
        };
      }

      if (discValInput) {
        discValInput.oninput = () => {
          editDiscount.value = parseFloat(discValInput.value) || 0;
          updateModalTotals();
        };
      }

    } catch (err) {
      console.error('Error opening edit order modal:', err);
      window.App.showToast(err.message, 'error');
    }
  }
};
