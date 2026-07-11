require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { dbPath } = require('./src/database');

const ensureDatabase = () => {
  const { db } = require('./src/database');
  const migrationsDir = path.resolve(__dirname, 'migrations');
  const migrations = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();

  for (const migration of migrations) {
    const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
    db.exec(sql);
  }

  const productsCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  const imagesCount = db.prepare('SELECT COUNT(*) AS count FROM product_images').get().count;
  const settingsCount = db.prepare('SELECT COUNT(*) AS count FROM catalog_settings').get().count;

  if (productsCount === 0 || imagesCount === 0 || settingsCount === 0) {
    require('./scripts/seed');
    return;
  }

  console.log(`Database ready at ${dbPath}`);
};

const PORT = process.env.PORT || 3000;

ensureDatabase();

const { createServer } = require('./src/server');
const app = createServer();

app.listen(PORT, () => {
  console.log(`Aurora Catalog API running on http://localhost:${PORT}`);
  console.log(`SQLite database: ${dbPath}`);
});
