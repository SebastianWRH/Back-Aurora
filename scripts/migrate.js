require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { db, dbPath } = require('../src/database');

const migrationsDir = path.resolve(__dirname, '..', 'migrations');
const migrations = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort();

for (const migration of migrations) {
  const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
  db.exec(sql);
  console.log(`Applied migration: ${migration}`);
}

console.log(`Database ready at ${dbPath}`);
