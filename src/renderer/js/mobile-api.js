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
  let sqlEngine = null;
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

  function getLocalDateString(d = new Date()) {
    const dateObj = (d instanceof Date) ? d : new Date(d);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function sanitizeVal(v) {
    if (v === undefined || v === null) return null;
    return v;
  }

  function sanitizeParams(params) {
    if (!params || params.length === 0) return [];
    if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0])) {
      const obj = {};
      for (const [k, v] of Object.entries(params[0])) {
        obj[k] = sanitizeVal(v);
      }
      return obj;
    }
    const flattened = (params.length === 1 && Array.isArray(params[0])) ? params[0] : params;
    return flattened.map(p => sanitizeVal(p));
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
          const clean = sanitizeParams(params);
          let stmt;
          try {
            stmt = self.raw.prepare(sql);
            if ((Array.isArray(clean) && clean.length > 0) || (!Array.isArray(clean) && Object.keys(clean).length > 0)) {
              stmt.bind(clean);
            }
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
          const clean = sanitizeParams(params);
          let stmt;
          try {
            stmt = self.raw.prepare(sql);
            if ((Array.isArray(clean) && clean.length > 0) || (!Array.isArray(clean) && Object.keys(clean).length > 0)) {
              stmt.bind(clean);
            }
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
          const clean = sanitizeParams(params);
          if ((Array.isArray(clean) && clean.length > 0) || (!Array.isArray(clean) && Object.keys(clean).length > 0)) {
            self.raw.run(sql, clean);
          } else {
            self.raw.run(sql);
          }
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
        ['tax_on_discount', 'after'],
        ['require_login', '1']
      ];

      const insertSetting = dbWrap.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
      for (const [k, v] of defaultSettings) {
        insertSetting.run(k, v);
      }
    }

    // Ensure require_login always exists even if database was created previously
    try {
      dbWrap.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('require_login', '1')").run();
    } catch (e) {}

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
      sqlEngine = SQL;

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

  // ── Google Drive Helper & Bundled Credentials ────────────────
  // Runtime decoded default credentials
  const _dx = arr => arr.map(c => String.fromCharCode(c ^ 42)).join('');
  const _gCId = _dx([27,19,24,30,28,29,29,30,24,27,29,30,7,65,69,78,88,68,79,64,75,24,64,31,76,79,78,19,29,69,25,71,29,88,67,65,73,77,73,91,76,64,31,71,29,4,75,90,90,89,4,77,69,69,77,70,79,95,89,79,88,73,69,68,94,79,68,94,4,73,69,71]);
  const _gCSecret = _dx([109,101,105,121,122,114,7,126,112,99,83,108,71,122,68,115,127,115,24,77,114,76,111,69,90,97,73,111,66,82,69,94,104,77,19]);
  const DEFAULT_GDRIVE_CREDS = {
    installed: {
      client_id: _gCId,
      project_id: 'restobill-512508',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_secret: _gCSecret,
      redirect_uris: ['http://localhost']
    }
  };

  function getStoredGdriveCreds() {
    const credsRaw = localStorage.getItem('gdrive_credentials_json');
    if (credsRaw) {
      try {
        const parsed = JSON.parse(credsRaw);
        const cid = parsed?.installed?.client_id || parsed?.web?.client_id;
        // If stored client_id is old project, upgrade to new restobill-512508 credentials
        if (cid && cid.startsWith('529168276033')) {
          localStorage.setItem('gdrive_credentials_json', JSON.stringify(DEFAULT_GDRIVE_CREDS, null, 2));
          return DEFAULT_GDRIVE_CREDS;
        }
        if (cid) return parsed;
      } catch (e) {}
    }
    return DEFAULT_GDRIVE_CREDS;
  }

  function getStoredGdriveTokenObj() {
    if (localStorage.getItem('gdrive_disconnected') === 'true') {
      return null;
    }
    const raw = localStorage.getItem('gdrive_token_json');
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        // If this token was for the old rahul.astrorock account or old project, clear it
        if (obj?.email === 'rahul.astrorock@gmail.com' || (obj?.refresh_token && obj.refresh_token.includes('0g47L5dZBwAeFCgYIARAAGBASNwF'))) {
          localStorage.removeItem('gdrive_token_json');
          localStorage.removeItem('gdrive_connected');
          return null;
        }
        if (obj.refresh_token || (obj.access_token && !obj.access_token.startsWith('4/'))) {
          return obj;
        }
      } catch (e) {}
    }
    return null;
  }

  async function getOrCreateBackupFolder(accessToken) {
    // 1. Check if folder ID is already stored in localStorage
    const savedFolderId = localStorage.getItem('gdrive_folder_id');
    if (savedFolderId) {
      try {
        const check = await fetch(`https://www.googleapis.com/drive/v3/files/${savedFolderId}?fields=id,name,trashed,webViewLink`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (check.ok) {
          const folderData = await check.json();
          if (!folderData.trashed) return savedFolderId;
        }
      } catch (e) {}
    }

    // 2. Search for existing 'RestoBill_Backups' folder in the user's Google Drive
    try {
      const search = await fetch("https://www.googleapis.com/drive/v3/files?q=name='RestoBill_Backups'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name,webViewLink)", {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (search.ok) {
        const sData = await search.json();
        if (sData.files && sData.files.length > 0) {
          const foundId = sData.files[0].id;
          localStorage.setItem('gdrive_folder_id', foundId);
          if (sData.files[0].webViewLink) {
            localStorage.setItem('gdrive_folder_url', sData.files[0].webViewLink);
          }
          return foundId;
        }
      }
    } catch (e) {}

    // 3. Create 'RestoBill_Backups' folder if not existing
    try {
      const createResp = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
          name: 'RestoBill_Backups',
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      if (createResp.ok) {
        const cData = await createResp.json();
        localStorage.setItem('gdrive_folder_id', cData.id);
        if (cData.webViewLink) {
          localStorage.setItem('gdrive_folder_url', cData.webViewLink);
        }
        // Grant reader permissions so anyone with the link can view
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${cData.id}/permissions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          });
        } catch (e) {}
        return cData.id;
      }
    } catch (e) {}

    return 'root';
  }

  async function getValidGdriveToken() {
    let tokenObj = getStoredGdriveTokenObj();
    if (!tokenObj) return null;

    if (tokenObj.access_token && !tokenObj.access_token.startsWith('4/')) {
      if (tokenObj.expires_at && tokenObj.expires_at > Date.now() + 60000) {
        return tokenObj.access_token;
      }
    }

    const creds = getStoredGdriveCreds();
    const client = creds.installed || creds.web || {};
    const redirectUri = (client.redirect_uris && client.redirect_uris[0]) || 'http://localhost';

    if (client.client_id && client.client_secret && (tokenObj.refresh_token || (tokenObj.access_token && tokenObj.access_token.startsWith('4/')))) {
      try {
        const bodyParams = tokenObj.refresh_token ? {
          client_id: client.client_id,
          client_secret: client.client_secret,
          refresh_token: tokenObj.refresh_token,
          grant_type: 'refresh_token'
        } : {
          client_id: client.client_id,
          client_secret: client.client_secret,
          code: tokenObj.access_token,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        };

        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(bodyParams)
        });

        if (tokenResp.ok) {
          const data = await tokenResp.json();
          tokenObj.access_token = data.access_token;
          if (data.refresh_token) tokenObj.refresh_token = data.refresh_token;
          tokenObj.expires_at = Date.now() + ((data.expires_in || 3600) * 1000);

          // Fetch user profile email
          try {
            const aboutResp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
              headers: { 'Authorization': `Bearer ${data.access_token}` }
            });
            if (aboutResp.ok) {
              const aboutData = await aboutResp.json();
              if (aboutData?.user?.emailAddress) {
                tokenObj.email = aboutData.user.emailAddress;
              }
            }
          } catch (ignore) {}

          localStorage.removeItem('gdrive_disconnected');
          localStorage.setItem('gdrive_token_json', JSON.stringify(tokenObj, null, 2));
          localStorage.setItem('gdrive_connected', 'true');
          return tokenObj.access_token;
        } else {
          const errTxt = await tokenResp.text();
          console.warn('[RestoBill] GDrive token refresh error:', errTxt);
        }
      } catch (err) {
        console.warn('[RestoBill] GDrive token network error:', err);
      }
    }

    return (tokenObj.access_token && !tokenObj.access_token.startsWith('4/')) ? tokenObj.access_token : null;
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

      getAll: apiCall(async () => {
        return db.prepare(`
          SELECT m.*, c.name as category_name 
          FROM menu_items m 
          LEFT JOIN categories c ON m.category_id = c.id 
          WHERE m.active = 1 
          ORDER BY c.sort_order ASC, m.name ASC
        `).all();
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

      update: apiCall(async (id, orderData) => {
        const {
          items, table_no = '', order_type = 'dine_in',
          customer_id = null, customer_name = '', customer_phone = '',
          customer_gstin = '', user_id, user_name = '',
          discount_type = 'percent', discount_value = 0,
          payment_mode = 'cash', payment_details = '', notes = ''
        } = orderData;

        if (!items || items.length === 0) throw new Error('Order must have at least one item');

        const existingOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (!existingOrder) throw new Error('Order not found');
        if (existingOrder.status === 'voided') throw new Error('Cannot edit a deleted/voided order');

        const isInclusive = (db.prepare("SELECT value FROM settings WHERE key = 'gst_inclusive'").get()?.value || '1') === '1';

        const processedItems = items.map(item => {
          const qty = parseFloat(item.quantity) || 1;
          const price = parseFloat(item.price);
          const gstRate = parseFloat(item.gst_rate !== undefined ? item.gst_rate : 5);
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
        const discVal = parseFloat(discount_value) || 0;
        if (discVal > 0) {
          discountAmount = discount_type === 'percent' ? (subtotal * discVal) / 100 : discVal;
          discountAmount = Math.round(discountAmount * 100) / 100;
          const discountRatio = subtotal > 0 ? (discountAmount / subtotal) : 0;
          totalTaxableAmount = Math.round(totalTaxableAmount * (1 - discountRatio) * 100) / 100;
          totalCgst = Math.round(totalCgst * (1 - discountRatio) * 100) / 100;
          totalSgst = Math.round(totalSgst * (1 - discountRatio) * 100) / 100;
        }

        let grandTotal = isInclusive ? (subtotal - discountAmount) : (totalTaxableAmount + totalCgst + totalSgst);
        const roundOff = Math.round(grandTotal) - grandTotal;
        grandTotal = Math.round(grandTotal);

        const tx = db.transaction(() => {
          db.prepare(`
            UPDATE orders SET
              table_no = ?, order_type = ?, customer_id = ?, customer_name = ?,
              customer_phone = ?, customer_gstin = ?, subtotal = ?,
              discount_type = ?, discount_value = ?, discount_amount = ?, taxable_amount = ?,
              cgst = ?, sgst = ?, round_off = ?, total = ?, payment_mode = ?,
              payment_details = ?, notes = ?, updated_at = datetime('now', 'localtime')
            WHERE id = ?
          `).run(
            table_no, order_type, customer_id, customer_name,
            customer_phone, customer_gstin, subtotal,
            discount_type, discVal, discountAmount, totalTaxableAmount,
            totalCgst, totalSgst, Math.round(roundOff * 100) / 100, grandTotal,
            payment_mode, payment_details, notes, id
          );

          db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);

          const insertItem = db.prepare(`
            INSERT INTO order_items (
              order_id, menu_item_id, name, price, quantity,
              gst_rate, taxable_amount, cgst, sgst, total, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const item of processedItems) {
            insertItem.run(
              id, item.menu_item_id, item.name, item.price, item.quantity,
              item.gst_rate, item.taxable_amount, item.cgst, item.sgst, item.total, item.notes
            );
          }
        });

        tx();

        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
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
        const targetDate = date || getLocalDateString();

        // Total sales
        const sales = db.prepare(`
          SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(total), 0) as total_revenue,
            COALESCE(SUM(cgst), 0) as total_cgst,
            COALESCE(SUM(sgst), 0) as total_sgst,
            COALESCE(SUM(discount_amount), 0) as total_discount,
            COALESCE(AVG(total), 0) as avg_order_value
          FROM orders 
          WHERE date(created_at) = date(?) AND status = 'completed'
        `).get(targetDate) || {};

        // Voided orders
        const voided = db.prepare(`
          SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as amount
          FROM orders 
          WHERE date(created_at) = date(?) AND status = 'voided'
        `).get(targetDate) || { count: 0, amount: 0 };

        // Payment breakdown
        const payments = db.prepare(`
          SELECT payment_mode, COUNT(*) as count, COALESCE(SUM(total), 0) as amount
          FROM orders 
          WHERE date(created_at) = date(?) AND status = 'completed'
          GROUP BY payment_mode
        `).all(targetDate) || [];

        // Order type breakdown
        const orderTypes = db.prepare(`
          SELECT order_type, COUNT(*) as count, COALESCE(SUM(total), 0) as amount
          FROM orders 
          WHERE date(created_at) = date(?) AND status = 'completed'
          GROUP BY order_type
        `).all(targetDate) || [];

        // Top 5 items today
        const topItems = db.prepare(`
          SELECT oi.name, SUM(oi.quantity) as total_qty, SUM(oi.total) as total_amount
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE date(o.created_at) = date(?) AND o.status = 'completed'
          GROUP BY oi.name
          ORDER BY total_qty DESC
          LIMIT 5
        `).all(targetDate) || [];

        // Today's expenses
        const expenses = db.prepare(`
          SELECT COALESCE(SUM(amount), 0) as total
          FROM expenses WHERE date = ?
        `).get(targetDate) || { total: 0 };

        // Comparison with yesterday
        const yesterdayObj = new Date(targetDate);
        yesterdayObj.setDate(yesterdayObj.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterdayObj);

        const yesterdaySales = db.prepare(`
          SELECT COALESCE(SUM(total), 0) as total_revenue, COUNT(*) as total_orders
          FROM orders 
          WHERE date(created_at) = date(?) AND status = 'completed'
        `).get(yesterdayStr) || { total_revenue: 0, total_orders: 0 };

        const totalRevenue = Number(sales.total_revenue || 0);
        const totalOrders = Number(sales.total_orders || 0);
        const yestRevenue = Number(yesterdaySales.total_revenue || 0);
        const yestOrders = Number(yesterdaySales.total_orders || 0);
        const expensesTotal = Number(expenses.total || 0);

        return {
          date: targetDate,
          sales: {
            total_orders: totalOrders,
            total_revenue: totalRevenue,
            total_cgst: Number(sales.total_cgst || 0),
            total_sgst: Number(sales.total_sgst || 0),
            total_discount: Number(sales.total_discount || 0),
            avg_order_value: Math.round(Number(sales.avg_order_value || 0) * 100) / 100
          },
          comparison: {
            yesterday_revenue: yestRevenue,
            yesterday_orders: yestOrders,
            revenue_change: totalRevenue - yestRevenue,
            order_change: totalOrders - yestOrders
          },
          voided,
          payments,
          orderTypes,
          topItems,
          expenses: expensesTotal,
          netRevenue: totalRevenue - expensesTotal
        };
      }),

      salesReport: apiCall(async (startDate, endDate) => {
        const dailySales = db.prepare(`
          SELECT 
            date(created_at) as date,
            COUNT(*) as orders,
            COALESCE(SUM(total), 0) as revenue,
            COALESCE(SUM(cgst + sgst), 0) as gst_collected,
            COALESCE(SUM(discount_amount), 0) as discounts,
            COALESCE(AVG(total), 0) as avg_order
          FROM orders 
          WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) AND status = 'completed'
          GROUP BY date(created_at)
          ORDER BY date(created_at) ASC
        `).all(startDate, endDate) || [];

        const totals = db.prepare(`
          SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(total), 0) as total_revenue,
            COALESCE(SUM(cgst), 0) as total_cgst,
            COALESCE(SUM(sgst), 0) as total_sgst,
            COALESCE(SUM(discount_amount), 0) as total_discounts,
            COALESCE(AVG(total), 0) as avg_order_value
          FROM orders 
          WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) AND status = 'completed'
        `).get(startDate, endDate) || {};

        return { dailySales, totals };
      }),

      gstReport: apiCall(async (startDate, endDate) => {
        // GST summary by rate
        const byRate = db.prepare(`
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
          WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?) AND o.status = 'completed'
          GROUP BY oi.gst_rate
          ORDER BY oi.gst_rate ASC
        `).all(startDate, endDate) || [];

        // HSN-wise summary
        const byHsn = db.prepare(`
          SELECT 
            COALESCE(mi.hsn_sac, '996331') as hsn_sac,
            oi.gst_rate,
            COALESCE(SUM(oi.quantity), 0) as total_quantity,
            COALESCE(SUM(oi.taxable_amount), 0) as taxable_value,
            COALESCE(SUM(oi.cgst), 0) as cgst,
            COALESCE(SUM(oi.sgst), 0) as sgst,
            COALESCE(SUM(oi.total), 0) as total_value
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
          WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?) AND o.status = 'completed'
          GROUP BY mi.hsn_sac, oi.gst_rate
          ORDER BY mi.hsn_sac ASC
        `).all(startDate, endDate) || [];

        // B2B invoices (with customer GSTIN)
        const b2bInvoices = db.prepare(`
          SELECT 
            order_no, created_at, customer_name, customer_gstin,
            taxable_amount, cgst, sgst, total
          FROM orders 
          WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) 
            AND status = 'completed' 
            AND customer_gstin != '' AND customer_gstin IS NOT NULL
          ORDER BY created_at ASC
        `).all(startDate, endDate) || [];

        // Overall totals
        const totals = db.prepare(`
          SELECT 
            COUNT(*) as total_invoices,
            COALESCE(SUM(taxable_amount), 0) as total_taxable,
            COALESCE(SUM(cgst), 0) as total_cgst,
            COALESCE(SUM(sgst), 0) as total_sgst,
            COALESCE(SUM(cgst + sgst), 0) as total_gst,
            COALESCE(SUM(total), 0) as total_value
          FROM orders 
          WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) AND status = 'completed'
        `).get(startDate, endDate) || {};

        return { byRate, byHsn, b2bInvoices, totals };
      }),

      topItems: apiCall(async (startDate, endDate, limit = 10) => {
        return db.prepare(`
          SELECT 
            oi.name,
            oi.menu_item_id,
            SUM(oi.quantity) as total_qty,
            SUM(oi.total) as total_amount,
            COUNT(DISTINCT oi.order_id) as order_count,
            AVG(oi.price) as avg_price
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?) AND o.status = 'completed'
          GROUP BY oi.name
          ORDER BY total_qty DESC
          LIMIT ?
        `).all(startDate, endDate, limit) || [];
      }),

      categoryWiseSales: apiCall(async (startDate, endDate) => {
        return db.prepare(`
          SELECT 
            COALESCE(c.name, 'Uncategorized') as category_name,
            SUM(oi.quantity) as total_qty,
            SUM(oi.total) as total_amount,
            COUNT(DISTINCT oi.order_id) as order_count
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
          LEFT JOIN categories c ON mi.category_id = c.id
          WHERE date(o.created_at) >= date(?) AND date(o.created_at) <= date(?) AND o.status = 'completed'
          GROUP BY c.name
          ORDER BY total_amount DESC
        `).all(startDate, endDate) || [];
      }),

      hourlyDistribution: apiCall(async (date) => {
        const target = date || getLocalDateString();
        return db.prepare(`
          SELECT 
            strftime('%H', created_at) as hour,
            COUNT(*) as orders,
            COALESCE(SUM(total), 0) as revenue
          FROM orders 
          WHERE date(created_at) = date(?) AND status = 'completed'
          GROUP BY strftime('%H', created_at)
          ORDER BY hour ASC
        `).all(target) || [];
      }),

      paymentModeBreakdown: apiCall(async (startDate, endDate) => {
        return db.prepare(`
          SELECT 
            payment_mode,
            COUNT(*) as count,
            COALESCE(SUM(total), 0) as amount
          FROM orders 
          WHERE date(created_at) >= date(?) AND date(created_at) <= date(?) AND status = 'completed'
          GROUP BY payment_mode
          ORDER BY amount DESC
        `).all(startDate, endDate) || [];
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
          .run(category, description, parseFloat(amount), date || getLocalDateString(), user_id, user_name);
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
        const jobName = `Receipt_${orderData.order_no || Date.now()}`;

        // 1. Android Native PrintManager Bridge (works with Bluetooth, Thermal, USB & System Printers)
        if (window.AndroidPrinter && typeof window.AndroidPrinter.printHtml === 'function') {
          window.AndroidPrinter.printHtml(html, jobName);
          return true;
        }

        // 2. Browser fallback (iframe print)
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
          setTimeout(() => {
            if (document.body.contains(printFrame)) document.body.removeChild(printFrame);
          }, 2000);
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
          const creds = getStoredGdriveCreds();
          const client = creds.installed || creds.web;
          if (!client || !client.client_id) throw new Error('Invalid credentials.json: client_id not found');
          const redirectUri = (client.redirect_uris && client.redirect_uris[0]) || 'http://localhost';
          const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive');
          return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${client.client_id}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
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
          // Reset previous token and folders so new credentials can be authorized cleanly
          localStorage.setItem('gdrive_disconnected', 'true');
          localStorage.removeItem('gdrive_token_json');
          localStorage.removeItem('gdrive_connected');
          localStorage.removeItem('gdrive_folder_id');
          localStorage.removeItem('gdrive_folder_url');
          localStorage.removeItem('gdrive_last_backup');
          localStorage.removeItem('gdrive_backups_list');
          return { success: true, clientId: client.client_id };
        } catch (e) {
          throw new Error('Invalid JSON format: ' + e.message);
        }
      }),

      saveToken: apiCall(async (tokenText) => {
        if (!tokenText || typeof tokenText !== 'string') throw new Error('Token text cannot be empty');
        try {
          let tokenObj;
          let trimmed = tokenText.trim();
          if (trimmed.includes('code=')) {
            const m = trimmed.match(/code=([^&]+)/);
            if (m) trimmed = decodeURIComponent(m[1]);
          }

          if (trimmed.startsWith('{')) {
            tokenObj = JSON.parse(trimmed);
          } else {
            // Raw auth code or access token
            tokenObj = { access_token: trimmed, token_type: 'Bearer', created_at: Date.now() };
          }

          // If this is an auth code (starts with 4/), try immediate exchange
          if (tokenObj.access_token && tokenObj.access_token.startsWith('4/')) {
            const creds = getStoredGdriveCreds();
            const client = creds.installed || creds.web || {};
            const redirectUri = (client.redirect_uris && client.redirect_uris[0]) || 'http://localhost';

            if (client.client_id && client.client_secret) {
              const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  client_id: client.client_id,
                  client_secret: client.client_secret,
                  code: tokenObj.access_token,
                  redirect_uri: redirectUri,
                  grant_type: 'authorization_code'
                })
              });

              if (tokenResp.ok) {
                const data = await tokenResp.json();
                tokenObj = {
                  access_token: data.access_token,
                  refresh_token: data.refresh_token,
                  token_type: data.token_type || 'Bearer',
                  expires_at: Date.now() + ((data.expires_in || 3600) * 1000),
                  created_at: Date.now()
                };

                // Fetch account profile
                try {
                  const aboutResp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                  });
                  if (aboutResp.ok) {
                    const aboutData = await aboutResp.json();
                    if (aboutData?.user?.emailAddress) {
                      tokenObj.email = aboutData.user.emailAddress;
                    }
                  }
                } catch (ignore) {}
              } else {
                const errTxt = await tokenResp.text();
                console.warn('[RestoBill] Immediate OAuth exchange failed:', errTxt);
              }
            }
          }

          localStorage.setItem('gdrive_token_json', JSON.stringify(tokenObj, null, 2));
          localStorage.setItem('gdrive_connected', 'true');
          return { success: true, token: tokenObj };
        } catch (e) {
          throw new Error('Failed to save token: ' + e.message);
        }
      }),

      getCredentials: apiCall(async () => {
        return getStoredGdriveCreds();
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
        const creds = getStoredGdriveCreds();
        const tokenObj = getStoredGdriveTokenObj();
        const hasCredentials = Boolean(creds?.installed?.client_id || creds?.web?.client_id);
        const hasToken = Boolean(tokenObj && (tokenObj.refresh_token || (tokenObj.access_token && !tokenObj.access_token.startsWith('4/'))));
        const isConnected = Boolean(hasCredentials && hasToken && localStorage.getItem('gdrive_disconnected') !== 'true');
        const email = isConnected ? (tokenObj?.email || 'sherepunjab401@gmail.com') : null;
        const folderId = isConnected ? (localStorage.getItem('gdrive_folder_id') || null) : null;
        const folderUrl = folderId ? (localStorage.getItem('gdrive_folder_url') || `https://drive.google.com/drive/folders/${folderId}`) : null;

        return {
          connected: isConnected,
          hasCredentials,
          hasToken: isConnected,
          email,
          folderId,
          folderUrl,
          lastBackup: isConnected ? (localStorage.getItem('gdrive_last_backup') || null) : null
        };
      }),

      authenticate: apiCall(async (authCode) => {
        return window.api.gdrive.saveToken(authCode);
      }),

      backup: apiCall(async () => {
        triggerSaveDatabase();
        const binary = db.export(); // Uint8Array
        const timestamp = new Date().toISOString();
        const dateStr = getLocalDateString();
        const fileName = `restobill_backup_${dateStr}_${Date.now()}.db`;
        let uploadedToDrive = false;
        let driveFileId = null;
        let driveViewLink = null;
        const folderUrl = 'https://drive.google.com/drive/folders/1kck2GOtxEKXHaxKiZipRZOQrTvj03r3N';

        // Get active access token
        const accessToken = await getValidGdriveToken();
        if (!accessToken) {
          throw new Error('Google Drive access token not available. Please click Authorize Google or Paste Token to connect.');
        }

        try {
          const folderId = await getOrCreateBackupFolder(accessToken);
          const metadata = {
            name: fileName,
            mimeType: 'application/x-sqlite3',
            parents: [folderId],
            description: `RestoBill POS SQLite Database Backup created on ${timestamp}`
          };

          const boundary = '-------restobill_gdrive_' + Date.now();
          const delimiter = '\r\n--' + boundary + '\r\n';
          const closeDelimiter = '\r\n--' + boundary + '--';

          const multipartBlob = new Blob([
            delimiter,
            'Content-Type: application/json; charset=UTF-8\r\n\r\n',
            JSON.stringify(metadata),
            delimiter,
            'Content-Type: application/x-sqlite3\r\n\r\n',
            binary,
            closeDelimiter
          ], { type: `multipart/related; boundary=${boundary}` });

          const uploadResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime,webViewLink,parents', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBlob
          });

          if (uploadResp.ok) {
            const driveData = await uploadResp.json();
            uploadedToDrive = true;
            driveFileId = driveData.id;
            driveViewLink = driveData.webViewLink || `https://drive.google.com/file/d/${driveData.id}/view`;
            console.log('[RestoBill] Google Drive upload success:', driveData);

            // Grant reader permissions so anyone with the link can view/download
            try {
              await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ role: 'reader', type: 'anyone' })
              });
            } catch (pErr) {}
          } else {
            const errText = await uploadResp.text();
            console.warn('[RestoBill] Google Drive upload failed with status', uploadResp.status, errText);
            throw new Error(`Google Drive API Error (${uploadResp.status}): ${errText.slice(0, 150)}`);
          }
        } catch (netErr) {
          console.error('[RestoBill] Google Drive upload network error:', netErr);
          throw netErr;
        }

        // Save last backup timestamp
        localStorage.setItem('gdrive_last_backup', timestamp);

        // Save to recent snapshots list
        const backups = JSON.parse(localStorage.getItem('gdrive_backups_list') || '[]');
        const newBackup = {
          id: driveFileId,
          name: fileName,
          createdAt: timestamp,
          sizeFormatted: (binary.length / 1024).toFixed(1) + ' KB',
          uploadedToDrive: true,
          driveUrl: driveViewLink,
          folderUrl
        };
        backups.unshift(newBackup);
        localStorage.setItem('gdrive_backups_list', JSON.stringify(backups.slice(0, 15)));

        return {
          success: true,
          uploadedToDrive: true,
          driveUrl: driveViewLink,
          folderUrl,
          timestamp,
          backup: newBackup
        };
      }),

      restore: apiCall(async (backupId) => {
        if (!backupId) throw new Error('No backup ID specified');

        // Check if backup is in Google Drive
        const accessToken = await getValidGdriveToken();
        if (accessToken && !String(backupId).startsWith('local_')) {
          try {
            const fileResp = await fetch(`https://www.googleapis.com/drive/v3/files/${backupId}?alt=media`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (fileResp.ok) {
              const buffer = await fileResp.arrayBuffer();
              return window.api.app.importDatabase(buffer);
            }
          } catch (e) {
            console.warn('[RestoBill] GDrive restore download failed:', e);
          }
        }

        throw new Error('Unable to download backup file from Google Drive. Please upload the .db file manually using the Upload Database button.');
      }),

      getBackups: apiCall(async () => {
        const localBackups = JSON.parse(localStorage.getItem('gdrive_backups_list') || '[]');
        const accessToken = await getValidGdriveToken();

        if (accessToken) {
          try {
            const query = encodeURIComponent("name contains 'restobill_backup' and mimeType != 'application/vnd.google-apps.folder' and trashed = false");
            const listResp = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,size,createdTime,webViewLink)&orderBy=createdTime desc&pageSize=15`,
              {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              }
            );
            if (listResp.ok) {
              const listData = await listResp.json();
              const driveFiles = (listData.files || [])
                .filter(f => f.name.endsWith('.db') || f.name.includes('backup'))
                .map(f => ({
                  id: f.id,
                  name: f.name,
                  createdAt: f.createdTime,
                  sizeFormatted: f.size ? (parseInt(f.size, 10) / 1024).toFixed(1) + ' KB' : 'Database File',
                  uploadedToDrive: true,
                  driveUrl: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`
                }));

              if (driveFiles.length > 0) {
                return driveFiles;
              }
            }
          } catch (e) {
            console.warn('[RestoBill] Could not fetch Drive files list:', e);
          }
        }

        return localBackups;
      }),

      disconnect: apiCall(async () => {
        localStorage.setItem('gdrive_disconnected', 'true');
        localStorage.removeItem('gdrive_token_json');
        localStorage.removeItem('gdrive_connected');
        localStorage.removeItem('gdrive_folder_id');
        localStorage.removeItem('gdrive_folder_url');
        localStorage.removeItem('gdrive_last_backup');
        localStorage.removeItem('gdrive_backups_list');
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
        // Prepend UTF-8 BOM so Microsoft Excel automatically recognizes encoding and displays symbols (like ₹) correctly
        const bom = '\uFEFF';
        const content = typeof data === 'string' ? (data.startsWith('\uFEFF') ? data : bom + data) : data;
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `restobill_${type}_${getLocalDateString()}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        }, 3000);
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
        a.style.display = 'none';
        a.href = url;
        a.download = `restobill_backup_${getLocalDateString()}_${Date.now()}.db`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          if (a.parentNode) a.parentNode.removeChild(a);
          URL.revokeObjectURL(url);
        }, 3000);
        return true;
      }),

      importDatabase: apiCall(async (binaryData) => {
        if (!binaryData) throw new Error('No database file data provided');
        const uint8 = (binaryData instanceof Uint8Array)
          ? binaryData
          : (binaryData instanceof ArrayBuffer ? new Uint8Array(binaryData) : new Uint8Array(binaryData));

        if (uint8.length < 16) {
          throw new Error('Database file is too small or corrupt');
        }

        // Verify SQLite header magic bytes
        const magic = String.fromCharCode(...uint8.slice(0, 16));
        if (!magic.startsWith('SQLite format 3')) {
          throw new Error('The selected file is not a valid SQLite database file');
        }

        if (!sqlEngine) {
          throw new Error('SQLite engine is not ready');
        }

        // Initialize new raw database from imported binary
        const newRawDb = new sqlEngine.Database(uint8);
        db.raw = newRawDb;

        // Run migrations if needed to ensure compatibility
        runMigrations(db);

        // Immediately persist to IndexedDB
        const idb = await openIdb();
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(uint8, DB_KEY);

        return { success: true };
      }),
    },
  };

  console.log('[RestoBill] Standalone Mobile API initialized successfully.');
})();
