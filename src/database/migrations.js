const { getDb } = require('./db');

/**
 * Run all database migrations - creates tables if they don't exist
 * Uses IF NOT EXISTS so it's safe to run multiple times
 */
function runMigrations() {
  const db = getDb();

  db.exec(`
    -- ─── Users Table ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier' CHECK(role IN ('admin', 'manager', 'cashier')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- ─── Categories Table ───────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- ─── Menu Items Table ───────────────────────────────────────────
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

    -- ─── Customers Table ────────────────────────────────────────────
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

    -- ─── Orders Table ───────────────────────────────────────────────
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

    -- ─── Order Items Table ──────────────────────────────────────────
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

    -- ─── Expenses Table ─────────────────────────────────────────────
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

    -- ─── Settings Table (Key-Value Store) ───────────────────────────
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- ─── Audit Log Table ────────────────────────────────────────────
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

    -- ─── Indexes for Performance ────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
    CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(active);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
  `);

  console.log('Database migrations completed successfully.');
}

module.exports = { runMigrations };
