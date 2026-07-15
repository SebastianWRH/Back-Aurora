const fs = require('fs');
const path = require('path');
const { query, transaction } = require('./database');

const runPendingMigrations = async () => {
  const migrationsDir = path.resolve(__dirname, '..', 'migrations');
  const migrations = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of migrations) {
    const alreadyApplied = await query(
      'SELECT filename FROM schema_migrations WHERE filename = $1',
      [migration]
    );

    if (alreadyApplied.rowCount > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');

    await transaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [migration]
      );
    });

    console.log(`Applied migration: ${migration}`);
  }
};

module.exports = {
  runPendingMigrations
};
