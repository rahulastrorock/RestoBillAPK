const { getDb } = require('../database/db');

class SettingsService {
  init() {
    this.db = getDb();
  }

  /**
   * Get all settings as key-value object
   */
  getAll() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  /**
   * Get a single setting value
   */
  get(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  /**
   * Update a single setting
   */
  update(key, value) {
    const existing = this.db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
    if (existing) {
      this.db.prepare("UPDATE settings SET value = ?, updated_at = datetime('now', 'localtime') WHERE key = ?")
        .run(String(value), key);
    } else {
      this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
    }
    return true;
  }

  /**
   * Update multiple settings at once
   */
  updateBulk(settings) {
    const upsert = this.db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    const updateMany = this.db.transaction((entries) => {
      for (const [key, value] of Object.entries(entries)) {
        upsert.run(key, String(value));
      }
    });

    updateMany(settings);
    return this.getAll();
  }
}

module.exports = new SettingsService();
