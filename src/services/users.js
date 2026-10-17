const { getDb } = require('../database/db');
const bcrypt = require('bcryptjs');

class UserService {
  init() {
    this.db = getDb();
  }

  /**
   * Get all users (without password hashes)
   */
  getAll() {
    const users = this.db.prepare(
      'SELECT id, name, username, role, active, last_login, created_at, updated_at FROM users ORDER BY created_at DESC'
    ).all();
    return users;
  }

  /**
   * Add a new user
   */
  addUser(data) {
    const { name, username, password, role = 'cashier' } = data;

    if (!name || !name.trim()) throw new Error('Name is required');
    if (!username || !username.trim()) throw new Error('Username is required');
    if (!password || password.length < 4) throw new Error('Password must be at least 4 characters');
    if (!['admin', 'manager', 'cashier'].includes(role)) throw new Error('Invalid role');

    // Check for duplicate username
    const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim().toLowerCase());
    if (existing) {
      throw new Error('Username already exists');
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const result = this.db.prepare(
      'INSERT INTO users (name, username, password_hash, role, active) VALUES (?, ?, ?, ?, 1)'
    ).run(name.trim(), username.trim().toLowerCase(), passwordHash, role);

    return {
      id: result.lastInsertRowid,
      name: name.trim(),
      username: username.trim().toLowerCase(),
      role,
      active: 1,
    };
  }

  /**
   * Update user details (not password - use auth:changePassword for that)
   */
  updateUser(id, data) {
    const { name, role, password } = data;

    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) throw new Error('User not found');

    // Prevent modifying the last admin
    if (user.role === 'admin' && role && role !== 'admin') {
      const adminCount = this.db.prepare(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND active = 1"
      ).get();
      if (adminCount.count <= 1) {
        throw new Error('Cannot change role: At least one admin must exist');
      }
    }

    const updates = [];
    const values = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
    if (role !== undefined) { updates.push('role = ?'); values.push(role); }
    if (password !== undefined && password.length >= 4) {
      const hash = bcrypt.hashSync(password, 10);
      updates.push('password_hash = ?');
      values.push(hash);
    }

    if (updates.length === 0) return true;

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(id);

    this.db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return this.db.prepare(
      'SELECT id, name, username, role, active, created_at, updated_at FROM users WHERE id = ?'
    ).get(id);
  }

  /**
   * Toggle user active status
   */
  toggleActive(id) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) throw new Error('User not found');

    // Prevent deactivating the last admin
    if (user.role === 'admin' && user.active === 1) {
      const adminCount = this.db.prepare(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND active = 1"
      ).get();
      if (adminCount.count <= 1) {
        throw new Error('Cannot deactivate: At least one active admin must exist');
      }
    }

    const newStatus = user.active === 1 ? 0 : 1;
    this.db.prepare("UPDATE users SET active = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
      .run(newStatus, id);

    return { ...user, active: newStatus, password_hash: undefined };
  }

  /**
   * Delete a user (hard delete)
   */
  deleteUser(id) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) throw new Error('User not found');

    // Prevent deleting the last admin
    if (user.role === 'admin') {
      const adminCount = this.db.prepare(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND active = 1"
      ).get();
      if (adminCount.count <= 1) {
        throw new Error('Cannot delete: At least one admin must exist');
      }
    }

    // Check if user has orders
    const orderCount = this.db.prepare(
      'SELECT COUNT(*) as count FROM orders WHERE user_id = ?'
    ).get(id);

    if (orderCount.count > 0) {
      // Soft delete instead - deactivate
      this.db.prepare("UPDATE users SET active = 0, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
      return { softDeleted: true, message: 'User deactivated (has existing orders)' };
    }

    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { deleted: true };
  }
}

module.exports = new UserService();
