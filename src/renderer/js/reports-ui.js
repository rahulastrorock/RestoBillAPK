/**
 * RestoBill - Reports Controller
 * Handles Sales Reports, GST GSTR-1 Summaries, Item Analysis, Expense Tracking, and Exports
 */

window.ReportsUI = {
  activeTab: 'sales-report',
  startDate: '',
  endDate: '',
  currentData: null,

  async load() {
    this.setupDefaultDates();
    this.setupEventListeners();
    await this.generateReport();
  },

  setupDefaultDates() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');

    if (startInput && !startInput.value) {
      startInput.value = firstDay.toISOString().slice(0, 10);
    }
    if (endInput && !endInput.value) {
      endInput.value = today.toISOString().slice(0, 10);
    }

    this.startDate = startInput?.value || '';
    this.endDate = endInput?.value || '';
  },

  setupEventListeners() {
    // Report tab switching
    document.querySelectorAll('#page-reports .tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#page-reports .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.getAttribute('data-tab') || 'sales-report';
        this.generateReport();
      };
    });

    // Generate button
    const genBtn = document.getElementById('btn-generate-report');
    if (genBtn) {
      genBtn.onclick = () => {
        this.startDate = document.getElementById('report-start-date')?.value || '';
        this.endDate = document.getElementById('report-end-date')?.value || '';
        this.generateReport();
      };
    }

    // Export button
    const expBtn = document.getElementById('btn-export-report');
    if (expBtn) {
      expBtn.onclick = () => this.exportCurrentReport();
    }
  },

  async generateReport() {
    const container = document.getElementById('report-content');
    if (!container) return;

    container.innerHTML = `
      <div style="padding: 40px; text-align: center;">
        <div class="loading-overlay"><div class="spinner"></div> Generating ${this.activeTab.replace('-', ' ')}...</div>
      </div>
    `;

    try {
      if (this.activeTab === 'sales-report') {
        await this.loadSalesReport(container);
      } else if (this.activeTab === 'gst-report') {
        await this.loadGstReport(container);
      } else if (this.activeTab === 'item-report') {
        await this.loadItemReport(container);
      } else if (this.activeTab === 'expense-report') {
        await this.loadExpenseReport(container);
      }
    } catch (err) {
      console.error('Error generating report:', err);
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--color-danger);">
          Failed to generate report: ${err.message}
        </div>
      `;
    }
  },

  async loadSalesReport(container) {
    const res = await window.api.reports.salesReport(this.startDate, this.endDate);
    if (!res.success || !res.data) {
      container.innerHTML = '<p class="text-center" style="padding:40px;">No sales data available.</p>';
      return;
    }

    const { dailySales = [], totals = {} } = res.data;
    this.currentData = { type: 'sales', rows: dailySales };

    const rowsHtml = dailySales.length > 0 ? dailySales.map(row => `
      <tr>
        <td><strong>${window.App.formatDate(row.date)}</strong></td>
        <td>${row.orders}</td>
        <td style="font-weight:700;color:var(--accent-primary);">${window.App.formatCurrency(row.revenue)}</td>
        <td>${window.App.formatCurrency(row.gst_collected)}</td>
        <td style="color:var(--color-success);">${window.App.formatCurrency(row.discounts)}</td>
        <td>${window.App.formatCurrency(row.avg_order)}</td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="6" class="text-center" style="padding:40px;color:var(--text-muted);">
          No sales recorded between ${this.startDate} and ${this.endDate}.
        </td>
      </tr>
    `;

    container.innerHTML = `
      <div class="summary-cards" style="margin-bottom:20px;">
        <div class="summary-card card-revenue">
          <div class="card-content">
            <span class="card-label">Total Revenue</span>
            <span class="card-value">${window.App.formatCurrency(totals.total_revenue || 0)}</span>
          </div>
        </div>
        <div class="summary-card card-orders">
          <div class="card-content">
            <span class="card-label">Total Orders</span>
            <span class="card-value">${totals.total_orders || 0}</span>
          </div>
        </div>
        <div class="summary-card card-tax">
          <div class="card-content">
            <span class="card-label">Total GST Collected</span>
            <span class="card-value">${window.App.formatCurrency((totals.total_cgst || 0) + (totals.total_sgst || 0))}</span>
          </div>
        </div>
        <div class="summary-card card-avg">
          <div class="card-content">
            <span class="card-label">Avg Order Value</span>
            <span class="card-value">${window.App.formatCurrency(totals.avg_order_value || 0)}</span>
          </div>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Orders</th>
              <th>Revenue (₹)</th>
              <th>GST Collected (₹)</th>
              <th>Discounts (₹)</th>
              <th>Avg Order (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  },

  async loadGstReport(container) {
    const res = await window.api.reports.gstReport(this.startDate, this.endDate);
    if (!res.success || !res.data) {
      container.innerHTML = '<p class="text-center" style="padding:40px;">No GST data available.</p>';
      return;
    }

    const { byRate = [], byHsn = [] } = res.data;
    this.currentData = { type: 'gst', byRate, byHsn };

    const rateRows = byRate.map(r => `
      <tr>
        <td><strong>${r.gst_rate}%</strong></td>
        <td>${r.invoice_count}</td>
        <td>${window.App.formatCurrency(r.taxable_value)}</td>
        <td>${window.App.formatCurrency(r.cgst)}</td>
        <td>${window.App.formatCurrency(r.sgst)}</td>
        <td style="font-weight:700;color:var(--accent-primary);">${window.App.formatCurrency(r.total_tax)}</td>
        <td style="font-weight:700;">${window.App.formatCurrency(r.total_value)}</td>
      </tr>
    `).join('');

    const hsnRows = byHsn.map(h => `
      <tr>
        <td><code>${h.hsn_sac || '996331'}</code></td>
        <td>${h.gst_rate}%</td>
        <td>${h.total_quantity}</td>
        <td>${window.App.formatCurrency(h.taxable_value)}</td>
        <td>${window.App.formatCurrency(h.cgst)}</td>
        <td>${window.App.formatCurrency(h.sgst)}</td>
        <td style="font-weight:700;">${window.App.formatCurrency(h.total_value)}</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <h3 style="font-size:15px;font-weight:700;margin-bottom:10px;">GST Summary by Rate (GSTR-1 Format)</h3>
      <div class="table-container" style="margin-bottom:24px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>GST Rate</th>
              <th>Invoices</th>
              <th>Taxable Value</th>
              <th>CGST</th>
              <th>SGST</th>
              <th>Total Tax</th>
              <th>Gross Value</th>
            </tr>
          </thead>
          <tbody>
            ${rateRows || '<tr><td colspan="7" class="text-center">No GST records found</td></tr>'}
          </tbody>
        </table>
      </div>

      <h3 style="font-size:15px;font-weight:700;margin-bottom:10px;">HSN / SAC Summary</h3>
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>HSN/SAC Code</th>
              <th>Rate (%)</th>
              <th>Total Qty</th>
              <th>Taxable Value</th>
              <th>CGST</th>
              <th>SGST</th>
              <th>Total Value</th>
            </tr>
          </thead>
          <tbody>
            ${hsnRows || '<tr><td colspan="7" class="text-center">No HSN records found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  async loadItemReport(container) {
    const [topRes, catRes] = await Promise.all([
      window.api.reports.topItems(this.startDate, this.endDate, 20),
      window.api.reports.categoryWiseSales(this.startDate, this.endDate)
    ]);

    const items = topRes.success ? (topRes.data || []) : [];
    const cats = catRes.success ? (catRes.data || []) : [];

    this.currentData = { type: 'items', items, cats };

    const itemRows = items.map((i, idx) => `
      <tr>
        <td style="width:40px;">${idx + 1}</td>
        <td><strong>${i.name}</strong></td>
        <td>${i.total_qty}</td>
        <td style="font-weight:700;color:var(--accent-primary);">${window.App.formatCurrency(i.total_amount)}</td>
        <td>${window.App.formatCurrency(i.avg_price || (i.total_amount / (i.total_qty || 1)))}</td>
      </tr>
    `).join('');

    const catRows = cats.map(c => `
      <tr>
        <td><strong>${c.category_name || 'Uncategorized'}</strong></td>
        <td>${c.total_qty || 0}</td>
        <td style="font-weight:700;color:var(--accent-primary);">${window.App.formatCurrency(c.total_amount || 0)}</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="reports-two-col-grid">
        <div class="reports-section-card">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text-primary);">Top Selling Items</h3>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width:36px;">#</th>
                  <th>Item Name</th>
                  <th>Qty Sold</th>
                  <th>Total Sales</th>
                  <th>Avg Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows || '<tr><td colspan="5" class="text-center">No item sales found</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="reports-section-card">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--text-primary);">Category Breakdown</h3>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Total Sales</th>
                </tr>
              </thead>
              <tbody>
                ${catRows || '<tr><td colspan="3" class="text-center">No category data found</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  async loadExpenseReport(container) {
    const res = await window.api.expenses.getAll(this.startDate, this.endDate);
    const expenses = res.success ? (res.data || []) : [];
    this.currentData = { type: 'expenses', expenses };

    const totalExpense = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const rows = expenses.map(e => `
      <tr>
        <td>${window.App.formatDate(e.date)}</td>
        <td><span class="badge badge-manager">${e.category}</span></td>
        <td>${e.description || '-'}</td>
        <td style="font-weight:700;color:var(--color-danger);">${window.App.formatCurrency(e.amount)}</td>
        <td>${e.user_name || '-'}</td>
        <td>
          <button class="action-btn action-delete btn-delete-expense" data-id="${e.id}" title="Delete Expense">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <h3 style="font-size:16px;font-weight:700;">Expense Tracker</h3>
          <span style="font-size:14px;color:var(--text-muted);">Total: <strong style="color:var(--color-danger);">${window.App.formatCurrency(totalExpense)}</strong></span>
        </div>
        <button class="btn btn-primary btn-sm" id="btn-add-expense">+ Add Expense</button>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount (₹)</th>
              <th>Recorded By</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" class="text-center" style="padding:40px;color:var(--text-muted);">No expenses recorded for this period.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('btn-add-expense')?.addEventListener('click', () => {
      this.openAddExpenseModal();
    });

    container.querySelectorAll('.btn-delete-expense').forEach(btn => {
      btn.onclick = async () => {
        const id = parseInt(btn.getAttribute('data-id'), 10);
        if (confirm('Delete this expense entry?')) {
          try {
            await window.api.expenses.delete(id);
            window.App.showToast('Expense deleted', 'info');
            this.generateReport();
          } catch (err) {
            window.App.showToast(err.message, 'error');
          }
        }
      };
    });
  },

  openAddExpenseModal() {
    const today = new Date().toISOString().slice(0, 10);

    window.App.showModal({
      title: 'Record Business Expense',
      bodyHtml: `
        <div class="form-group">
          <label>Date *</label>
          <input type="date" id="modal-exp-date" value="${today}" required>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Category *</label>
            <select id="modal-exp-cat">
              <option value="Raw Materials / Vegetables">Raw Materials / Vegetables</option>
              <option value="Dairy / Groceries">Dairy / Groceries</option>
              <option value="Packaging & Disposables">Packaging & Disposables</option>
              <option value="Utilities (Gas/Electricity/Water)">Utilities (Gas/Electricity/Water)</option>
              <option value="Salaries & Wages">Salaries & Wages</option>
              <option value="Rent">Rent</option>
              <option value="Maintenance & Repairs">Maintenance & Repairs</option>
              <option value="Other">Other Expenses</option>
            </select>
          </div>
          <div class="form-group">
            <label>Amount (₹) *</label>
            <input type="number" id="modal-exp-amount" placeholder="0.00" min="0" step="any" required autofocus>
          </div>
        </div>
        <div class="form-group">
          <label>Description / Vendor Name</label>
          <input type="text" id="modal-exp-desc" placeholder="e.g. Milk purchase, LPG cylinder refill">
        </div>
      `,
      footerButtons: [
        { text: 'Cancel', className: 'btn btn-outline btn-sm' },
        {
          text: 'Save Expense',
          className: 'btn btn-primary btn-sm',
          onClick: async () => {
            const date = document.getElementById('modal-exp-date')?.value;
            const category = document.getElementById('modal-exp-cat')?.value;
            const amount = parseFloat(document.getElementById('modal-exp-amount')?.value || 0);
            const description = document.getElementById('modal-exp-desc')?.value.trim();

            if (!amount || amount <= 0) {
              window.App.showToast('Please enter a valid expense amount', 'warning');
              return;
            }

            try {
              const res = await window.api.expenses.add({
                date,
                category,
                amount,
                description,
                user_id: window.App.currentUser?.id || 1,
                user_name: window.App.currentUser?.name || 'Admin'
              });

              if (res.success) {
                window.App.showToast('Expense recorded successfully!', 'success');
                window.App.closeModal();
                this.generateReport();
              } else {
                window.App.showToast(res.error || 'Failed to record expense', 'error');
              }
            } catch (err) {
              window.App.showToast(err.message, 'error');
            }
          }
        }
      ]
    });
  },

  async exportCurrentReport() {
    if (!this.currentData) {
      window.App.showToast('No report data to export', 'warning');
      return;
    }

    let csvContent = '';
    const escapeCsv = (s) => `"${String(s || '').replace(/"/g, '""')}"`;

    if (this.currentData.type === 'sales') {
      const headers = ['Date', 'Orders', 'Revenue', 'GST Collected', 'Discounts', 'Average Order'];
      const rows = (this.currentData.rows || []).map(r => [
        escapeCsv(r.date),
        r.orders,
        r.revenue,
        r.gst_collected,
        r.discounts,
        r.avg_order
      ].join(','));
      csvContent = [headers.join(','), ...rows].join('\n');
    } else if (this.currentData.type === 'gst') {
      const headers = ['GST Rate', 'Invoices', 'Taxable Value', 'CGST', 'SGST', 'Total Tax', 'Gross Value'];
      const rows = (this.currentData.byRate || []).map(r => [
        `${r.gst_rate}%`,
        r.invoice_count,
        r.taxable_value,
        r.cgst,
        r.sgst,
        r.total_tax,
        r.total_value
      ].join(','));
      csvContent = [headers.join(','), ...rows].join('\n');
    } else if (this.currentData.type === 'expenses') {
      const headers = ['Date', 'Category', 'Description', 'Amount', 'Recorded By'];
      const rows = (this.currentData.expenses || []).map(e => [
        escapeCsv(e.date),
        escapeCsv(e.category),
        escapeCsv(e.description),
        e.amount,
        escapeCsv(e.user_name)
      ].join(','));
      csvContent = [headers.join(','), ...rows].join('\n');
    } else {
      window.App.showToast('Export not available for this tab', 'info');
      return;
    }

    try {
      const res = await window.api.app.exportData(this.activeTab, csvContent);
      if (res.success && res.data) {
        window.App.showToast('Report exported successfully!', 'success');
      }
    } catch (err) {
      window.App.showToast('Export failed: ' + err.message, 'error');
    }
  }
};
