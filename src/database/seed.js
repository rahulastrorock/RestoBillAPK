const { getDb } = require('./db');
const bcrypt = require('bcryptjs');

/**
 * Seed default data into the database
 * Only seeds if tables are empty (safe to run multiple times)
 */
function seedData() {
  const db = getDb();

  // ─── Seed Default Admin User ──────────────────────────────────
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (name, username, password_hash, role, active)
      VALUES (?, ?, ?, ?, ?)
    `).run('Administrator', 'admin', passwordHash, 'admin', 1);

    console.log('Default admin user created (username: admin, password: admin123)');
  }

  // ─── Seed Default Settings ────────────────────────────────────
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get();
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
      ['silent_print', '1'],
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
      ['footer_text', 'Thank you! Visit again!'],
      ['print_show_terms', '0'],
      ['terms_text', 'Goods once sold cannot be returned.'],
      ['print_show_branding', '1'],
      ['backup_enabled', '0'],
      ['backup_frequency', 'daily'],
      ['last_backup', ''],
      ['theme', 'dark'],
      ['order_types', 'dine_in,takeaway,delivery'],
      ['table_count', '20'],
      ['enable_kot', '1'],
      ['enable_customer', '1'],
      ['tax_on_discount', 'after'],
    ];

    const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    const insertMany = db.transaction((settings) => {
      for (const [key, value] of settings) {
        insertSetting.run(key, value);
      }
    });
    insertMany(defaultSettings);

    console.log('Default settings seeded.');
  }

  // ─── Seed Default Categories ──────────────────────────────────
  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (catCount.count === 0) {
    const defaultCategories = [
      ['Starters', 'Appetizers and snacks', 1],
      ['Main Course', 'Rice and curry dishes', 2],
      ['Breads', 'Naan, Roti, Paratha', 3],
      ['Rice & Biryani', 'Rice dishes and biryanis', 4],
      ['Chinese', 'Indo-Chinese dishes', 5],
      ['Desserts', 'Sweet dishes and desserts', 6],
      ['Beverages', 'Drinks and shakes', 7],
      ['Thali', 'Complete meal thalis', 8],
    ];

    const insertCat = db.prepare(
      'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)'
    );
    const insertCats = db.transaction((categories) => {
      for (const [name, desc, order] of categories) {
        insertCat.run(name, desc, order);
      }
    });
    insertCats(defaultCategories);

    console.log('Default categories seeded.');
  }

  // ─── Seed Sample Menu Items ───────────────────────────────────
  const itemCount = db.prepare('SELECT COUNT(*) as count FROM menu_items').get();
  if (itemCount.count === 0) {
    const sampleItems = [
      // Starters (category_id = 1)
      [1, 'Paneer Tikka', 'PT', 280, '996331', 5, 1, 'Grilled cottage cheese with spices'],
      [1, 'Chicken Tikka', 'CT', 320, '996331', 5, 0, 'Tandoor grilled chicken pieces'],
      [1, 'Veg Spring Roll', 'VSR', 180, '996331', 5, 1, 'Crispy rolls with vegetable filling'],
      [1, 'Fish Fry', 'FF', 350, '996331', 5, 0, 'Crispy fried fish'],
      [1, 'Aloo Tikki', 'AT', 150, '996331', 5, 1, 'Spiced potato patties'],
      [1, 'Tandoori Chicken', 'TC', 380, '996331', 5, 0, 'Half tandoori chicken'],

      // Main Course (category_id = 2)
      [2, 'Butter Chicken', 'BC', 350, '996331', 5, 0, 'Creamy tomato-based chicken curry'],
      [2, 'Paneer Butter Masala', 'PBM', 280, '996331', 5, 1, 'Rich creamy paneer curry'],
      [2, 'Dal Makhani', 'DM', 220, '996331', 5, 1, 'Slow-cooked black lentils'],
      [2, 'Chicken Biryani', 'CB', 300, '996331', 5, 0, 'Fragrant rice with chicken'],
      [2, 'Kadhai Paneer', 'KP', 260, '996331', 5, 1, 'Paneer in spiced capsicum gravy'],
      [2, 'Mutton Rogan Josh', 'MRJ', 420, '996331', 5, 0, 'Kashmiri style mutton curry'],
      [2, 'Chole Bhature', 'CHB', 180, '996331', 5, 1, 'Spiced chickpeas with fried bread'],
      [2, 'Egg Curry', 'EC', 200, '996331', 5, 0, 'Eggs in onion-tomato gravy'],

      // Breads (category_id = 3)
      [3, 'Butter Naan', 'BN', 60, '996331', 5, 1, 'Soft leavened bread with butter'],
      [3, 'Garlic Naan', 'GN', 80, '996331', 5, 1, 'Naan topped with garlic'],
      [3, 'Tandoori Roti', 'TR', 40, '996331', 5, 1, 'Whole wheat tandoor bread'],
      [3, 'Laccha Paratha', 'LP', 70, '996331', 5, 1, 'Layered whole wheat bread'],
      [3, 'Missi Roti', 'MR', 50, '996331', 5, 1, 'Gram flour roti'],
      [3, 'Cheese Naan', 'CN', 100, '996331', 5, 1, 'Naan stuffed with cheese'],

      // Rice & Biryani (category_id = 4)
      [4, 'Steamed Rice', 'SR', 120, '996331', 5, 1, 'Plain basmati rice'],
      [4, 'Jeera Rice', 'JR', 150, '996331', 5, 1, 'Cumin flavored rice'],
      [4, 'Veg Biryani', 'VB', 220, '996331', 5, 1, 'Vegetable dum biryani'],
      [4, 'Chicken Biryani', 'CHB', 280, '996331', 5, 0, 'Hyderabadi chicken biryani'],
      [4, 'Mutton Biryani', 'MB', 350, '996331', 5, 0, 'Rich mutton biryani'],
      [4, 'Egg Fried Rice', 'EFR', 180, '996331', 5, 0, 'Egg fried rice'],

      // Chinese (category_id = 5)
      [5, 'Veg Manchurian', 'VM', 200, '996331', 5, 1, 'Vegetable balls in manchurian sauce'],
      [5, 'Chilli Chicken', 'CC', 280, '996331', 5, 0, 'Spicy Indo-Chinese chicken'],
      [5, 'Hakka Noodles', 'HN', 180, '996331', 5, 1, 'Stir fried noodles'],
      [5, 'Fried Rice', 'FR', 180, '996331', 5, 1, 'Indo-Chinese fried rice'],
      [5, 'Chilli Paneer', 'CP', 240, '996331', 5, 1, 'Spicy paneer in Chinese style'],

      // Desserts (category_id = 6)
      [6, 'Gulab Jamun', 'GJ', 80, '996331', 5, 1, 'Deep fried milk dumplings in syrup'],
      [6, 'Rasmalai', 'RM', 100, '996331', 5, 1, 'Soft paneer in sweetened milk'],
      [6, 'Ice Cream', 'IC', 120, '996331', 5, 1, 'Choice of flavor'],
      [6, 'Kheer', 'KH', 90, '996331', 5, 1, 'Rice pudding'],

      // Beverages (category_id = 7)
      [7, 'Masala Chai', 'MC', 40, '996331', 5, 1, 'Indian spiced tea'],
      [7, 'Coffee', 'CF', 60, '996331', 5, 1, 'Hot coffee'],
      [7, 'Fresh Lime Soda', 'FLS', 80, '996331', 5, 1, 'Lime soda sweet/salt'],
      [7, 'Mango Lassi', 'ML', 100, '996331', 5, 1, 'Mango yogurt drink'],
      [7, 'Buttermilk', 'BM', 50, '996331', 5, 1, 'Spiced buttermilk'],
      [7, 'Soft Drink', 'SD', 60, '996331', 5, 1, 'Coke/Pepsi/Sprite'],
      [7, 'Water Bottle', 'WB', 30, '996331', 5, 1, '1L packaged water'],

      // Thali (category_id = 8)
      [8, 'Veg Thali', 'VT', 250, '996331', 5, 1, 'Complete veg meal with 4 items'],
      [8, 'Non-Veg Thali', 'NVT', 350, '996331', 5, 0, 'Complete non-veg meal with 4 items'],
      [8, 'Special Thali', 'ST', 450, '996331', 5, 0, 'Premium thali with 6 items'],
    ];

    const insertItem = db.prepare(`
      INSERT INTO menu_items (category_id, name, short_code, price, hsn_sac, gst_rate, is_veg, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertItems = db.transaction((items) => {
      for (const item of items) {
        insertItem.run(...item);
      }
    });
    insertItems(sampleItems);

    console.log('Sample menu items seeded.');
  }

  // ─── Seed Sample Customers ────────────────────────────────────
  const customerCount = db.prepare('SELECT COUNT(*) as count FROM customers').get();
  if (customerCount.count === 0) {
    const sampleCustomers = [
      ['Rahul Sharma', '9876543210', 'rahul.sharma@gmail.com', '07AAAAA0000A1Z5', 'Connaught Place, New Delhi'],
      ['Priya Patel', '9811223344', 'priya.patel@gmail.com', '', 'Andheri West, Mumbai'],
      ['Amit Kumar', '9822334455', 'amit.k@outlook.com', '27BBBBB1111B2Z6', 'Kothrud, Pune'],
      ['Sneha Reddy', '9833445566', '', '', 'Banjara Hills, Hyderabad'],
      ['Vikram Singh', '9844556677', 'vikram@company.com', '29CCCCC2222C3Z7', 'Indiranagar, Bengaluru']
    ];

    const insertCust = db.prepare(`
      INSERT INTO customers (name, phone, email, gstin, address)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertCustomers = db.transaction((customers) => {
      for (const [name, phone, email, gstin, address] of customers) {
        insertCust.run(name, phone, email, gstin, address);
      }
    });
    insertCustomers(sampleCustomers);

    console.log('Sample customers seeded.');
  }

  console.log('Database seeding complete.');
}

module.exports = { seedData };
