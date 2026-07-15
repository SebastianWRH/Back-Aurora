require('dotenv').config();

const PORT = process.env.PORT || 3000;

const { ensureDatabaseConnection } = require('./src/database');
const { createServer } = require('./src/server');

const start = async () => {
  await ensureDatabaseConnection();
  const app = createServer();

  app.listen(PORT, () => {
    console.log(`Aurora Catalog API running on http://localhost:${PORT}`);
  });
};

start().catch((error) => {
  console.error('Unable to start Aurora Catalog API:', error.message);
  process.exit(1);
});
