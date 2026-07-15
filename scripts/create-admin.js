require('dotenv').config();

const bcrypt = require('bcryptjs');
const { query, closePool } = require('../src/database');
const { normalizeEmail } = require('../src/catalogRepository');

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const run = async () => {
  const name = process.env.ADMIN_NAME;
  const email = normalizeEmail(process.env.ADMIN_EMAIL || '');
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  const role = process.env.ADMIN_ROLE || 'admin';
  const updateExisting = process.env.ADMIN_UPDATE_EXISTING === 'true';

  if (!name || !email || !password) {
    throw new Error('ADMIN_NAME, ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD are required');
  }

  if (!isValidEmail(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address');
  }

  if (password.length < 10) {
    throw new Error('ADMIN_INITIAL_PASSWORD must contain at least 10 characters');
  }

  const existing = await query('SELECT id FROM admins WHERE email = $1 LIMIT 1', [email]);

  if (existing.rowCount > 0 && !updateExisting) {
    throw new Error('An admin with ADMIN_EMAIL already exists. Set ADMIN_UPDATE_EXISTING=true only when rotating credentials intentionally.');
  }

  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS || 12));

  if (existing.rowCount > 0) {
    await query(`
      UPDATE admins
      SET name = $1,
          password_hash = $2,
          role = $3,
          is_active = TRUE
      WHERE email = $4
    `, [name, passwordHash, role, email]);
  } else {
    await query(`
      INSERT INTO admins (name, email, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
    `, [name, email, passwordHash, role]);
  }

  console.log(`Admin ready for ${email}`);
};

run()
  .catch((error) => {
    console.error('Admin creation failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
