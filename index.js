require('dotenv').config();

const PORT = process.env.PORT || 3000;

const { ensureDatabaseConnection } = require('./src/database');
const { runPendingMigrations } = require('./src/migrations');
const { createServer } = require('./src/server');

const start = async () => {
  await ensureDatabaseConnection();
  if (process.env.RUN_MIGRATIONS_ON_START !== 'false') {
    await runPendingMigrations();
  }
  const app = createServer();

  app.listen(PORT, () => {
    console.log(`Aurora Catalog API running on http://localhost:${PORT}`);
  });
};

start().catch((error) => {
  console.error('Unable to start Aurora Catalog API:', error.message);
  process.exit(1);
});
