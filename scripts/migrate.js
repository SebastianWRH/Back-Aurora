require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/database');

const run = async () => {
  const migrationsDir = path.resolve(__dirname, '..', 'migrations');
  const migrations = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of migrations) {
    const alreadyApplied = await pool.query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      [migration]
    );

    if (alreadyApplied.rowCount > 0) {
      console.log(`Skipping migration: ${migration}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [migration]
      );
      await client.query('COMMIT');
      console.log(`Applied migration: ${migration}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  console.log('PostgreSQL database ready');
};

run()
  .catch((error) => {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
