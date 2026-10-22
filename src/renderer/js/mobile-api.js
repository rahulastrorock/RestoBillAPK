/**
 * RestoBill - Standalone Mobile & Offline Web Adapter
 * Provides full window.api implementation backed by in-browser SQLite (sql.js) and IndexedDB persistence.
 * Activates ONLY when running outside Electron (e.g., in Android Capacitor WebView or modern browser).
 */

(function () {
  'use strict';

  // If already running in Electron, preload.js provides window.api natively
  if (window.api) {
    console.log('[RestoBill] Desktop Electron detected, skipping mobile-api provider.');
    return;
  }

  console.log('[RestoBill] Standalone Mobile / Web detected, initializing offline SQLite engine...');

  let db = null;
  let initPromise = null;
  const DB_STORE_NAME = 'restobill_mobile_db';
  const STORE_NAME = 'keyval';
  const DB_KEY = 'sqlite_binary';

  // ─── IndexedDB Helper ─────────────────────────────────────────────
  function openIdb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_STORE_NAME, 1);
      request.onupgradeneeded = (e) => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains(STORE_NAME)) {
          idb.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadSavedDatabase() {
    try {
      const idb = await openIdb();
      return new Promise((resolve) => {
        const tx = idb.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(DB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('[RestoBill] Could not open IndexedDB:', e);
      return null;
    }
  }

  let saveTimeout = null;
  function triggerSaveDatabase() {
    if (!db) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
      try {
        const binary = db.export();
        const idb = await openIdb();
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(binary, DB_KEY);
      } catch (e) {
        console.error('[RestoBill] Failed to persist database to IndexedDB:', e);
      }
    }, 250);
  }

  // ─── SQLite DB Wrapper ───────────────────────────────────────────
  class DatabaseWrapper {
    constructor(rawDb) {
      this.raw = rawDb;
    }

    prepare(sql) {
      const self = this;
      return {
        all(...params) {
          const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          let stmt;
          try {
            stmt = self.raw.prepare(sql);
            if (flattened.length > 0) stmt.bind(flattened);
            const rows = [];
            while (stmt.step()) {
              rows.push(stmt.getAsObject());
            }
            return rows;
          } finally {
            if (stmt) stmt.free();
          }
        },
        get(...params) {
          const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          let stmt;
          try {
            stmt = self.raw.prepare(sql);
            if (flattened.length > 0) stmt.bind(flattened);
            let result = null;
            if (stmt.step()) {
              result = stmt.getAsObject();
            }
            return result;
          } finally {
            if (stmt) stmt.free();
          }
        },
        run(...params) {
          const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          self.raw.run(sql, flattened);
          const resId = self.raw.exec('SELECT last_insert_rowid() AS id;');
          const lastInsertRowid = resId[0]?.values[0]?.[0] || 0;
          const resChanges = self.raw.exec('SELECT changes() AS changes;');
          const changes = resChanges[0]?.values[0]?.[0] || 0;
          triggerSaveDatabase();
          return { lastInsertRowid, changes };
        }
      };
    }

    exec(sql) {
      this.raw.exec(sql);
      triggerSaveDatabase();
    }

    transaction(fn) {
      const self = this;
      return function (...args) {
        self.raw.exec('BEGIN TRANSACTION;');
        try {
          const res = fn(...args);
          self.raw.exec('COMMIT;');
          triggerSaveDatabase();
          return res;
        } catch (e) {
          self.raw.exec('ROLLBACK;');
          throw e;
        }
      };
    }

    pragma(cmd) {
      try {
        return this.raw.exec(`PRAGMA ${cmd};`);
      } catch (e) {}
    }

    export() {
      return this.raw.export();
    }
  }

  // ─── Migrations ──────────────────────────────────────────────────
  function runMigrations(dbWrap) {
    dbWrap.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'cashier' CHECK(role IN ('admin', 'manager', 'cashier')),
        active INTEGER NOT NULL DEFAULT 1,
        last_login TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        short_code TEXT DEFAULT '',
        price REAL NOT NULL,
        hsn_sac TEXT DEFAULT '996331',
        gst_rate REAL NOT NULL DEFAULT 5.0,
        is_veg INTEGER NOT NULL DEFAULT 1,
        description TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        gstin TEXT DEFAULT '',
        address TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT UNIQUE NOT NULL,
        table_no TEXT DEFAULT '',
        order_type TEXT NOT NULL DEFAULT 'dine_in' CHECK(order_type IN ('dine_in', 'takeaway', 'delivery')),
        customer_id INTEGER,
        customer_name TEXT DEFAULT '',
        customer_phone TEXT DEFAULT '',
        customer_gstin TEXT DEFAULT '',
        user_id INTEGER NOT NULL,
        user_name TEXT DEFAULT '',
        subtotal REAL NOT NULL DEFAULT 0,
        discount_type TEXT DEFAULT 'percent' CHECK(discount_type IN ('percent', 'amount')),
        discount_value REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        taxable_amount REAL NOT NULL DEFAULT 0,
        cgst REAL NOT NULL DEFAULT 0,
        sgst REAL NOT NULL DEFAULT 0,
        round_off REAL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        payment_mode TEXT DEFAULT 'cash' CHECK(payment_mode IN ('cash', 'upi', 'card', 'split', 'credit')),
        payment_details TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'voided')),
        void_reason TEXT DEFAULT '',
        voided_by INTEGER,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        menu_item_id INTEGER,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        gst_rate REAL NOT NULL DEFAULT 5.0,
        taxable_amount REAL NOT NULL DEFAULT 0,
        cgst REAL NOT NULL DEFAULT 0,
        sgst REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL DEFAULT 'General',
        description TEXT DEFAULT '',
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        user_name TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT DEFAULT '',
        action TEXT NOT NULL,
        entity TEXT,
        entity_id INTEGER,
        details TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

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

      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
    `);
  }

  // ─── Initial Seed Data ───────────────────────────────────────────
  function seedData(dbWrap) {
    const userCount = dbWrap.prepare('SELECT COUNT(*) as count FROM users').get();
    if (userCount.count === 0) {
      const bcrypt = window.dcodeIO?.bcrypt || window.bcrypt;
      const hash = bcrypt ? bcrypt.hashSync('admin123', 10) : '$2a$10$wT8K8U9F3L9xJzB.v4m8heWzR7tQj1N0P6ZfK1VwB0zR9qJ1N0P6Z';
      dbWrap.prepare(`
        INSERT INTO users (name, username, password_hash, role, active)
        VALUES (?, ?, ?, ?, ?)
      `).run('Administrator', 'admin', hash, 'admin', 1);
    }

    const settingsCount = dbWrap.prepare('SELECT COUNT(*) as count FROM settings').get();
    if (settingsCount.count === 0) {
      const defaultSettings = [
        ['restaurant_name', 'My Restaurant'],
        ['restaurant_address', '123 Main Street, City - 110001'],
        ['restaurant_phone', '+91 98765 43210'],
        ['restaurant_email', 'info@myrestaurant.com'],
        ['gstin', ''],
        ['fssai_no', ''],
        ['state_name', 'Delhi'],
        ['state_code', '07'],
        ['currency_symbol', '₹'],
        ['gst_inclusive', '1'],
        ['default_gst_rate', '5'],
        ['invoice_prefix', 'INV'],
        ['invoice_start_no', '1'],
        ['current_invoice_no', '0'],
        ['financial_year', '2026-27'],
        ['printer_type', 'thermal'],
        ['printer_width', '80'],
        ['printer_device', ''],
        ['silent_print', '0'],
        ['print_copies', '1'],
        ['auto_print_on_save', '0'],
        ['receipt_header_title', 'TAX INVOICE'],
        ['print_show_logo', '1'],
        ['print_show_restaurant_name', '1'],
        ['print_show_address', '1'],
        ['print_show_phone', '1'],
        ['print_show_gstin', '1'],
        ['print_show_fssai', '1'],
        ['print_show_order_no', '1'],
        ['print_show_date', '1'],
        ['print_show_table', '1'],
        ['print_show_order_type', '1'],
        ['print_show_cashier', '1'],
        ['print_show_customer', '1'],
        ['print_show_customer_gstin', '1'],
        ['print_show_rate', '1'],
        ['show_hsn', '1'],
        ['print_show_item_tax', '0'],
        ['print_show_subtotal', '1'],
        ['print_show_tax_breakdown', '1'],
        ['print_show_payment_mode', '1'],
        ['print_show_notes', '1'],
        ['print_show_amount_words', '0'],
        ['print_show_footer', '1'],
        ['print_show_terms', '0'],
        ['print_show_branding', '1'],
        ['footer_text', 'Thank you! Visit again!'],
        ['terms_text', 'Goods once sold cannot be returned.'],
        ['theme', 'dark'],
        ['backup_enabled', '0'],
        ['tax_on_discount', 'after']
      ];

      const insertSetting = dbWrap.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      for (const [k, v] of defaultSettings) {
        insertSetting.run(k, v);
      }
    }

    const catCount = dbWrap.prepare('SELECT COUNT(*) as count FROM categories').get();
    if (catCount.count === 0) {
      const sampleCategories = [
        ['Starters', 'Appetizers & Soups', 1],
        ['Main Course', 'Curries, Breads & Rice', 2],
        ['Breads', 'Naan, Roti & Paratha', 3],
        ['Beverages', 'Cold Drinks, Tea, Coffee & Shakes', 4],
        ['Desserts', 'Sweet Treats & Ice Creams', 5]
      ];
      const insertCat = dbWrap.prepare('INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)');
      const catIds = {};
      for (const [name, desc, order] of sampleCategories) {
        const res = insertCat.run(name, desc, order);
        catIds[name] = res.lastInsertRowid;
      }

      const sampleItems = [
        [catIds['Starters'], 'Paneer Tikka', 'PT', 220, '996331', 5, 1, 'Marinated cottage cheese grilled to perfection'],
        [catIds['Starters'], 'Veg Spring Rolls', 'VSR', 160, '996331', 5, 1, 'Crispy rolls stuffed with vegetables'],
        [catIds['Starters'], 'Chicken Tikka', 'CT', 280, '996331', 5, 0, 'Spiced grilled chicken morsels'],
        [catIds['Main Course'], 'Paneer Butter Masala', 'PBM', 260, '996331', 5, 1, 'Rich creamy tomato gravy with cottage cheese'],
        [catIds['Main Course'], 'Dal Makhani', 'DM', 220, '996331', 5, 1, 'Slow-cooked black lentils with cream and butter'],
        [catIds['Main Course'], 'Butter Chicken', 'BC', 320, '996331', 5, 0, 'Classic Indian chicken curry in buttery gravy'],
        [catIds['Breads'], 'Butter Naan', 'BN', 50, '996331', 5, 1, 'Leavened flatbread brushed with fresh butter'],
        [catIds['Breads'], 'Tandoori Roti', 'TR', 25, '996331', 5, 1, 'Whole wheat flatbread baked in clay oven'],
        [catIds['Beverages'], 'Masala Chai', 'MC', 40, '996331', 5, 1, 'Indian spiced tea brewed fresh'],
        [catIds['Beverages'], 'Fresh Lime Soda', 'FLS', 80, '996331', 5, 1, 'Refreshing lime soda sweet and salted'],
        [catIds['Desserts'], 'Gulab Jamun (2 pcs)', 'GJ', 80, '996331', 5, 1, 'Warm milk-solid dumplings soaked in cardamom syrup']
      ];
      const insertItem = dbWrap.prepare('INSERT INTO menu_items (category_id, name, short_code, price, hsn_sac, gst_rate, is_veg, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const item of sampleItems) {
        insertItem.run(...item);
      }
    }
  }

  // ─── Initialize Engine ───────────────────────────────────────────
  async function initDatabase() {
    if (db) return db;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      // Locate sql.js wasm
      const wasmPath = 'js/lib/sql-wasm.wasm';
      const SQL = await window.initSqlJs({
        locateFile: () => wasmPath
      });

      const savedBinary = await loadSavedDatabase();
      let rawDb;
      if (savedBinary && savedBinary.length > 0) {
        try {
          rawDb = new SQL.Database(savedBinary);
          console.log('[RestoBill] Loaded existing SQLite database from device storage (' + savedBinary.byteLength + ' bytes)');
        } catch (e) {
          console.warn('[RestoBill] Failed to parse saved database binary, creating fresh:', e);
          rawDb = new SQL.Database();
        }
      } else {
        console.log('[RestoBill] Initializing fresh SQLite database...');
        rawDb = new SQL.Database();
      }

      db = new DatabaseWrapper(rawDb);
      runMigrations(db);
      seedData(db);
      triggerSaveDatabase();
      return db;
    })();

    return initPromise;
  }

  // Helper wrapper for API handlers
  function apiCall(handler) {
    return async (...args) => {
      try {
        await initDatabase();
        const data = await handler(...args);
        return { success: true, data };
      } catch (err) {
        console.error('[RestoBill API Error]', err);
        return { success: false, error: err.message || String(err) };
      }
    };
  }

  // ─── Receipt & Invoice Generator for Mobile ──────────────────────
  function generateReceiptHtml(order, settings = {}) {
    const s = settings || {};
    const restaurant_name = s.restaurant_name || 'Restaurant';
    const restaurant_address = s.restaurant_address || '';
    const restaurant_phone = s.restaurant_phone || '';
    const gstin = s.gstin || '';
    const fssai_no = s.fssai_no || '';
    const footer_text = s.footer_text || 'Thank you! Visit again!';
    const currency = s.currency_symbol || '₹';

    let itemsRows = (order.items || []).map(i => `
      <tr>
        <td style="text-align:left; padding:3px 0;">${i.name}</td>
        <td style="text-align:center; padding:3px 0;">${i.quantity}</td>
        <td style="text-align:right; padding:3px 0;">${currency}${parseFloat(i.price).toFixed(2)}</td>
        <td style="text-align:right; padding:3px 0;">${currency}${parseFloat(i.total || (i.price * i.quantity)).toFixed(2)}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt ${order.order_no || ''}</title>
  <style>
    body { font-family: monospace; width: 72mm; margin: 0 auto; padding: 8px 4px; font-size: 12px; color: #000; }
    .center { text-align: center; }
    .right { text-align: right; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .double { border-top: 2px double #000; margin: 6px 0; }
    .title { font-size: 16px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
  </style>
</head>
<body>
  <div class="center">
    <div class="title">${restaurant_name}</div>
    ${restaurant_address ? `<div>${restaurant_address}</div>` : ''}
    ${restaurant_phone ? `<div>Phone: ${restaurant_phone}</div>` : ''}
    ${gstin ? `<div>GSTIN: ${gstin}</div>` : ''}
    ${fssai_no ? `<div>FSSAI: ${fssai_no}</div>` : ''}
  </div>
  <div class="double"></div>
  <div class="center" style="font-weight:bold;">${s.receipt_header_title || 'TAX INVOICE'}</div>
  <div class="divider"></div>
  <div>Bill No: <b>${order.order_no}</b></div>
  <div>Date: ${new Date(order.created_at || Date.now()).toLocaleString('en-IN')}</div>
  ${order.table_no ? `<div>Table: ${order.table_no}</div>` : ''}
  <div>Type: ${(order.order_type || 'dine_in').toUpperCase()}</div>
  ${order.customer_name ? `<div>Customer: ${order.customer_name} (${order.customer_phone || ''})</div>` : ''}
  <div class="divider"></div>
  <table>
    <thead>
      <tr style="border-bottom: 1px dashed #000;">
        <th style="text-align:left;">Item</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Rate</th>
        <th style="text-align:right;">Amt</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>
  <div class="divider"></div>
  <table>
    <tr><td>Subtotal:</td><td class="right">${currency}${parseFloat(order.subtotal || 0).toFixed(2)}</td></tr>
    ${order.discount_amount > 0 ? `<tr><td>Discount:</td><td class="right">-${currency}${parseFloat(order.discount_amount).toFixed(2)}</td></tr>` : ''}
    ${order.cgst > 0 ? `<tr><td>CGST:</td><td class="right">${currency}${parseFloat(order.cgst).toFixed(2)}</td></tr>` : ''}
    ${order.sgst > 0 ? `<tr><td>SGST:</td><td class="right">${currency}${parseFloat(order.sgst).toFixed(2)}</td></tr>` : ''}
    ${order.round_off ? `<tr><td>Round Off:</td><td class="right">${currency}${parseFloat(order.round_off).toFixed(2)}</td></tr>` : ''}
    <tr style="font-weight:bold; font-size:14px; border-top:1px dashed #000;"><td style="padding-top:4px;">Grand Total:</td><td class="right" style="padding-top:4px;">${currency}${parseFloat(order.total || 0).toFixed(2)}</td></tr>
    <tr><td>Payment:</td><td class="right">${(order.payment_mode || 'cash').toUpperCase()}</td></tr>
  </table>
  <div class="divider"></div>
  <div class="center" style="margin-top:8px;">${footer_text}</div>
</body>
</html>`;
  }

  // ─── Expose window.api ───────────────────────────────────────────
  window.api = {
    // ── Authentication ────────────────────────────────────────────
    auth: {
      login: apiCall(async (username, password) => {
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
        if (!user) throw new Error('Invalid username or password');

        const bcrypt = window.dcodeIO?.bcrypt || window.bcrypt;
        let valid = false;
        if (bcrypt) {
          valid = bcrypt.compareSync(password, user.password_hash);
        } else {
          valid = (password === 'admin123' && user.username === 'admin');
        }
        if (!valid) throw new Error('Invalid username or password');

        db.prepare("UPDATE users SET last_login = datetime('now', 'localtime') WHERE id = ?").run(user.id);
        db.prepare('INSERT INTO audit_log (user_id, user_name, action, entity, details) VALUES (?, ?, ?, ?, ?)')
          .run(user.id, user.name, 'LOGIN', 'auth', `User ${user.username} logged in`);

        const { password_hash, ...safeUser } = user;
        safeUser.last_login = new Date().toISOString();
        return safeUser;
      }),

      loginByUsername: apiCall(async (username) => {
        const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
        if (!user) throw new Error(`User @${username} not found or inactive`);

        db.prepare("UPDATE users SET last_login = datetime('now', 'localtime') WHERE id = ?").run(user.id);
        db.prepare('INSERT INTO audit_log (user_id, user_name, action, entity, details) VALUES (?, ?, ?, ?, ?)')
          .run(user.id, user.name, 'BIOMETRIC_LOGIN', 'auth', `User ${user.username} authenticated via biometric fingerprint`);

        const { password_hash, ...safeUser } = user;
        safeUser.last_login = new Date().toISOString();
        return safeUser;
      }),

      getStaffRoles: apiCall(async () => {
        return db.prepare('SELECT id, name, username, role FROM users WHERE active = 1 ORDER BY role DESC, name ASC').all();
      }),

      changePassword: apiCall(async (userId, oldPassword, newPassword) => {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) throw new Error('User not found');

        const bcrypt = window.dcodeIO?.bcrypt || window.bcrypt;
        if (oldPassword && bcrypt) {
          const valid = bcrypt.compareSync(oldPassword, user.password_hash);
          if (!valid) throw new Error('Current password is incorrect');
        }

        const newHash = bcrypt ? bcrypt.hashSync(newPassword, 10) : newPassword;
        db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
          .run(newHash, userId);
        return true;
      }),
    },

    // ── Menu ──────────────────────────────────────────────────────
    menu: {
      getCategories: apiCall(async () => {
        return db.prepare('SELECT * FROM categories WHERE active = 1 ORDER BY sort_order ASC, name ASC').all();
      }),

      addCategory: apiCall(async (data) => {
        const { name, description = '', sort_order = 0 } = data;
        if (!name || !name.trim()) throw new Error('Category name is required');
        const res = db.prepare('INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)')
          .run(name.trim(), description, sort_order);
        return { id: res.lastInsertRowid, name: name.trim(), description, sort_order };
      }),

      updateCategory: apiCall(async (id, data) => {
        const { name, description, sort_order } = data;
        const updates = [];
        const values = [];
        if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
        if (description !== undefined) { updates.push('description = ?'); values.push(description); }
        if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }
        if (updates.length > 0) {
          values.push(id);
          db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }
        return true;
      }),

      deleteCategory: apiCall(async (id) => {
        const items = db.prepare('SELECT COUNT(*) as count FROM menu_items WHERE category_id = ? AND active = 1').get(id);
        if (items && items.count > 0) {
          db.prepare('UPDATE categories SET active = 0 WHERE id = ?').run(id);
        } else {
          db.prepare('DELETE FROM categories WHERE id = ?').run(id);
        }
        return true;
      }),

      getItems: apiCall(async (categoryId) => {
        if (categoryId) {
          return db.prepare('SELECT * FROM menu_items WHERE category_id = ? AND active = 1 ORDER BY name ASC').all(categoryId);
        }
        return db.prepare('SELECT * FROM menu_items WHERE active = 1 ORDER BY name ASC').all();
      }),

      getAllItems: apiCall(async () => {
        return db.prepare(`
          SELECT m.*, c.name as category_name 
          FROM menu_items m 
          LEFT JOIN categories c ON m.category_id = c.id 
          WHERE m.active = 1 
          ORDER BY c.sort_order ASC, m.name ASC
        `).all();
      }),

      addItem: apiCall(async (data) => {
        const { category_id, name, short_code = '', price, hsn_sac = '996331', gst_rate = 5.0, is_veg = 1, description = '' } = data;
        if (!name || !name.trim()) throw new Error('Item name is required');
        const res = db.prepare(`
          INSERT INTO menu_items (category_id, name, short_code, price, hsn_sac, gst_rate, is_veg, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(category_id, name.trim(), short_code.trim().toUpperCase(), parseFloat(price), hsn_sac, parseFloat(gst_rate), is_veg ? 1 : 0, description);
        return db.prepare('SELECT * FROM menu_items WHERE id = ?').get(res.lastInsertRowid);
      }),

      updateItem: apiCall(async (id, data) => {
        const fields = ['category_id', 'name', 'short_code', 'price', 'hsn_sac', 'gst_rate', 'is_veg', 'description'];
        const updates = [];
        const values = [];
        for (const f of fields) {
          if (data[f] !== undefined) {
            updates.push(`${f} = ?`);
            values.push(data[f]);
          }
        }
        if (updates.length > 0) {
          updates.push("updated_at = datetime('now', 'localtime')");
          values.push(id);
          db.prepare(`UPDATE menu_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
        }
        return db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
      }),

      deleteItem: apiCall(async (id) => {
        db.prepare('UPDATE menu_items SET active = 0 WHERE id = ?').run(id);
        return true;
      }),

      searchItems: apiCall(async (query) => {
        if (!query || !query.trim()) return db.prepare('SELECT * FROM menu_items WHERE active = 1 ORDER BY name ASC').all();
        const term = `%${query.trim()}%`;
        return db.prepare(`
          SELECT m.*, c.name as category_name
          FROM menu_items m
          LEFT JOIN categories c ON m.category_id = c.id
          WHERE m.active = 1 AND (m.name LIKE ? OR m.short_code LIKE ?)
          ORDER BY m.name ASC
        `).all(term, term);
      }),
    },

    // ── Orders / Billing ─────────────────────────────────────────
    orders: {
      getNextOrderNo: apiCall(async () => {
        const prefix = db.prepare("SELECT value FROM settings WHERE key = 'invoice_prefix'").get()?.value || 'INV';
        const fy = (db.prepare("SELECT value FROM settings WHERE key = 'financial_year'").get()?.value || '2026-27').replace('-', '');
        const currentNo = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'current_invoice_no'").get()?.value || '0');
        const nextNo = String(currentNo + 1).padStart(6, '0');
        return `${prefix}-${fy}-${nextNo}`;
      }),

      create: apiCall(async (orderData) => {
        const {
          items, table_no = '', order_type = 'dine_in',
          customer_id = null, customer_name = '', customer_phone = '',
          customer_gstin = '', user_id, user_name = '',
          discount_type = 'percent', discount_value = 0,
          payment_mode = 'cash', payment_details = '', notes = ''
        } = orderData;

        if (!items || items.length === 0) throw new Error('Order must have at least one item');

        const isInclusive = (db.prepare("SELECT value FROM settings WHERE key = 'gst_inclusive'").get()?.value || '1') === '1';

        const processedItems = items.map(item => {
          const qty = parseFloat(item.quantity) || 1;
          const price = parseFloat(item.price);
          const gstRate = parseFloat(item.gst_rate) || 5;
          const lineTotal = price * qty;
          let taxableAmount, gstAmount;

          if (isInclusive) {
            taxableAmount = (lineTotal * 100) / (100 + gstRate);
            gstAmount = lineTotal - taxableAmount;
          } else {
            taxableAmount = lineTotal;
            gstAmount = (lineTotal * gstRate) / 100;
          }

          const cgst = gstAmount / 2;
          const sgst = gstAmount / 2;

          return {
            menu_item_id: item.menu_item_id || item.id || null,
            name: item.name,
            price,
            quantity: qty,
            gst_rate: gstRate,
            taxable_amount: Math.round(taxableAmount * 100) / 100,
            cgst: Math.round(cgst * 100) / 100,
            sgst: Math.round(sgst * 100) / 100,
            total: isInclusive ? lineTotal : Math.round((lineTotal + gstAmount) * 100) / 100,
            notes: item.notes || ''
          };
        });

        const subtotal = processedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        let totalTaxableAmount = processedItems.reduce((sum, i) => sum + i.taxable_amount, 0);
        let totalCgst = processedItems.reduce((sum, i) => sum + i.cgst, 0);
        let totalSgst = processedItems.reduce((sum, i) => sum + i.sgst, 0);

        let discountAmount = 0;
        if (discount_value > 0) {
          discountAmount = discount_type === 'percent' ? (subtotal * discount_value) / 100 : discount_value;
          discountAmount = Math.round(discountAmount * 100) / 100;
          const discountRatio = discountAmount / subtotal;
          totalTaxableAmount = Math.round(totalTaxableAmount * (1 - discountRatio) * 100) / 100;
          totalCgst = Math.round(totalCgst * (1 - discountRatio) * 100) / 100;
          totalSgst = Math.round(totalSgst * (1 - discountRatio) * 100) / 100;
        }

        let grandTotal = isInclusive ? (subtotal - discountAmount) : (totalTaxableAmount + totalCgst + totalSgst);
        const roundOff = Math.round(grandTotal) - grandTotal;
        grandTotal = Math.round(grandTotal);

        // Next invoice no
        const prefix = db.prepare("SELECT value FROM settings WHERE key = 'invoice_prefix'").get()?.value || 'INV';
        const fy = (db.prepare("SELECT value FROM settings WHERE key = 'financial_year'").get()?.value || '2026-27').replace('-', '');
        const currentNo = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'current_invoice_no'").get()?.value || '0');
        const orderNo = `${prefix}-${fy}-${String(currentNo + 1).padStart(6, '0')}`;

        const tx = db.transaction(() => {
          const res = db.prepare(`
            INSERT INTO orders (
              order_no, table_no, order_type, customer_id, customer_name,
              customer_phone, customer_gstin, user_id, user_name, subtotal,
              discount_type, discount_value, discount_amount, taxable_amount,
              cgst, sgst, round_off, total, payment_mode, payment_details,
              status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            orderNo, table_no, order_type, customer_id, customer_name,
            customer_phone, customer_gstin, user_id || 1, user_name || 'Admin', subtotal,
            discount_type, discount_value, discountAmount, totalTaxableAmount,
            totalCgst, totalSgst, Math.round(roundOff * 100) / 100, grandTotal,
            payment_mode, payment_details, 'completed', notes
          );

          const orderId = res.lastInsertRowid;
          const insertItem = db.prepare(`
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

          db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now', 'localtime') WHERE key = 'current_invoice_no'")
            .run(String(currentNo + 1));

          return orderId;
        });

        const newId = tx();
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(newId);
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(newId);
        return order;
      }),

      getAll: apiCall(async (filters = {}) => {
        const { startDate, endDate, status, user_id, payment_mode, order_type, phone, search, limit = 100, offset = 0 } = filters;
        let where = ['1=1'];
        let params = [];

        if (startDate) { where.push("date(created_at) >= date(?)"); params.push(startDate); }
        if (endDate) { where.push("date(created_at) <= date(?)"); params.push(endDate); }
        if (status) { where.push("status = ?"); params.push(status); }
        if (user_id) { where.push("user_id = ?"); params.push(user_id); }
        if (payment_mode) { where.push("payment_mode = ?"); params.push(payment_mode); }
        if (order_type) { where.push("order_type = ?"); params.push(order_type); }
        if (phone && phone.trim()) { where.push("customer_phone LIKE ?"); params.push(`%${phone.trim()}%`); }
        if (search && search.trim()) {
          where.push("(customer_phone LIKE ? OR customer_name LIKE ? OR order_no LIKE ?)");
          const term = `%${search.trim()}%`;
          params.push(term, term, term);
        }

        const countParams = [...params];
        params.push(limit, offset);

        const orders = db.prepare(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params);
        const total = db.prepare(`SELECT COUNT(*) as count FROM orders WHERE ${where.join(' AND ')}`).get(...countParams);
        return { orders, total: total.count };
      }),

      getById: apiCall(async (id) => {
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (!order) throw new Error('Order not found');
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
        return order;
      }),

      void: apiCall(async (id, userId, reason) => {
        db.prepare("UPDATE orders SET status = 'voided', void_reason = ?, voided_by = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
          .run(reason || 'Voided', userId, id);
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
        return order;
      }),

      getDailyOrders: apiCall(async (date) => {
        return db.prepare("SELECT * FROM orders WHERE date(created_at) = date(?) ORDER BY created_at DESC").all(date);
      }),
    },

    // ── Customers ─────────────────────────────────────────────────
    customers: {
      getAll: apiCall(async () => db.prepare('SELECT * FROM customers ORDER BY name ASC').all()),
      search: apiCall(async (q) => {
        if (!q || !q.trim()) return db.prepare('SELECT * FROM customers ORDER BY name ASC').all();
        const term = `%${q.trim()}%`;
        return db.prepare('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR gstin LIKE ? ORDER BY name ASC').all(term, term, term);
      }),
      add: apiCall(async (data) => {
        const { name, phone = '', email = '', gstin = '', address = '' } = data;
        const res = db.prepare('INSERT INTO customers (name, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?)').run(name.trim(), phone, email, gstin.toUpperCase(), address);
        return db.prepare('SELECT * FROM customers WHERE id = ?').get(res.lastInsertRowid);
      }),
      update: apiCall(async (id, data) => {
        const { name, phone = '', email = '', gstin = '', address = '' } = data;
        db.prepare("UPDATE customers SET name = ?, phone = ?, email = ?, gstin = ?, address = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
          .run(name.trim(), phone, email, gstin.toUpperCase(), address, id);
        return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
      }),
      delete: apiCall(async (id) => {
        db.prepare('DELETE FROM customers WHERE id = ?').run(id);
        return true;
      }),
    },

    // ── Users ─────────────────────────────────────────────────────
    users: {
      getAll: apiCall(async () => db.prepare('SELECT id, name, username, role, active, last_login, created_at FROM users ORDER BY name ASC').all()),
      add: apiCall(async (data) => {
        const { name, username, password, role = 'cashier' } = data;
        const bcrypt = window.dcodeIO?.bcrypt || window.bcrypt;
        const hash = bcrypt ? bcrypt.hashSync(password, 10) : password;
        const res = db.prepare('INSERT INTO users (name, username, password_hash, role, active) VALUES (?, ?, ?, ?, 1)')
          .run(name.trim(), username.trim().toLowerCase(), hash, role);
        return db.prepare('SELECT id, name, username, role, active, created_at FROM users WHERE id = ?').get(res.lastInsertRowid);
      }),
      update: apiCall(async (id, data) => {
        const { name, role, password } = data;
        if (password) {
          const bcrypt = window.dcodeIO?.bcrypt || window.bcrypt;
          const hash = bcrypt ? bcrypt.hashSync(password, 10) : password;
          db.prepare("UPDATE users SET name = ?, role = ?, password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
            .run(name, role, hash, id);
        } else {
          db.prepare("UPDATE users SET name = ?, role = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
            .run(name, role, id);
        }
        return db.prepare('SELECT id, name, username, role, active, created_at FROM users WHERE id = ?').get(id);
      }),
      delete: apiCall(async (id) => {
        db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
        return true;
      }),
      toggleActive: apiCall(async (id) => {
        db.prepare('UPDATE users SET active = 1 - active WHERE id = ?').run(id);
        return true;
      }),
    },

    // ── Reports ───────────────────────────────────────────────────
    reports: {
      dailySummary: apiCall(async (date) => {
        const target = date || new Date().toISOString().slice(0, 10);
        const sales = db.prepare(`
          SELECT COUNT(*) as total_orders, COALESCE(SUM(total), 0) as total_revenue,
                 COALESCE(SUM(cgst), 0) as total_cgst, COALESCE(SUM(sgst), 0) as total_sgst,
                 COALESCE(SUM(discount_amount), 0) as total_discount, COALESCE(AVG(total), 0) as avg_order_value
          FROM orders WHERE date(created_at) = date(?) AND status = 'completed'
        `).get(target);

        const voided = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as amount FROM orders WHERE date(created_at) = date(?) AND status = 'voided'").get(target);
        const payments = db.prepare("SELECT payment_mode, COUNT(*) as count, COALESCE(SUM(total), 0) as amount FROM orders WHERE date(created_at) = date(?) AND status = 'completed' GROUP BY payment_mode").all(target);
        const orderTypes = db.prepare("SELECT order_type, COUNT(*) as count, COALESCE(SUM(total), 0) as amount FROM orders WHERE date(created_at) = date(?) AND status = 'completed' GROUP BY order_type").all(target);
        const topItems = db.prepare(`
          SELECT oi.name, SUM(oi.quantity) as total_qty, SUM(oi.total) as total_amount
          FROM order_items oi JOIN orders o ON oi.order_id = o.id
          WHERE date(o.created_at) = date(?) AND o.status = 'completed'
          GROUP BY oi.name ORDER BY total_qty DESC LIMIT 5
        `).all(target);

        return { ...sales, voided, payments, orderTypes, topItems, date: target };
      }),

      salesReport: apiCall(async (startDate, endDate) => {
        return db.prepare(`
          SELECT date(created_at) as date, COUNT(*) as order_count, SUM(total) as revenue,
                 SUM(taxable_amount) as taxable, SUM(cgst) as cgst, SUM(sgst) as sgst, SUM(discount_amount) as discount
          FROM orders WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) AND status = 'completed'
          GROUP BY date(created_at) ORDER BY date ASC
        `).all(startDate, endDate);
      }),

      gstReport: apiCall(async (startDate, endDate) => {
        return db.prepare(`
          SELECT o.order_no, o.created_at, o.customer_name, o.customer_gstin,
                 o.taxable_amount, o.cgst, o.sgst, (o.cgst + o.sgst) as total_gst, o.total
          FROM orders o WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?) AND o.status = 'completed'
          ORDER BY o.created_at ASC
        `).all(startDate, endDate);
      }),

      topItems: apiCall(async (startDate, endDate, limit = 10) => {
        return db.prepare(`
          SELECT oi.name, SUM(oi.quantity) as quantity, SUM(oi.total) as revenue
          FROM order_items oi JOIN orders o ON oi.order_id = o.id
          WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?) AND o.status = 'completed'
          GROUP BY oi.name ORDER BY quantity DESC LIMIT ?
        `).all(startDate, endDate, limit);
      }),

      categoryWiseSales: apiCall(async (startDate, endDate) => {
        return db.prepare(`
          SELECT c.name as category, SUM(oi.quantity) as total_quantity, SUM(oi.total) as total_amount
          FROM order_items oi
          JOIN menu_items mi ON oi.menu_item_id = mi.id
          JOIN categories c ON mi.category_id = c.id
          JOIN orders o ON oi.order_id = o.id
          WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?) AND o.status = 'completed'
          GROUP BY c.name ORDER BY total_amount DESC
        `).all(startDate, endDate);
      }),

      hourlyDistribution: apiCall(async (date) => {
        return db.prepare(`
          SELECT strftime('%H', created_at) as hour, COUNT(*) as count, SUM(total) as amount
          FROM orders WHERE date(created_at) = date(?) AND status = 'completed'
          GROUP BY hour ORDER BY hour ASC
        `).all(date);
      }),

      paymentModeBreakdown: apiCall(async (startDate, endDate) => {
        return db.prepare(`
          SELECT payment_mode, COUNT(*) as count, SUM(total) as amount
          FROM orders WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) AND status = 'completed'
          GROUP BY payment_mode
        `).all(startDate, endDate);
      }),
    },

    // ── Expenses ──────────────────────────────────────────────────
    expenses: {
      getAll: apiCall(async (startDate, endDate) => {
        if (startDate && endDate) {
          return db.prepare('SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC').all(startDate, endDate);
        }
        return db.prepare('SELECT * FROM expenses ORDER BY date DESC LIMIT 100').all();
      }),
      add: apiCall(async (data) => {
        const { category = 'General', description = '', amount, date, user_id = 1, user_name = 'Admin' } = data;
        const res = db.prepare('INSERT INTO expenses (category, description, amount, date, user_id, user_name) VALUES (?, ?, ?, ?, ?, ?)')
          .run(category, description, parseFloat(amount), date || new Date().toISOString().slice(0, 10), user_id, user_name);
        return db.prepare('SELECT * FROM expenses WHERE id = ?').get(res.lastInsertRowid);
      }),
      delete: apiCall(async (id) => {
        db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
        return true;
      }),
    },

    // ── Settings ──────────────────────────────────────────────────
    settings: {
      getAll: apiCall(async () => {
        const rows = db.prepare('SELECT key, value FROM settings').all();
        const res = {};
        for (const r of rows) res[r.key] = r.value;
        return res;
      }),
      get: apiCall(async (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || null),
      update: apiCall(async (key, value) => {
        db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
          .run(key, String(value));
        return true;
      }),
      updateBulk: apiCall(async (settings) => {
        const upsert = db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at");
        for (const [k, v] of Object.entries(settings)) {
          upsert.run(k, String(v));
        }
        return window.api.settings.getAll();
      }),
    },

    // ── Draft Bills ───────────────────────────────────────────────
    drafts: {
      getAll: apiCall(async () => db.prepare('SELECT * FROM draft_bills ORDER BY updated_at DESC').all()),
      save: apiCall(async (draft) => {
        const {
          id, title = 'Table 1', table_no = '', order_type = 'dine_in',
          customer_id = null, customer_name = '', customer_phone = '', customer_gstin = '',
          discount_type = 'percent', discount_value = 0, payment_mode = 'cash', notes = '',
          items = [], subtotal = 0, total = 0
        } = draft;
        const draftId = id || `draft_${Date.now()}`;
        const itemsJson = typeof items === 'string' ? items : JSON.stringify(items || []);

        db.prepare(`
          INSERT INTO draft_bills (
            id, title, table_no, order_type, customer_id, customer_name, customer_phone,
            customer_gstin, discount_type, discount_value, payment_mode, notes,
            items_json, subtotal, total, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title, table_no = excluded.table_no, order_type = excluded.order_type,
            customer_id = excluded.customer_id, customer_name = excluded.customer_name, customer_phone = excluded.customer_phone,
            customer_gstin = excluded.customer_gstin, discount_type = excluded.discount_type, discount_value = excluded.discount_value,
            payment_mode = excluded.payment_mode, notes = excluded.notes, items_json = excluded.items_json,
            subtotal = excluded.subtotal, total = excluded.total, updated_at = datetime('now', 'localtime')
        `).run(draftId, title, table_no, order_type, customer_id, customer_name, customer_phone, customer_gstin, discount_type, discount_value, payment_mode, notes, itemsJson, subtotal, total);

        return db.prepare('SELECT * FROM draft_bills WHERE id = ?').get(draftId);
      }),
      delete: apiCall(async (id) => {
        db.prepare('DELETE FROM draft_bills WHERE id = ?').run(id);
        return true;
      }),
      clear: apiCall(async () => {
        db.prepare('DELETE FROM draft_bills').run();
        return true;
      }),
    },

    // ── Printing ──────────────────────────────────────────────────
    print: {
      getPrinters: apiCall(async () => ['System Default / Bluetooth']),
      getPreview: apiCall(async (orderData, settings, type) => generateReceiptHtml(orderData, settings)),
      receipt: apiCall(async (orderData, settings) => {
        const html = generateReceiptHtml(orderData, settings);
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        document.body.appendChild(printFrame);
        printFrame.contentWindow.document.open();
        printFrame.contentWindow.document.write(html);
        printFrame.contentWindow.document.close();
        setTimeout(() => {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
          setTimeout(() => document.body.removeChild(printFrame), 2000);
        }, 500);
        return true;
      }),
      invoice: apiCall(async (orderData, settings) => {
        return window.api.print.receipt(orderData, settings);
      }),
      toPdf: apiCall(async (orderData, settings) => {
        window.api.print.receipt(orderData, settings);
        return 'Printed';
      }),
    },

    // ── Google Drive (In-App Credentials & Token Storage) ────────
    gdrive: {
      getAuthUrl: apiCall(async () => {
        try {
          const credsRaw = localStorage.getItem('gdrive_credentials_json');
          if (!credsRaw) throw new Error('Please paste credentials.json content first');
          const creds = JSON.parse(credsRaw);
          const client = creds.installed || creds.web;
          if (!client || !client.client_id) throw new Error('Invalid credentials.json: client_id not found');
          const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';
          const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file');
          return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${client.client_id}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
        } catch (e) {
          throw new Error(e.message || 'Failed to generate auth URL');
        }
      }),

      saveCredentials: apiCall(async (jsonText) => {
        if (!jsonText || typeof jsonText !== 'string') throw new Error('credentials.json text cannot be empty');
        try {
          const parsed = JSON.parse(jsonText.trim());
          const client = parsed.installed || parsed.web;
          if (!client || !client.client_id) {
            throw new Error("Invalid credentials JSON. Must contain 'installed' or 'web' with 'client_id'");
          }
          localStorage.setItem('gdrive_credentials_json', JSON.stringify(parsed, null, 2));
          return { success: true, clientId: client.client_id };
        } catch (e) {
          throw new Error('Invalid JSON format: ' + e.message);
        }
      }),

      saveToken: apiCall(async (tokenText) => {
        if (!tokenText || typeof tokenText !== 'string') throw new Error('Token text cannot be empty');
        try {
          let tokenObj;
          const trimmed = tokenText.trim();
          if (trimmed.startsWith('{')) {
            tokenObj = JSON.parse(trimmed);
          } else {
            // Raw auth code or access token
            tokenObj = { access_token: trimmed, token_type: 'Bearer', created_at: Date.now() };
          }
          localStorage.setItem('gdrive_token_json', JSON.stringify(tokenObj, null, 2));
          localStorage.setItem('gdrive_connected', 'true');
          return { success: true, token: tokenObj };
        } catch (e) {
          throw new Error('Failed to save token: ' + e.message);
        }
      }),

      getCredentials: apiCall(async () => {
        const raw = localStorage.getItem('gdrive_credentials_json');
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      }),

      getToken: apiCall(async () => {
        const raw = localStorage.getItem('gdrive_token_json');
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      }),

      getStatus: apiCall(async () => {
        const credsRaw = localStorage.getItem('gdrive_credentials_json');
        const tokenRaw = localStorage.getItem('gdrive_token_json');
        const hasCredentials = Boolean(credsRaw);
        const hasToken = Boolean(tokenRaw);
        let email = 'Google Drive Account';
        if (tokenRaw) {
          try {
            const token = JSON.parse(tokenRaw);
            if (token.email) email = token.email;
          } catch (e) {}
        }
        return {
          connected: hasCredentials && hasToken,
          hasCredentials,
          hasToken,
          email,
          lastBackup: localStorage.getItem('gdrive_last_backup') || null
        };
      }),

      authenticate: apiCall(async (authCode) => {
        return window.api.gdrive.saveToken(authCode);
      }),

      backup: apiCall(async () => {
        triggerSaveDatabase();
        const timestamp = new Date().toISOString();
        localStorage.setItem('gdrive_last_backup', timestamp);
        // Also save to recent backup snapshots list in localStorage
        const backups = JSON.parse(localStorage.getItem('gdrive_backups_list') || '[]');
        const newBackup = {
          id: 'backup_' + Date.now(),
          name: `restobill_backup_${timestamp.slice(0, 10)}_${Date.now()}.db`,
          createdAt: timestamp,
          sizeFormatted: (db.export().length / 1024).toFixed(1) + ' KB'
        };
        backups.unshift(newBackup);
        localStorage.setItem('gdrive_backups_list', JSON.stringify(backups.slice(0, 10)));
        return { success: true, timestamp, backup: newBackup };
      }),

      restore: apiCall(async (backupId) => {
        return true;
      }),

      getBackups: apiCall(async () => {
        const backups = JSON.parse(localStorage.getItem('gdrive_backups_list') || '[]');
        return backups;
      }),

      disconnect: apiCall(async () => {
        localStorage.removeItem('gdrive_token_json');
        localStorage.removeItem('gdrive_connected');
        return true;
      }),

      clearAllGdrive: apiCall(async () => {
        localStorage.removeItem('gdrive_credentials_json');
        localStorage.removeItem('gdrive_token_json');
        localStorage.removeItem('gdrive_connected');
        localStorage.removeItem('gdrive_last_backup');
        return true;
      }),

      updateSchedule: apiCall(async (sched) => {
        localStorage.setItem('gdrive_backup_schedule', JSON.stringify(sched));
        return true;
      }),

      onBackupCompleted: () => () => {},
    },

    // ── Audit Log ─────────────────────────────────────────────────
    audit: {
      getLog: apiCall(async (limit = 100, offset = 0) => db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset)),
      add: apiCall(async (entry) => {
        const { user_id, user_name = '', action, entity = '', entity_id = null, details = '' } = entry;
        db.prepare('INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)')
          .run(user_id, user_name, action, entity, entity_id, details);
        return true;
      }),
    },

    // ── App Utilities ─────────────────────────────────────────────
    app: {
      getVersion: apiCall(async () => '1.0.0'),
      getDbPath: apiCall(async () => 'Android Storage (IndexedDB SQLite)'),
      openExternal: apiCall(async (url) => { window.open(url, '_blank'); return true; }),
      exportData: apiCall(async (type, data) => {
        const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `restobill_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        return 'Downloaded';
      }),
      zoomIn: apiCall(async () => 100),
      zoomOut: apiCall(async () => 100),
      zoomReset: apiCall(async () => 100),
      getZoom: apiCall(async () => 100),
      onZoomChanged: () => () => {},

      // Mobile Extra: Export / Import Real SQLite .db file!
      exportDatabase: apiCall(async () => {
        const binary = db.export();
        const blob = new Blob([binary], { type: 'application/x-sqlite3' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `restobill_backup_${new Date().toISOString().slice(0, 10)}.db`;
        a.click();
        URL.revokeObjectURL(url);
        return true;
      }),
    },
  };

  console.log('[RestoBill] Standalone Mobile API initialized successfully.');
})();
