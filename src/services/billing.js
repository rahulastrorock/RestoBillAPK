const { getDb } = require('../database/db');

class BillingService {
  init() {
    this.db = getDb();
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS draft_bills (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Table 1',
        table_no TEXT DEFAULT '',
        order_type TEXT NOT NULL DEFAULT 'dine_in',
        customer_id INTEGER,
        customer_name TEXT DEFAULT '',
        customer_phone TEXT DEFAULT '',
        customer_gstin TEXT DEFAULT '',
        discount_type TEXT DEFAULT 'percent',
        discount_value REAL DEFAULT 0,
        payment_mode TEXT DEFAULT 'cash',
        notes TEXT DEFAULT '',
        items_json TEXT NOT NULL DEFAULT '[]',
        subtotal REAL DEFAULT 0,
        total REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
    `);
  }

  /**
   * Generate the next order/invoice number
   * Format: INV-2627-000001 (prefix-financialYear-sequence)
   */
  getNextOrderNo() {
    const settings = {};
    const rows = this.db.prepare("SELECT key, value FROM settings WHERE key IN ('invoice_prefix', 'financial_year', 'current_invoice_no')").all();
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    const prefix = settings.invoice_prefix || 'INV';
    const fy = (settings.financial_year || '2026-27').replace('-', '');
    const nextNo = (parseInt(settings.current_invoice_no || '0') + 1);
    const paddedNo = String(nextNo).padStart(6, '0');

    return `${prefix}-${fy}-${paddedNo}`;
  }

  /**
   * Create a new order with items and GST calculation
   * @param {Object} orderData - Order details including items
   * @returns {Object} Created order with items
   */
  createOrder(orderData) {
    const {
      items, table_no = '', order_type = 'dine_in',
      customer_id = null, customer_name = '', customer_phone = '',
      customer_gstin = '', user_id, user_name = '',
      discount_type = 'percent', discount_value = 0,
      payment_mode = 'cash', payment_details = '', notes = ''
    } = orderData;

    if (!items || items.length === 0) {
      throw new Error('Order must have at least one item');
    }

    if (!user_id) {
      throw new Error('User ID is required');
    }

    // Get settings for GST calculation
    const gstInclusive = this.db.prepare("SELECT value FROM settings WHERE key = 'gst_inclusive'").get();
    const isInclusive = gstInclusive && gstInclusive.value === '1';

    // Calculate each item's tax breakdown
    const processedItems = items.map(item => {
      const qty = parseFloat(item.quantity) || 1;
      const price = parseFloat(item.price);
      const gstRate = parseFloat(item.gst_rate) || 5;
      const lineTotal = price * qty;

      let taxableAmount, gstAmount, cgst, sgst;

      if (isInclusive) {
        // Price is inclusive of GST
        taxableAmount = (lineTotal * 100) / (100 + gstRate);
        gstAmount = lineTotal - taxableAmount;
      } else {
        // Price is exclusive of GST
        taxableAmount = lineTotal;
        gstAmount = (lineTotal * gstRate) / 100;
      }

      cgst = gstAmount / 2;
      sgst = gstAmount / 2;

      return {
        menu_item_id: item.menu_item_id || item.id || null,
        name: item.name,
        price: price,
        quantity: qty,
        gst_rate: gstRate,
        taxable_amount: Math.round(taxableAmount * 100) / 100,
        cgst: Math.round(cgst * 100) / 100,
        sgst: Math.round(sgst * 100) / 100,
        total: isInclusive ? lineTotal : Math.round((lineTotal + gstAmount) * 100) / 100,
        notes: item.notes || '',
      };
    });

    // Calculate order totals
    let subtotal = processedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let totalTaxableAmount = processedItems.reduce((sum, item) => sum + item.taxable_amount, 0);
    let totalCgst = processedItems.reduce((sum, item) => sum + item.cgst, 0);
    let totalSgst = processedItems.reduce((sum, item) => sum + item.sgst, 0);

    // Apply discount
    let discountAmount = 0;
    if (discount_value > 0) {
      if (discount_type === 'percent') {
        discountAmount = (subtotal * discount_value) / 100;
      } else {
        discountAmount = discount_value;
      }
      discountAmount = Math.round(discountAmount * 100) / 100;

      // Recalculate GST after discount (if tax_on_discount is 'after')
      const taxOnDiscount = this.db.prepare("SELECT value FROM settings WHERE key = 'tax_on_discount'").get();
      if (taxOnDiscount && taxOnDiscount.value === 'after') {
        const discountRatio = discountAmount / subtotal;
        totalTaxableAmount = totalTaxableAmount * (1 - discountRatio);
        totalCgst = totalCgst * (1 - discountRatio);
        totalSgst = totalSgst * (1 - discountRatio);
      }
    }

    totalTaxableAmount = Math.round(totalTaxableAmount * 100) / 100;
    totalCgst = Math.round(totalCgst * 100) / 100;
    totalSgst = Math.round(totalSgst * 100) / 100;

    // Calculate grand total
    let grandTotal;
    if (isInclusive) {
      grandTotal = subtotal - discountAmount;
    } else {
      grandTotal = totalTaxableAmount + totalCgst + totalSgst;
    }

    // Round off
    const roundOff = Math.round(grandTotal) - grandTotal;
    grandTotal = Math.round(grandTotal);

    // Generate order number
    const orderNo = this.getNextOrderNo();

    // Insert order using transaction
    const createOrderTx = this.db.transaction(() => {
      // Insert order
      const orderResult = this.db.prepare(`
        INSERT INTO orders (
          order_no, table_no, order_type, customer_id, customer_name,
          customer_phone, customer_gstin, user_id, user_name, subtotal,
          discount_type, discount_value, discount_amount, taxable_amount,
          cgst, sgst, round_off, total, payment_mode, payment_details,
          status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderNo, table_no, order_type, customer_id, customer_name,
        customer_phone, customer_gstin, user_id, user_name, subtotal,
        discount_type, discount_value, discountAmount, totalTaxableAmount,
        totalCgst, totalSgst, Math.round(roundOff * 100) / 100, grandTotal,
        payment_mode, payment_details, 'completed', notes
      );

      const orderId = orderResult.lastInsertRowid;

      // Insert order items
      const insertItem = this.db.prepare(`
        INSERT INTO order_items (
          order_id, menu_item_id, name, price, quantity,
          gst_rate, taxable_amount, cgst, sgst, total, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of processedItems) {
        insertItem.run(
          orderId, item.menu_item_id, item.name, item.price, item.quantity,
          item.gst_rate, item.taxable_amount, item.cgst, item.sgst, item.total, item.notes
        );
      }

      // Update invoice number counter
      const currentNo = parseInt(this.db.prepare("SELECT value FROM settings WHERE key = 'current_invoice_no'").get()?.value || '0');
      this.db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now', 'localtime') WHERE key = 'current_invoice_no'")
        .run(String(currentNo + 1));

      // Add audit log
      this.db.prepare(
        'INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(user_id, user_name, 'CREATE_ORDER', 'order', orderId,
        `Order ${orderNo} created - Total: ₹${grandTotal}`);

      return orderId;
    });

    const orderId = createOrderTx();

    // Return the complete order
    return this.getOrderById(orderId);
  }

  /**
   * Get order by ID with items
   */
  getOrderById(id) {
    const order = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) throw new Error('Order not found');

    const items = this.db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    return { ...order, items };
  }

  /**
   * Get orders with optional filters
   */
  getOrders(filters = {}) {
    const { startDate, endDate, status, user_id, payment_mode, order_type, phone, search, limit = 100, offset = 0 } = filters;

    let where = ['1=1'];
    let params = [];

    if (startDate) {
      where.push("date(created_at) >= date(?)");
      params.push(startDate);
    }
    if (endDate) {
      where.push("date(created_at) <= date(?)");
      params.push(endDate);
    }
    if (status) {
      where.push("status = ?");
      params.push(status);
    }
    if (user_id) {
      where.push("user_id = ?");
      params.push(user_id);
    }
    if (payment_mode) {
      where.push("payment_mode = ?");
      params.push(payment_mode);
    }
    if (order_type) {
      where.push("order_type = ?");
      params.push(order_type);
    }
    if (phone && phone.trim()) {
      where.push("customer_phone LIKE ?");
      params.push(`%${phone.trim()}%`);
    }
    if (search && search.trim()) {
      where.push("(customer_phone LIKE ? OR customer_name LIKE ? OR order_no LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    params.push(limit, offset);

    const orders = this.db.prepare(`
      SELECT * FROM orders 
      WHERE ${where.join(' AND ')} 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(...params);

    const total = this.db.prepare(`
      SELECT COUNT(*) as count FROM orders WHERE ${where.join(' AND ')}
    `).get(...params.slice(0, -2));

    return { orders, total: total.count };
  }

  /**
   * Get all orders for a specific date
   */
  getDailyOrders(date) {
    const orders = this.db.prepare(`
      SELECT * FROM orders 
      WHERE date(created_at) = date(?) 
      ORDER BY created_at DESC
    `).all(date);

    return orders;
  }

  /**
   * Void/cancel an order
   */
  voidOrder(id, userId, reason) {
    const order = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) throw new Error('Order not found');
    if (order.status === 'voided') throw new Error('Order is already voided');

    this.db.prepare(`
      UPDATE orders SET 
        status = 'voided', 
        void_reason = ?,
        voided_by = ?,
        updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(reason || 'No reason provided', userId, id);

    // Get user name for audit
    const user = this.db.prepare('SELECT name FROM users WHERE id = ?').get(userId);

    this.db.prepare(
      'INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, user?.name || '', 'VOID_ORDER', 'order', id,
      `Order ${order.order_no} voided - Reason: ${reason || 'No reason'}`);

    return this.getOrderById(id);
  }

  // ─── Customer Management ──────────────────────────────────────

  getCustomers() {
    return this.db.prepare('SELECT * FROM customers ORDER BY name ASC').all();
  }

  searchCustomers(query) {
    if (!query || !query.trim()) return this.getCustomers();
    const term = `%${query.trim()}%`;
    return this.db.prepare(
      'SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR gstin LIKE ? ORDER BY name ASC'
    ).all(term, term, term);
  }

  addCustomer(data) {
    const { name, phone = '', email = '', gstin = '', address = '' } = data;
    if (!name || !name.trim()) throw new Error('Customer name is required');

    const result = this.db.prepare(
      'INSERT INTO customers (name, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?)'
    ).run(name.trim(), phone, email, gstin.toUpperCase(), address);

    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  }

  updateCustomer(id, data) {
    const fields = ['name', 'phone', 'email', 'gstin', 'address'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = data[field];
        if (field === 'gstin') val = val.toUpperCase();
        if (field === 'name') val = val.trim();
        values.push(val);
      }
    }

    if (updates.length === 0) return true;

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(id);

    this.db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  }

  deleteCustomer(id) {
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE orders SET customer_id = NULL WHERE customer_id = ?').run(id);
      this.db.prepare('DELETE FROM customers WHERE id = ?').run(id);
    });
    tx();
    return true;
  }

  // ─── Draft Bills (Multi-table intermediate billing) ─────────────
  getAllDrafts() {
    return this.db.prepare('SELECT * FROM draft_bills ORDER BY updated_at DESC').all();
  }

  saveDraft(draft) {
    const {
      id,
      title = 'Table 1',
      table_no = '',
      order_type = 'dine_in',
      customer_id = null,
      customer_name = '',
      customer_phone = '',
      customer_gstin = '',
      discount_type = 'percent',
      discount_value = 0,
      payment_mode = 'cash',
      notes = '',
      items = [],
      subtotal = 0,
      total = 0
    } = draft;

    const draftId = id || `draft_${Date.now()}`;
    const itemsJson = typeof items === 'string' ? items : JSON.stringify(items || []);

    const stmt = this.db.prepare(`
      INSERT INTO draft_bills (
        id, title, table_no, order_type, customer_id, customer_name, customer_phone,
        customer_gstin, discount_type, discount_value, payment_mode, notes,
        items_json, subtotal, total, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        table_no = excluded.table_no,
        order_type = excluded.order_type,
        customer_id = excluded.customer_id,
        customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        customer_gstin = excluded.customer_gstin,
        discount_type = excluded.discount_type,
        discount_value = excluded.discount_value,
        payment_mode = excluded.payment_mode,
        notes = excluded.notes,
        items_json = excluded.items_json,
        subtotal = excluded.subtotal,
        total = excluded.total,
        updated_at = datetime('now', 'localtime')
    `);

    stmt.run(
      draftId, title, table_no, order_type, customer_id, customer_name, customer_phone,
      customer_gstin, discount_type, discount_value, payment_mode, notes,
      itemsJson, subtotal, total
    );

    return this.db.prepare('SELECT * FROM draft_bills WHERE id = ?').get(draftId);
  }

  deleteDraft(id) {
    this.db.prepare('DELETE FROM draft_bills WHERE id = ?').run(id);
    return true;
  }

  clearAllDrafts() {
    this.db.prepare('DELETE FROM draft_bills').run();
    return true;
  }
}

module.exports = new BillingService();
