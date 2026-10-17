const { getDb } = require('../database/db');
const bcrypt = require('bcryptjs');

class AuthService {
  init() {
    this.db = getDb();
  }

  /**
   * Authenticate a user with username and password
   * @returns {Object} User object without password hash
   */
  login(username, password) {
    const user = this.db.prepare(
      'SELECT * FROM users WHERE username = ? AND active = 1'
    ).get(username);

    if (!user) {
      throw new Error('Invalid username or password');
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid username or password');
    }

    // Update user's last_login timestamp
    this.db.prepare(
      "UPDATE users SET last_login = datetime('now', 'localtime') WHERE id = ?"
    ).run(user.id);

    // Log the login
    this.db.prepare(
      'INSERT INTO audit_log (user_id, user_name, action, entity, details) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, user.name, 'LOGIN', 'auth', `User ${user.username} logged in`);

    // Return user without password
    const { password_hash, ...safeUser } = user;
    safeUser.last_login = new Date().toISOString();
    return safeUser;
  }

  /**
   * Change a user's password
   */
  changePassword(userId, oldPassword, newPassword) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (oldPassword) {
      if (typeof oldPassword !== 'string') {
        throw new Error('Invalid current password format');
      }
      const isValid = bcrypt.compareSync(oldPassword, user.password_hash);
      if (!isValid) {
        throw new Error('Current password is incorrect');
      }
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
      throw new Error('New password must be at least 4 characters');
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    this.db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
      .run(newHash, userId);

    // Log password change
    this.db.prepare(
      'INSERT INTO audit_log (user_id, user_name, action, entity, details) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, user.name, 'PASSWORD_CHANGE', 'auth', oldPassword ? 'Password changed' : `Password reset for user ${user.username}`);

    return true;
  }
}

module.exports = new AuthService();
