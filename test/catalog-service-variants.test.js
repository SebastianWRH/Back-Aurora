process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const resolveProjectFile = (...segments) => path.join(rootDir, ...segments);

let insertedVariant = null;

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const normalizeStockStatus = (value) => {
  const allowed = ['Disponible', 'Agotado', 'Consultar disponibilidad'];
  return allowed.includes(value) ? value : 'Consultar disponibilidad';
};

const setModuleMock = (filePath, exports) => {
  const resolvedPath = require.resolve(filePath);
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports
  };
};

const client = {
  query: async (sql, params = []) => {
    if (/INSERT INTO products/i.test(sql)) {
      return { rows: [{ id: 101 }], rowCount: 1 };
    }

    if (/FROM product_variants/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }

    if (/INSERT INTO product_variants/i.test(sql)) {
      insertedVariant = {
        product_id: params[0],
        name: params[1],
        value: params[2],
        price_adjustment: params[3],
        stock_status: params[4],
        color_hex: params[5],
        stock_quantity: params[6],
        is_active: params[7],
        sort_order: params[8]
      };
      return { rows: [{ id: 202 }], rowCount: 1 };
    }

    throw new Error(`Unexpected query in catalog service variant test: ${sql}`);
  }
};

setModuleMock(resolveProjectFile('src', 'database.js'), {
  query: async () => ({ rows: [], rowCount: 0 }),
  transaction: async (callback) => callback(client),
  closePool: async () => {},
  ensureDatabaseConnection: async () => {}
});

setModuleMock(resolveProjectFile('src', 'cloudinaryService.js'), {
  uploadBuffer: async () => null,
  deleteImages: async () => {},
  deleteImage: async () => {}
});

setModuleMock(resolveProjectFile('src', 'catalogRepository.js'), {
  getProductByIdentifier: async (id) => ({
    id: Number(id),
    name: 'Collar Aurora',
    variants: insertedVariant ? [insertedVariant] : []
  }),
  getProductImages: async () => [],
  getProductVariants: async () => [],
  getProductVariantImages: async () => [],
  getCategoryByIdentifier: async () => null,
  productSlugExists: async () => false,
  categorySlugExists: async () => false,
  resolveCategoryId: async () => 7,
  normalizeProductInput: (input = {}) => ({
    name: String(input.name || '').trim(),
    slug: String(input.slug || '').trim(),
    category_id: input.category_id,
    category_slug: input.category_slug,
    description: input.description || '',
    price: input.price === '' || input.price === undefined ? null : Number(input.price),
    material: input.material || '',
    color: input.color || '',
    size: input.size || '',
    stock_status: normalizeStockStatus(input.stock_status),
    whatsapp_message: input.whatsapp_message || '',
    is_featured: normalizeBoolean(input.is_featured),
    is_active: input.is_active === undefined ? true : normalizeBoolean(input.is_active, true)
  }),
  normalizeCategoryInput: (input) => input,
  normalizeStockStatus,
  normalizeBoolean
});

const { createProduct } = require('../src/catalogService');

test.beforeEach(() => {
  insertedVariant = null;
});

test('createProduct normalizes color variants without reference errors', async () => {
  const product = await createProduct({
    name: 'Collar Aurora',
    slug: 'collar-aurora',
    category_id: 7,
    price: '129.90',
    variants: JSON.stringify([{
      client_id: 'color-dorado',
      value: 'Dorado',
      color_hex: 'c8a24a',
      stock_quantity: '3',
      stock_status: 'Disponible',
      is_active: 'true'
    }])
  });

  assert.equal(product.id, 101);
  assert.equal(insertedVariant.value, 'Dorado');
  assert.equal(insertedVariant.color_hex, '#c8a24a');
  assert.equal(insertedVariant.stock_quantity, 3);
  assert.equal(insertedVariant.stock_status, 'Disponible');
  assert.equal(insertedVariant.is_active, true);
});
