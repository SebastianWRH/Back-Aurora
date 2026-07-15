const { query } = require('./database');
const { slugify } = require('./slugify');

const run = (client, text, params) => (client || { query }).query(text, params);

const productSelect = `
  SELECT
    p.*,
    c.name AS category_name,
    c.slug AS category_slug,
    c.description AS category_description,
    c.image_url AS category_image_url,
    (
      SELECT COUNT(*)
      FROM product_variants pv
      WHERE pv.product_id = p.id
    ) AS variant_count
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

const imageSelect = `
  SELECT
    id,
    product_id,
    secure_url,
    secure_url AS image_url,
    public_id,
    width,
    height,
    format,
    alt_text,
    sort_order,
    is_primary,
    created_at
  FROM product_images
`;

const variantImageSelect = `
  SELECT
    id,
    variant_id,
    secure_url,
    secure_url AS image_url,
    public_id,
    width,
    height,
    format,
    alt_text,
    sort_order,
    is_primary,
    created_at
  FROM product_variant_images
`;

const isTruthy = (value) => value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
const isFalsey = (value) => value === false || value === 'false' || value === '0' || value === 0 || value === 'off';

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
};

const normalizeBoolean = (value, fallback = false) => {
  if (isTruthy(value)) return true;
  if (isFalsey(value)) return false;
  return fallback;
};

const normalizeStockStatus = (value) => {
  const allowed = ['Disponible', 'Agotado', 'Consultar disponibilidad'];
  return allowed.includes(value) ? value : 'Consultar disponibilidad';
};

const normalizeEmail = (email = '') => email.trim().toLowerCase();

const normalizeSlug = (value, fallback = '') => {
  const candidate = slugify(value || fallback);
  return candidate || slugify(fallback);
};

const formatImages = (images = []) => images.map(image => ({
  ...image,
  id: Number(image.id),
  product_id: image.product_id === undefined ? undefined : Number(image.product_id),
  image_url: image.image_url || image.secure_url,
  sort_order: Number(image.sort_order || 0),
  is_primary: Boolean(image.is_primary)
}));

const formatVariantImages = (images = []) => images.map(image => ({
  ...image,
  id: Number(image.id),
  variant_id: Number(image.variant_id),
  image_url: image.image_url || image.secure_url,
  sort_order: Number(image.sort_order || 0),
  is_primary: Boolean(image.is_primary)
}));

const formatVariant = (variant, images = []) => {
  const formattedImages = formatVariantImages(images);
  const mainImage = formattedImages.find(image => image.is_primary) || formattedImages[0] || null;
  const galleryImages = formattedImages.filter(image => !mainImage || image.id !== mainImage.id);
  const orderedImages = mainImage ? [mainImage, ...galleryImages] : formattedImages;

  return {
    ...variant,
    id: Number(variant.id),
    product_id: Number(variant.product_id),
    value: variant.value,
    color_name: variant.value,
    color_hex: variant.color_hex || null,
    stock_quantity: variant.stock_quantity === null || variant.stock_quantity === undefined
      ? null
      : Number(variant.stock_quantity),
    price_adjustment: Number(variant.price_adjustment || 0),
    sort_order: Number(variant.sort_order || 0),
    is_active: variant.is_active === undefined ? true : Boolean(variant.is_active),
    images: orderedImages,
    main_image: mainImage,
    gallery_images: galleryImages,
    image_url: mainImage?.image_url || galleryImages[0]?.image_url || null
  };
};

const formatProduct = (row, images = [], details = {}) => {
  const formattedImages = formatImages(images);
  const mainImage = formattedImages.find(image => image.is_primary) || formattedImages[0] || null;
  const galleryImages = formattedImages.filter(image => !mainImage || image.id !== mainImage.id);
  const primaryImage = mainImage?.image_url || row.category_image_url || '';

  const product = {
    id: Number(row.id),
    category_id: Number(row.category_id),
    category: row.category_name,
    category_slug: row.category_slug,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: row.price === null ? null : Number(row.price),
    material: row.material,
    color: row.color,
    size: row.size,
    stock_status: row.stock_status,
    whatsapp_message: row.whatsapp_message,
    is_featured: Boolean(row.is_featured),
    featured: Boolean(row.is_featured),
    is_active: Boolean(row.is_active),
    image_url: primaryImage,
    image: primaryImage,
    images: formattedImages,
    main_image: mainImage,
    gallery_images: galleryImages,
    variant_count: Number(row.variant_count || 0),
    has_variants: Number(row.variant_count || 0) > 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };

  if (details.includeDetails) {
    product.category_details = {
      id: Number(row.category_id),
      name: row.category_name,
      slug: row.category_slug,
      description: row.category_description,
      image: row.category_image_url,
      image_url: row.category_image_url
    };
    product.variants = details.variants || [];
    product.color_variants = product.variants.filter(variant => variant.name?.toLowerCase() === 'color');
    product.tags = details.tags || [];
  }

  return product;
};

const getImagesForProducts = async (productIds) => {
  if (!productIds.length) return new Map();

  const result = await query(`
    ${imageSelect}
    WHERE product_id = ANY($1::bigint[])
    ORDER BY product_id ASC, sort_order ASC, id ASC
  `, [productIds]);

  return result.rows.reduce((map, image) => {
    const productId = Number(image.product_id);
    if (!map.has(productId)) map.set(productId, []);
    map.get(productId).push(image);
    return map;
  }, new Map());
};

const getProductImages = async (productId, client = null) => {
  const result = await run(client, `
    ${imageSelect}
    WHERE product_id = $1
    ORDER BY sort_order ASC, id ASC
  `, [productId]);

  return result.rows;
};

const getVariantImagesForVariants = async (variantIds, client = null) => {
  if (!variantIds.length) return new Map();

  const result = await run(client, `
    ${variantImageSelect}
    WHERE variant_id = ANY($1::bigint[])
    ORDER BY variant_id ASC, is_primary DESC, sort_order ASC, id ASC
  `, [variantIds]);

  return result.rows.reduce((map, image) => {
    const variantId = Number(image.variant_id);
    if (!map.has(variantId)) map.set(variantId, []);
    map.get(variantId).push(image);
    return map;
  }, new Map());
};

const getProductVariantImages = async (variantId, client = null) => {
  const result = await run(client, `
    ${variantImageSelect}
    WHERE variant_id = $1
    ORDER BY is_primary DESC, sort_order ASC, id ASC
  `, [variantId]);

  return result.rows;
};

const getProductVariants = async (productId, client = null) => {
  const result = await run(client, `
    SELECT id, product_id, name, value, price_adjustment, stock_status, color_hex, stock_quantity, is_active, sort_order, created_at, updated_at
    FROM product_variants
    WHERE product_id = $1
    ORDER BY sort_order ASC, id ASC
  `, [productId]);

  const imagesByVariant = await getVariantImagesForVariants(result.rows.map(variant => Number(variant.id)), client);
  return result.rows.map(variant => formatVariant(variant, imagesByVariant.get(Number(variant.id)) || []));
};

const getVariantsForProducts = async (productIds) => {
  if (!productIds.length) return new Map();

  const result = await query(`
    SELECT id, product_id, name, value, price_adjustment, stock_status, color_hex, stock_quantity, is_active, sort_order, created_at, updated_at
    FROM product_variants
    WHERE product_id = ANY($1::bigint[])
    ORDER BY product_id ASC, sort_order ASC, id ASC
  `, [productIds]);

  const imagesByVariant = await getVariantImagesForVariants(result.rows.map(variant => Number(variant.id)));

  return result.rows.reduce((map, variant) => {
    const productId = Number(variant.product_id);
    if (!map.has(productId)) map.set(productId, []);
    map.get(productId).push(formatVariant(variant, imagesByVariant.get(Number(variant.id)) || []));
    return map;
  }, new Map());
};

const getProductTags = async (productId) => {
  const result = await query(`
    SELECT t.id, t.name, t.slug
    FROM product_tags t
    JOIN product_tag_relations r ON r.tag_id = t.id
    WHERE r.product_id = $1
    ORDER BY t.name ASC
  `, [productId]);

  return result.rows.map(tag => ({ ...tag, id: Number(tag.id) }));
};

const buildProductFilters = (filters = {}, options = {}) => {
  const conditions = [];
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (!options.includeInactive) {
    conditions.push('p.is_active = TRUE');
    conditions.push('c.is_active = TRUE');
  }

  if (filters.category) {
    const categoryParam = addParam(filters.category);
    conditions.push(`(c.slug = ${categoryParam} OR lower(c.name) = lower(${categoryParam}))`);
  }

  if (filters.search) {
    const searchParam = addParam(`%${filters.search}%`);
    conditions.push(`(
      p.name ILIKE ${searchParam}
      OR COALESCE(p.description, '') ILIKE ${searchParam}
      OR COALESCE(p.material, '') ILIKE ${searchParam}
      OR COALESCE(p.color, '') ILIKE ${searchParam}
    )`);
  }

  if (isTruthy(filters.featured)) {
    conditions.push('p.is_featured = TRUE');
  }

  if (filters.stock_status || filters.availability) {
    conditions.push(`p.stock_status = ${addParam(filters.stock_status || filters.availability)}`);
  }

  return {
    where: conditions.length ? conditions.join(' AND ') : 'TRUE',
    params
  };
};

const getProductOrderBy = (sort = '') => {
  if (sort === 'price-asc') return 'p.price ASC NULLS LAST, p.name ASC';
  if (sort === 'price-desc') return 'p.price DESC NULLS LAST, p.name ASC';
  if (sort === 'name') return 'p.name ASC';
  if (sort === 'oldest') return 'p.created_at ASC, p.id ASC';
  return 'p.is_featured DESC, p.created_at DESC, p.id DESC';
};

const listProducts = async (filters = {}, options = {}) => {
  const { where, params } = buildProductFilters(filters, options);
  const limit = Math.min(Number(filters.limit || options.limit || 100), 100);
  const page = Math.max(Number(filters.page || 1), 1);
  const offset = (page - 1) * limit;
  const rowsResult = await query(`
    ${productSelect}
    WHERE ${where}
    ORDER BY ${getProductOrderBy(filters.sort)}
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const productIds = rowsResult.rows.map(row => Number(row.id));
  const [imagesByProduct, variantsByProduct] = await Promise.all([
    getImagesForProducts(productIds),
    options.includeVariants ? getVariantsForProducts(productIds) : Promise.resolve(new Map())
  ]);

  return rowsResult.rows.map(row => formatProduct(
    row,
    imagesByProduct.get(Number(row.id)) || [],
    {
      includeDetails: Boolean(options.includeVariants),
      variants: variantsByProduct.get(Number(row.id)) || []
    }
  ));
};

const getProductByIdentifier = async (identifier, options = {}) => {
  const result = await query(`
    ${productSelect}
    WHERE ${options.includeInactive ? 'TRUE' : 'p.is_active = TRUE AND c.is_active = TRUE'}
      AND (p.slug = $1 OR p.id::text = $1)
    LIMIT 1
  `, [identifier]);

  if (!result.rows[0]) return null;

  const row = result.rows[0];
  const productId = Number(row.id);
  const [images, variants, tags] = await Promise.all([
    getProductImages(productId),
    getProductVariants(productId),
    getProductTags(productId)
  ]);

  const formattedProduct = formatProduct(row, images, {
    includeDetails: true,
    variants,
    tags
  });

  return formattedProduct;
};

const getProductBySlug = (slug) => getProductByIdentifier(slug);

const listCategories = async (options = {}) => {
  const result = await query(`
    SELECT id, name, slug, description, image_url, image_public_id, is_active, created_at, updated_at
    FROM categories
    WHERE ${options.includeInactive ? 'TRUE' : 'is_active = TRUE'}
    ORDER BY name ASC
  `);

  return result.rows.map(category => ({
    ...category,
    id: Number(category.id),
    image: category.image_url,
    is_active: Boolean(category.is_active)
  }));
};

const getCategoryByIdentifier = async (identifier, client = null) => {
  const result = await run(client, `
    SELECT id, name, slug, description, image_url, image_public_id, is_active, created_at, updated_at
    FROM categories
    WHERE slug = $1 OR id::text = $1
    LIMIT 1
  `, [identifier]);

  const category = result.rows[0];
  return category ? { ...category, id: Number(category.id), image: category.image_url } : null;
};

const getSettings = async () => {
  const result = await query(`
    SELECT id, store_name, whatsapp_number, instagram_url, default_whatsapp_message, currency, created_at, updated_at
    FROM catalog_settings
    WHERE id = 1
  `);

  const settings = result.rows[0];
  if (!settings) return null;

  return {
    ...settings,
    store_name: process.env.STORE_NAME || settings.store_name,
    whatsapp_number: process.env.WHATSAPP_NUMBER || settings.whatsapp_number,
    instagram_url: process.env.INSTAGRAM_URL || settings.instagram_url
  };
};

const getAdminByEmail = async (email) => {
  const result = await query(`
    SELECT id, name, email, password_hash, role, is_active, created_at, updated_at
    FROM admins
    WHERE email = $1
    LIMIT 1
  `, [normalizeEmail(email)]);

  return result.rows[0] || null;
};

const productSlugExists = async (slug, exceptId = null, client = null) => {
  const params = [slug];
  let exceptSql = '';

  if (exceptId) {
    params.push(exceptId);
    exceptSql = `AND id <> $${params.length}`;
  }

  const result = await run(client, `SELECT id FROM products WHERE slug = $1 ${exceptSql} LIMIT 1`, params);
  return result.rowCount > 0;
};

const categorySlugExists = async (slug, exceptId = null, client = null) => {
  const params = [slug];
  let exceptSql = '';

  if (exceptId) {
    params.push(exceptId);
    exceptSql = `AND id <> $${params.length}`;
  }

  const result = await run(client, `SELECT id FROM categories WHERE slug = $1 ${exceptSql} LIMIT 1`, params);
  return result.rowCount > 0;
};

const resolveCategoryId = async (value, client = null) => {
  if (!value) return null;
  const result = await run(client, `
    SELECT id
    FROM categories
    WHERE id::text = $1 OR slug = $1
    LIMIT 1
  `, [String(value)]);

  return result.rows[0]?.id ? Number(result.rows[0].id) : null;
};

const normalizeProductInput = (input = {}) => {
  const featured = input.featured ?? input.is_featured;
  return {
    category_id: input.category_id,
    category_slug: input.category_slug || input.category,
    name: input.name?.trim(),
    slug: normalizeSlug(input.slug, input.name),
    description: input.description || null,
    price: toNumber(input.price),
    material: input.material || null,
    color: input.color || null,
    size: input.size || null,
    stock_status: normalizeStockStatus(input.stock_status || input.availability),
    whatsapp_message: input.whatsapp_message || null,
    is_featured: normalizeBoolean(featured),
    is_active: input.is_active === undefined ? true : normalizeBoolean(input.is_active, true)
  };
};

const normalizeCategoryInput = (input = {}) => ({
  name: input.name?.trim(),
  slug: normalizeSlug(input.slug, input.name),
  description: input.description || null,
  is_active: input.is_active === undefined ? true : normalizeBoolean(input.is_active, true)
});

module.exports = {
  listProducts,
  getProductBySlug,
  getProductByIdentifier,
  listCategories,
  getCategoryByIdentifier,
  getSettings,
  getAdminByEmail,
  getProductImages,
  getProductVariants,
  getProductVariantImages,
  productSlugExists,
  categorySlugExists,
  resolveCategoryId,
  normalizeProductInput,
  normalizeCategoryInput,
  normalizeEmail,
  normalizeStockStatus,
  normalizeBoolean
};
