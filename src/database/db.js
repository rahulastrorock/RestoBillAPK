const Database = require('better-sqlite3');
const path = require('path');

let db = null;

/**
 * Initialize the SQLite database connection
 * @param {string} dbPath - Full path to the database file
 */
function initDatabase(dbPath) {
  if (db) return db;

  db = new Database(dbPath, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null,
  });

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  console.log('Database initialized at:', dbPath);
  return db;
}

/**
 * Get the current database instance
 * @returns {Database} The SQLite database instance
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection gracefully
 */
function closeDatabase() {
  if (db) {
    try {
      db.close();
      db = null;
      console.log('Database connection closed.');
    } catch (err) {
      console.error('Error closing database:', err.message);
    }
  }
}

module.exports = { initDatabase, getDb, closeDatabase };
