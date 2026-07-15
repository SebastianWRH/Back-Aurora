const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to connect to PostgreSQL');
}

const isLocalDatabase = /localhost|127\.0\.0\.1/i.test(databaseUrl);
const sslMode = process.env.DATABASE_SSL;
const ssl = sslMode === 'false' || sslMode === 'disable' || isLocalDatabase
  ? false
  : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: databaseUrl,
  ssl,
  max: Number(process.env.DATABASE_POOL_SIZE || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const query = (text, params) => pool.query(text, params);

const transaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const closePool = () => pool.end();

const ensureDatabaseConnection = async () => {
  await query('SELECT 1');
};

module.exports = {
  pool,
  query,
  transaction,
  closePool,
  ensureDatabaseConnection
};
