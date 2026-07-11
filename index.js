require('dotenv').config();

const { createServer } = require('./src/server');
const { dbPath } = require('./src/database');

const PORT = process.env.PORT || 3000;
const app = createServer();

app.listen(PORT, () => {
  console.log(`Aurora Catalog API running on http://localhost:${PORT}`);
  console.log(`SQLite database: ${dbPath}`);
});
