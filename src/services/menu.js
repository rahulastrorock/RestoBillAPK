const { getDb } = require('../database/db');

class MenuService {
  init() {
    this.db = getDb();
  }

  // ─── Categories ───────────────────────────────────────────────

  getCategories() {
    return this.db.prepare(
      'SELECT * FROM categories WHERE active = 1 ORDER BY sort_order ASC, name ASC'
    ).all();
  }

  addCategory(data) {
    const { name, description = '', sort_order = 0 } = data;

    if (!name || !name.trim()) {
      throw new Error('Category name is required');
    }

    const existing = this.db.prepare('SELECT id FROM categories WHERE name = ?').get(name.trim());
    if (existing) {
      throw new Error('Category with this name already exists');
    }

    const result = this.db.prepare(
      'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)'
    ).run(name.trim(), description, sort_order);

    return { id: result.lastInsertRowid, name: name.trim(), description, sort_order };
  }

  updateCategory(id, data) {
    const { name, description, sort_order } = data;

    if (name !== undefined && !name.trim()) {
      throw new Error('Category name cannot be empty');
    }

    // Check for duplicate name
    if (name) {
      const existing = this.db.prepare(
        'SELECT id FROM categories WHERE name = ? AND id != ?'
      ).get(name.trim(), id);
      if (existing) {
        throw new Error('Category with this name already exists');
      }
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); values.push(sort_order); }

    if (updates.length === 0) return true;

    values.push(id);
    this.db.prepare(`UPDATE categories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  deleteCategory(id) {
    // Check if category has items
    const itemCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM menu_items WHERE category_id = ? AND active = 1'
    ).get(id);

    if (itemCount.count > 0) {
      throw new Error(`Cannot delete: Category has ${itemCount.count} active items. Remove or reassign items first.`);
    }

    // Soft delete
    this.db.prepare('UPDATE categories SET active = 0 WHERE id = ?').run(id);
    return true;
  }

  // ─── Menu Items ───────────────────────────────────────────────

  getItems(categoryId) {
    if (categoryId) {
      return this.db.prepare(
        `SELECT mi.*, c.name as category_name 
         FROM menu_items mi 
         JOIN categories c ON mi.category_id = c.id 
         WHERE mi.category_id = ? AND mi.active = 1 
         ORDER BY mi.name ASC`
      ).all(categoryId);
    }
    return this.getAllItems();
  }

  getAllItems() {
    return this.db.prepare(
      `SELECT mi.*, c.name as category_name 
       FROM menu_items mi 
       JOIN categories c ON mi.category_id = c.id 
       WHERE mi.active = 1 
       ORDER BY c.sort_order ASC, mi.name ASC`
    ).all();
  }

  addItem(data) {
    const {
      category_id, name, short_code = '', price, hsn_sac = '996331',
      gst_rate = 5.0, is_veg = 1, description = ''
    } = data;

    if (!name || !name.trim()) throw new Error('Item name is required');
    if (!category_id) throw new Error('Category is required');
    if (price === undefined || price < 0) throw new Error('Valid price is required');

    const result = this.db.prepare(`
      INSERT INTO menu_items (category_id, name, short_code, price, hsn_sac, gst_rate, is_veg, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(category_id, name.trim(), short_code, price, hsn_sac, gst_rate, is_veg ? 1 : 0, description);

    return this.db.prepare(
      `SELECT mi.*, c.name as category_name 
       FROM menu_items mi JOIN categories c ON mi.category_id = c.id 
       WHERE mi.id = ?`
    ).get(result.lastInsertRowid);
  }

  updateItem(id, data) {
    const fields = ['category_id', 'name', 'short_code', 'price', 'hsn_sac', 'gst_rate', 'is_veg', 'description'];
    const updates = [];
    const values = [];

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`);
        let val = data[field];
        if (field === 'is_veg') val = val ? 1 : 0;
        if (field === 'name') val = val.trim();
        values.push(val);
      }
    }

    if (updates.length === 0) return true;

    updates.push('updated_at = datetime("now", "localtime")');
    values.push(id);

    this.db.prepare(`UPDATE menu_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return this.db.prepare(
      `SELECT mi.*, c.name as category_name 
       FROM menu_items mi JOIN categories c ON mi.category_id = c.id 
       WHERE mi.id = ?`
    ).get(id);
  }

  deleteItem(id) {
    // Soft delete
    this.db.prepare('UPDATE menu_items SET active = 0, updated_at = datetime("now", "localtime") WHERE id = ?').run(id);
    return true;
  }

  searchItems(query) {
    if (!query || !query.trim()) return this.getAllItems();

    const searchTerm = `%${query.trim()}%`;
    return this.db.prepare(
      `SELECT mi.*, c.name as category_name 
       FROM menu_items mi 
       JOIN categories c ON mi.category_id = c.id 
       WHERE mi.active = 1 AND (mi.name LIKE ? OR mi.short_code LIKE ? OR c.name LIKE ?)
       ORDER BY mi.name ASC`
    ).all(searchTerm, searchTerm, searchTerm);
  }
}

module.exports = new MenuService();
