const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.resolve(__dirname, '../..');
const configuredPath = process.env.DATABASE_PATH || 'backend/database/reading-social.db';
const databasePath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.join(projectRoot, configuredPath);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

module.exports = db;
