const { getDb } = require('../database/db');

class ReportService {
  init() {
    this.db = getDb();
  }

  /**
   * Get daily summary - today's key metrics
   */
  getDailySummary(date) {
    const targetDate = date || new Date().toISOString().slice(0, 10);

    // Total sales
    const sales = this.db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(SUM(cgst), 0) as total_cgst,
        COALESCE(SUM(sgst), 0) as total_sgst,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(AVG(total), 0) as avg_order_value
      FROM orders 
      WHERE date(created_at) = date(?) AND status = 'completed'
    `).get(targetDate);

    // Voided orders
    const voided = this.db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as amount
      FROM orders 
      WHERE date(created_at) = date(?) AND status = 'voided'
    `).get(targetDate);

    // Payment breakdown
    const payments = this.db.prepare(`
      SELECT payment_mode, COUNT(*) as count, COALESCE(SUM(total), 0) as amount
      FROM orders 
      WHERE date(created_at) = date(?) AND status = 'completed'
      GROUP BY payment_mode
    `).all(targetDate);

    // Order type breakdown
    const orderTypes = this.db.prepare(`
      SELECT order_type, COUNT(*) as count, COALESCE(SUM(total), 0) as amount
      FROM orders 
      WHERE date(created_at) = date(?) AND status = 'completed'
      GROUP BY order_type
    `).all(targetDate);

    // Top 5 items today
    const topItems = this.db.prepare(`
      SELECT oi.name, SUM(oi.quantity) as total_qty, SUM(oi.total) as total_amount
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) = date(?) AND o.status = 'completed'
      GROUP BY oi.name
      ORDER BY total_qty DESC
      LIMIT 5
    `).all(targetDate);

    // Today's expenses
    const expenses = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses WHERE date = ?
    `).get(targetDate);

    // Comparison with yesterday
    const yesterday = new Date(targetDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    
    const yesterdaySales = this.db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total_revenue, COUNT(*) as total_orders
      FROM orders 
      WHERE date(created_at) = date(?) AND status = 'completed'
    `).get(yesterdayStr);

    return {
      date: targetDate,
      sales: {
        ...sales,
        avg_order_value: Math.round((sales.avg_order_value || 0) * 100) / 100,
      },
      voided,
      payments,
      orderTypes,
      topItems,
      expenses: expenses.total,
      netRevenue: (sales.total_revenue || 0) - (expenses.total || 0),
      comparison: {
        yesterday_revenue: yesterdaySales.total_revenue,
        yesterday_orders: yesterdaySales.total_orders,
        revenue_change: sales.total_revenue - yesterdaySales.total_revenue,
        order_change: sales.total_orders - yesterdaySales.total_orders,
      },
    };
  }

  /**
   * Sales report for a date range
   */
  getSalesReport(startDate, endDate) {
    const dailySales = this.db.prepare(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue,
        COALESCE(SUM(cgst + sgst), 0) as gst_collected,
        COALESCE(SUM(discount_amount), 0) as discounts,
        COALESCE(AVG(total), 0) as avg_order
      FROM orders 
      WHERE date(created_at) BETWEEN date(?) AND date(?) AND status = 'completed'
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `).all(startDate, endDate);

    const totals = this.db.prepare(`
      SELECT 
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(SUM(cgst), 0) as total_cgst,
        COALESCE(SUM(sgst), 0) as total_sgst,
        COALESCE(SUM(discount_amount), 0) as total_discounts,
        COALESCE(AVG(total), 0) as avg_order_value
      FROM orders 
      WHERE date(created_at) BETWEEN date(?) AND date(?) AND status = 'completed'
    `).get(startDate, endDate);

    return { dailySales, totals };
  }

  /**
   * GST Report - GSTR-1 style data
   */
  getGstReport(startDate, endDate) {
    // GST summary by rate
    const byRate = this.db.prepare(`
      SELECT 
        oi.gst_rate,
        COUNT(DISTINCT o.id) as invoice_count,
        COALESCE(SUM(oi.taxable_amount), 0) as taxable_value,
        COALESCE(SUM(oi.cgst), 0) as cgst,
        COALESCE(SUM(oi.sgst), 0) as sgst,
        COALESCE(SUM(oi.cgst + oi.sgst), 0) as total_tax,
        COALESCE(SUM(oi.total), 0) as total_value
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) BETWEEN date(?) AND date(?) AND o.status = 'completed'
      GROUP BY oi.gst_rate
      ORDER BY oi.gst_rate ASC
    `).all(startDate, endDate);

    // HSN-wise summary
    const byHsn = this.db.prepare(`
      SELECT 
        mi.hsn_sac,
        oi.gst_rate,
        COALESCE(SUM(oi.quantity), 0) as total_quantity,
        COALESCE(SUM(oi.taxable_amount), 0) as taxable_value,
        COALESCE(SUM(oi.cgst), 0) as cgst,
        COALESCE(SUM(oi.sgst), 0) as sgst,
        COALESCE(SUM(oi.total), 0) as total_value
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE date(o.created_at) BETWEEN date(?) AND date(?) AND o.status = 'completed'
      GROUP BY mi.hsn_sac, oi.gst_rate
      ORDER BY mi.hsn_sac ASC
    `).all(startDate, endDate);

    // B2B invoices (with customer GSTIN)
    const b2bInvoices = this.db.prepare(`
      SELECT 
        order_no, created_at, customer_name, customer_gstin,
        taxable_amount, cgst, sgst, total
      FROM orders 
      WHERE date(created_at) BETWEEN date(?) AND date(?) 
        AND status = 'completed' 
        AND customer_gstin != '' AND customer_gstin IS NOT NULL
      ORDER BY created_at ASC
    `).all(startDate, endDate);

    // Overall totals
    const totals = this.db.prepare(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(taxable_amount), 0) as total_taxable,
        COALESCE(SUM(cgst), 0) as total_cgst,
        COALESCE(SUM(sgst), 0) as total_sgst,
        COALESCE(SUM(cgst + sgst), 0) as total_gst,
        COALESCE(SUM(total), 0) as total_value
      FROM orders 
      WHERE date(created_at) BETWEEN date(?) AND date(?) AND status = 'completed'
    `).get(startDate, endDate);

    return { byRate, byHsn, b2bInvoices, totals };
  }

  /**
   * Top selling items
   */
  getTopItems(startDate, endDate, limit = 10) {
    return this.db.prepare(`
      SELECT 
        oi.name,
        oi.menu_item_id,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.total) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count,
        AVG(oi.price) as avg_price
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE date(o.created_at) BETWEEN date(?) AND date(?) AND o.status = 'completed'
      GROUP BY oi.name
      ORDER BY total_quantity DESC
      LIMIT ?
    `).all(startDate, endDate, limit);
  }

  /**
   * Category-wise sales breakdown
   */
  getCategoryWiseSales(startDate, endDate) {
    return this.db.prepare(`
      SELECT 
        COALESCE(c.name, 'Uncategorized') as category_name,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.total) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      LEFT JOIN categories c ON mi.category_id = c.id
      WHERE date(o.created_at) BETWEEN date(?) AND date(?) AND o.status = 'completed'
      GROUP BY c.name
      ORDER BY total_revenue DESC
    `).all(startDate, endDate);
  }

  /**
   * Hourly distribution of orders
   */
  getHourlyDistribution(date) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    return this.db.prepare(`
      SELECT 
        strftime('%H', created_at) as hour,
        COUNT(*) as orders,
        COALESCE(SUM(total), 0) as revenue
      FROM orders 
      WHERE date(created_at) = date(?) AND status = 'completed'
      GROUP BY strftime('%H', created_at)
      ORDER BY hour ASC
    `).all(targetDate);
  }

  /**
   * Payment mode breakdown
   */
  getPaymentModeBreakdown(startDate, endDate) {
    return this.db.prepare(`
      SELECT 
        payment_mode,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as amount
      FROM orders 
      WHERE date(created_at) BETWEEN date(?) AND date(?) AND status = 'completed'
      GROUP BY payment_mode
      ORDER BY amount DESC
    `).all(startDate, endDate);
  }

  // ─── Expenses ─────────────────────────────────────────────────

  getExpenses(startDate, endDate) {
    if (startDate && endDate) {
      return this.db.prepare(
        'SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC, created_at DESC'
      ).all(startDate, endDate);
    }
    return this.db.prepare('SELECT * FROM expenses ORDER BY date DESC, created_at DESC LIMIT 100').all();
  }

  addExpense(data) {
    const { category = 'General', description = '', amount, date, user_id, user_name = '' } = data;
    if (!amount || amount <= 0) throw new Error('Valid amount is required');
    if (!date) throw new Error('Date is required');

    const result = this.db.prepare(
      'INSERT INTO expenses (category, description, amount, date, user_id, user_name) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(category, description, amount, date, user_id, user_name);

    return this.db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  }

  deleteExpense(id) {
    this.db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    return true;
  }

  // ─── Audit Log ────────────────────────────────────────────────

  getAuditLog(limit = 100, offset = 0) {
    const logs = this.db.prepare(
      'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);

    const total = this.db.prepare('SELECT COUNT(*) as count FROM audit_log').get();

    return { logs, total: total.count };
  }

  addAuditEntry(entry) {
    const { user_id, user_name = '', action, entity = '', entity_id = null, details = '' } = entry;
    this.db.prepare(
      'INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(user_id, user_name, action, entity, entity_id, details);
    return true;
  }
}

module.exports = new ReportService();
