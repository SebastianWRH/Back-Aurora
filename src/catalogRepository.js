const { db } = require('./database');

const productSelect = `
  SELECT
    p.*,
    c.name AS category_name,
    c.slug AS category_slug,
    c.description AS category_description,
    c.image AS category_image,
    (
      SELECT COUNT(*)
      FROM product_variants pv
      WHERE pv.product_id = p.id
    ) AS variant_count
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

const imageStatement = db.prepare(`
  SELECT id, image_url, alt_text, sort_order, created_at
  FROM product_images
  WHERE product_id = ?
  ORDER BY sort_order ASC, id ASC
`);

const variantStatement = db.prepare(`
  SELECT id, product_id, name, value, price_adjustment, stock_status, created_at, updated_at
  FROM product_variants
  WHERE product_id = ?
  ORDER BY id ASC
`);

const tagStatement = db.prepare(`
  SELECT t.id, t.name, t.slug
  FROM product_tags t
  JOIN product_tag_relations r ON r.tag_id = t.id
  WHERE r.product_id = ?
  ORDER BY t.name ASC
`);

const toBoolean = (value) => Boolean(Number(value));

const formatProduct = (row, includeDetails = false) => {
  const images = imageStatement.all(row.id);
  const primaryImage = images[0]?.image_url || row.category_image || '';
  const product = {
    id: row.id,
    category_id: row.category_id,
    category: row.category_name,
    category_slug: row.category_slug,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: row.price,
    material: row.material,
    color: row.color,
    size: row.size,
    stock_status: row.stock_status,
    is_featured: toBoolean(row.is_featured),
    featured: toBoolean(row.is_featured),
    is_active: toBoolean(row.is_active),
    image_url: primaryImage,
    image: primaryImage,
    images,
    variant_count: row.variant_count || 0,
    has_variants: Number(row.variant_count || 0) > 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };

  if (includeDetails) {
    product.category_details = {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      description: row.category_description,
      image: row.category_image
    };
    product.variants = variantStatement.all(row.id).map((variant, index) => ({
      ...variant,
      image_url: images[index]?.image_url || primaryImage
    }));
    product.tags = tagStatement.all(row.id);
  }

  return product;
};

const buildProductFilters = (filters = {}) => {
  const conditions = ['p.is_active = 1', 'c.is_active = 1'];
  const params = [];

  if (filters.category) {
    conditions.push('(c.slug = ? OR lower(c.name) = lower(?))');
    params.push(filters.category, filters.category);
  }

  if (filters.search) {
    conditions.push(`(
      lower(p.name) LIKE lower(?)
      OR lower(p.description) LIKE lower(?)
      OR lower(p.material) LIKE lower(?)
      OR lower(p.color) LIKE lower(?)
    )`);
    const search = `%${filters.search}%`;
    params.push(search, search, search, search);
  }

  if (filters.featured === 'true' || filters.featured === '1') {
    conditions.push('p.is_featured = 1');
  }

  if (filters.stock_status) {
    conditions.push('p.stock_status = ?');
    params.push(filters.stock_status);
  }

  return {
    where: conditions.join(' AND '),
    params
  };
};

const listProducts = (filters = {}) => {
  const { where, params } = buildProductFilters(filters);
  const rows = db.prepare(`
    ${productSelect}
    WHERE ${where}
    ORDER BY p.is_featured DESC, p.created_at DESC, p.id DESC
  `).all(...params);

  return rows.map(row => formatProduct(row));
};

const getProductBySlug = (slug) => {
  const row = db.prepare(`
    ${productSelect}
    WHERE p.is_active = 1
      AND c.is_active = 1
      AND (p.slug = ? OR CAST(p.id AS TEXT) = ?)
    LIMIT 1
  `).get(slug, slug);

  return row ? formatProduct(row, true) : null;
};

const listCategories = () => {
  return db.prepare(`
    SELECT id, name, slug, description, image, is_active, created_at, updated_at
    FROM categories
    WHERE is_active = 1
    ORDER BY name ASC
  `).all().map(category => ({
    ...category,
    is_active: toBoolean(category.is_active)
  }));
};

const getSettings = () => {
  const settings = db.prepare(`
    SELECT id, store_name, whatsapp_number, instagram_url, default_whatsapp_message, currency, created_at, updated_at
    FROM catalog_settings
    WHERE id = 1
  `).get();

  if (!settings) {
    return null;
  }

  return {
    ...settings,
    store_name: process.env.STORE_NAME || settings.store_name,
    whatsapp_number: process.env.WHATSAPP_NUMBER || settings.whatsapp_number,
    instagram_url: process.env.INSTAGRAM_URL || settings.instagram_url
  };
};

module.exports = {
  listProducts,
  getProductBySlug,
  listCategories,
  getSettings
};
