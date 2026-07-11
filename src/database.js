const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const resolveDatabasePath = () => {
  const configuredUrl = process.env.DATABASE_URL;

  if (!configuredUrl) {
    return path.resolve(__dirname, '..', 'data', 'catalog.db');
  }

  const normalized = configuredUrl.startsWith('file:')
    ? configuredUrl.replace(/^file:/, '')
    : configuredUrl;

  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(__dirname, '..', normalized);
};

const dbPath = resolveDatabasePath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');

module.exports = {
  db,
  dbPath
};
