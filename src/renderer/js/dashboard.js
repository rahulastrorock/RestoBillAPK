/**
 * RestoBill - Dashboard Controller
 * Handles today's business metrics, sales trend charts, payment breakdown, and top items
 */

window.Dashboard = {
  charts: {},

  async load() {
    await this.loadMetrics();
    await this.loadCharts();
  },

  async loadMetrics() {
    try {
      const res = await window.api.reports.dailySummary();
      if (!res.success || !res.data) return;

      const data = res.data;
      const sales = data.sales || {};
      const comparison = data.comparison || {};

      // Revenue
      const revEl = document.getElementById('dash-revenue');
      const revChangeEl = document.getElementById('dash-revenue-change');
      if (revEl) revEl.textContent = window.App.formatCurrency(sales.total_revenue || 0);

      if (revChangeEl) {
        const change = comparison.revenue_change || 0;
        if (change > 0) {
          revChangeEl.className = 'card-change positive';
          revChangeEl.textContent = `+${window.App.formatCurrency(change)} vs yesterday`;
        } else if (change < 0) {
          revChangeEl.className = 'card-change negative';
          revChangeEl.textContent = `-${window.App.formatCurrency(Math.abs(change))} vs yesterday`;
        } else {
          revChangeEl.className = 'card-change';
          revChangeEl.textContent = 'Same as yesterday';
        }
      }

      // Orders count
      const ordersEl = document.getElementById('dash-orders');
      const ordersChangeEl = document.getElementById('dash-orders-change');
      if (ordersEl) ordersEl.textContent = sales.total_orders || 0;

      if (ordersChangeEl) {
        const oChange = comparison.order_change || 0;
        if (oChange > 0) {
          ordersChangeEl.className = 'card-change positive';
          ordersChangeEl.textContent = `+${oChange} vs yesterday`;
        } else if (oChange < 0) {
          ordersChangeEl.className = 'card-change negative';
          ordersChangeEl.textContent = `${oChange} vs yesterday`;
        } else {
          ordersChangeEl.className = 'card-change';
          ordersChangeEl.textContent = 'Same as yesterday';
        }
      }

      // Avg Order Value
      const avgEl = document.getElementById('dash-avg');
      if (avgEl) avgEl.textContent = window.App.formatCurrency(sales.avg_order_value || 0);

      // GST Collected
      const gstEl = document.getElementById('dash-gst');
      const totalGst = (sales.total_cgst || 0) + (sales.total_sgst || 0);
      if (gstEl) gstEl.textContent = window.App.formatCurrency(totalGst);

      // Top Selling Items
      this.renderTopItems(data.topItems || []);

      // Payment Modes Doughnut Chart
      this.renderPaymentChart(data.payments || []);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    }
  },

  renderTopItems(items) {
    const container = document.getElementById('dash-top-items');
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--text-muted);">
          No orders recorded today yet.
        </div>
      `;
      return;
    }

    container.innerHTML = items.map((item, index) => `
      <div class="top-item-row" style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border-color);">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="width:24px;height:24px;border-radius:50%;background:var(--bg-surface-active);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--text-secondary);">${index + 1}</span>
          <span style="font-weight:600;color:var(--text-primary);">${item.name}</span>
        </div>
        <div style="text-align:right;">
          <span style="font-weight:700;color:var(--accent-primary);">${window.App.formatCurrency(item.total_amount)}</span>
          <span style="font-size:11px;color:var(--text-muted);display:block;">${item.total_qty} sold</span>
        </div>
      </div>
    `).join('');
  },

  async loadCharts() {
    if (typeof Chart === 'undefined') return;

    // Destroy existing charts if reloading
    if (this.charts.salesTrend) this.charts.salesTrend.destroy();
    if (this.charts.hourly) this.charts.hourly.destroy();

    // 1. Sales Trend Chart (Last 7 Days)
    try {
      const getLocalDate = (d) => (window.App?.getLocalDateString ? window.App.getLocalDateString(d) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      const today = new Date();
      const past7 = new Date();
      past7.setDate(today.getDate() - 6);

      const startDate = getLocalDate(past7);
      const endDate = getLocalDate(today);

      const res = await window.api.reports.salesReport(startDate, endDate);
      if (res.success && res.data) {
        const dailySales = res.data.dailySales || [];

        // Build 7 day array ensuring all days present
        const labels = [];
        const revenues = [];
        const orders = [];

        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(today.getDate() - i);
          const dateStr = getLocalDate(d);
          const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
          labels.push(label);

          const found = dailySales.find(s => s.date === dateStr);
          revenues.push(found ? found.revenue : 0);
          orders.push(found ? (found.orders || found.order_count || 0) : 0);
        }

        const ctxTrend = document.getElementById('chart-sales-trend');
        if (ctxTrend) {
          this.charts.salesTrend = new Chart(ctxTrend, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: 'Revenue (₹)',
                  data: revenues,
                  borderColor: '#f97316',
                  backgroundColor: 'rgba(249, 115, 22, 0.1)',
                  fill: true,
                  tension: 0.35,
                  pointBackgroundColor: '#f97316',
                  pointRadius: 4,
                  yAxisID: 'y',
                },
                {
                  label: 'Orders',
                  data: orders,
                  borderColor: '#3b82f6',
                  backgroundColor: 'transparent',
                  borderDash: [5, 5],
                  tension: 0.35,
                  pointBackgroundColor: '#3b82f6',
                  pointRadius: 3,
                  yAxisID: 'y1',
                }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
                }
              },
              scales: {
                x: {
                  grid: { color: 'rgba(255, 255, 255, 0.05)' },
                  ticks: { color: '#64748b' }
                },
                y: {
                  type: 'linear',
                  display: true,
                  position: 'left',
                  grid: { color: 'rgba(255, 255, 255, 0.05)' },
                  ticks: {
                    color: '#64748b',
                    callback: (val) => '₹' + val
                  }
                },
                y1: {
                  type: 'linear',
                  display: true,
                  position: 'right',
                  grid: { drawOnChartArea: false },
                  ticks: { color: '#64748b', stepSize: 1 }
                }
              }
            }
          });
        }
      }
    } catch (err) {
      console.error('Failed to load sales trend chart:', err);
    }

    // 2. Hourly Distribution Chart
    try {
      const res = await window.api.reports.hourlyDistribution();
      if (res.success && res.data) {
        const hourlyData = res.data;
        const labels = hourlyData.map(h => `${h.hour}:00`);
        const orders = hourlyData.map(h => h.orders || h.count || 0);

        const ctxHourly = document.getElementById('chart-hourly');
        if (ctxHourly) {
          this.charts.hourly = new Chart(ctxHourly, {
            type: 'bar',
            data: {
              labels,
              datasets: [{
                label: 'Orders',
                data: orders,
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderRadius: 4,
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false }
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: { color: '#64748b', maxRotation: 45 }
                },
                y: {
                  grid: { color: 'rgba(255, 255, 255, 0.05)' },
                  ticks: { color: '#64748b', stepSize: 1 }
                }
              }
            }
          });
        }
      }
    } catch (err) {
      console.error('Failed to load hourly distribution:', err);
    }
  },

  renderPaymentChart(payments) {
    if (typeof Chart === 'undefined') return;
    if (this.charts.payments) this.charts.payments.destroy();

    const ctx = document.getElementById('chart-payment-modes');
    if (!ctx) return;

    const labels = payments.length > 0 ? payments.map(p => p.payment_mode.toUpperCase()) : ['Cash'];
    const data = payments.length > 0 ? payments.map(p => p.amount) : [1];
    const colors = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#eab308'];

    this.charts.payments = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 12 }
          }
        },
        cutout: '70%'
      }
    });
  }
};
