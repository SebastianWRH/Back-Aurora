process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.SESSION_SECRET = 'test-session-secret-for-admin-auth';
process.env.NODE_ENV = 'test';
process.env.LOGIN_RATE_LIMIT_MAX = '50';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const rootDir = path.resolve(__dirname, '..');
const resolveProjectFile = (...segments) => path.join(rootDir, ...segments);

let adminsByEmail = new Map();
let adminsById = new Map();

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const setModuleMock = (filePath, exports) => {
  const resolvedPath = require.resolve(filePath);
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports
  };
};

const query = async (sql, params = []) => {
  if (/FROM admins\s+WHERE id = \$1/i.test(sql)) {
    const admin = adminsById.get(String(params[0]));
    return {
      rows: admin ? [{
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        is_active: admin.is_active
      }] : [],
      rowCount: admin ? 1 : 0
    };
  }

  throw new Error(`Unexpected query in test: ${sql}`);
};

setModuleMock(resolveProjectFile('src', 'database.js'), {
  query,
  transaction: async (callback) => callback({ query }),
  closePool: async () => {},
  ensureDatabaseConnection: async () => {}
});

setModuleMock(resolveProjectFile('src', 'catalogRepository.js'), {
  listProducts: async () => [],
  getProductByIdentifier: async () => null,
  listCategories: async () => [],
  getSettings: async () => ({
    id: 1,
    store_name: 'Aurora',
    whatsapp_number: '51999999999',
    currency: 'S/'
  }),
  getAdminByEmail: async (email) => adminsByEmail.get(normalizeEmail(email)) || null,
  normalizeEmail
});

setModuleMock(resolveProjectFile('src', 'catalogService.js'), {
  createProduct: async () => ({}),
  updateProduct: async () => ({}),
  deleteProduct: async () => {},
  addProductImages: async () => ({}),
  deleteProductImage: async () => {},
  createCategory: async () => ({}),
  updateCategory: async () => ({}),
  deleteCategory: async () => {},
  updateCatalogSettings: async (settings) => settings
});

const { createServer } = require('../src/server');

const resetAdmins = async ({ active = true } = {}) => {
  const passwordHash = await bcrypt.hash('CorrectPassword123', 4);
  const admin = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Administrador',
    email: 'admin@example.com',
    password_hash: passwordHash,
    role: 'admin',
    is_active: active
  };

  adminsByEmail = new Map([[admin.email, admin]]);
  adminsById = new Map([[admin.id, admin]]);
  return admin;
};

const withServer = async (callback) => {
  const app = createServer();
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once('listening', resolve));
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
};

const postJson = (baseUrl, pathName, body, options = {}) => fetch(`${baseUrl}${pathName}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  body: JSON.stringify(body),
  ...options
});

const loginAndGetCookie = async (baseUrl) => {
  const response = await postJson(baseUrl, '/api/admin/auth/login', {
    email: 'admin@example.com',
    password: 'CorrectPassword123'
  });

  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
};

test.beforeEach(async () => {
  await resetAdmins();
});

test('login succeeds with active admin and returns public admin data', async () => {
  await withServer(async (baseUrl) => {
    const response = await postJson(baseUrl, '/api/admin/auth/login', {
      email: 'ADMIN@example.com',
      password: 'CorrectPassword123'
    });
    const body = await response.json();
    const setCookie = response.headers.get('set-cookie');

    assert.equal(response.status, 200);
    assert.equal(body.admin.email, 'admin@example.com');
    assert.equal(body.admin.name, 'Administrador');
    assert.equal(body.admin.role, 'admin');
    assert.equal(body.admin.password_hash, undefined);
    assert.match(setCookie, /aurora_admin_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
  });
});

test('login rejects incorrect password with generic message', async () => {
  await withServer(async (baseUrl) => {
    const response = await postJson(baseUrl, '/api/admin/auth/login', {
      email: 'admin@example.com',
      password: 'WrongPassword123'
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.message, 'Credenciales invalidas');
  });
});

test('login rejects nonexistent email with generic message', async () => {
  await withServer(async (baseUrl) => {
    const response = await postJson(baseUrl, '/api/admin/auth/login', {
      email: 'missing@example.com',
      password: 'CorrectPassword123'
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.message, 'Credenciales invalidas');
  });
});

test('login rejects inactive admin', async () => {
  await resetAdmins({ active: false });

  await withServer(async (baseUrl) => {
    const response = await postJson(baseUrl, '/api/admin/auth/login', {
      email: 'admin@example.com',
      password: 'CorrectPassword123'
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.message, 'Credenciales invalidas');
  });
});

test('/me returns admin with valid session', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAndGetCookie(baseUrl);
    const response = await fetch(`${baseUrl}/api/admin/auth/me`, {
      headers: { Cookie: cookie }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.admin.email, 'admin@example.com');
    assert.equal(body.admin.password_hash, undefined);
  });
});

test('/me rejects missing session', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/auth/me`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.message, 'Autenticacion requerida');
  });
});

test('admin endpoint rejects missing session', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/products`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.message, 'Autenticacion requerida');
  });
});

test('admin endpoint accepts valid session', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAndGetCookie(baseUrl);
    const response = await fetch(`${baseUrl}/api/admin/products`, {
      headers: { Cookie: cookie }
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.products, []);
  });
});

test('logout clears the admin session cookie', async () => {
  await withServer(async (baseUrl) => {
    const cookie = await loginAndGetCookie(baseUrl);
    const response = await fetch(`${baseUrl}/api/admin/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie }
    });
    const setCookie = response.headers.get('set-cookie');

    assert.equal(response.status, 204);
    assert.match(setCookie, /aurora_admin_session=/);
    assert.match(setCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
  });
});
