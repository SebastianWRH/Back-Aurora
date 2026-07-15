const { transaction, query } = require('./database');
const {
  getProductByIdentifier,
  getProductImages,
  getCategoryByIdentifier,
  productSlugExists,
  categorySlugExists,
  resolveCategoryId,
  normalizeProductInput,
  normalizeCategoryInput
} = require('./catalogRepository');
const { uploadBuffer, deleteImages, deleteImage } = require('./cloudinaryService');
const { createHttpError } = require('./httpError');

const parseJsonArray = (value, fallback = []) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return fallback;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const parseIdList = (value) => parseJsonArray(value)
  .map(item => Number(item))
  .filter(Number.isInteger);

const validateProduct = (product) => {
  if (!product.name) throw createHttpError(400, 'El nombre del producto es obligatorio');
  if (!product.slug) throw createHttpError(400, 'El slug del producto es obligatorio');
  if (product.price !== null && product.price < 0) throw createHttpError(400, 'El precio no puede ser negativo');
};

const validateCategory = (category) => {
  if (!category.name) throw createHttpError(400, 'El nombre de la categoria es obligatorio');
  if (!category.slug) throw createHttpError(400, 'El slug de la categoria es obligatorio');
};

const uploadFiles = async (files = [], folderType = 'products') => {
  const uploaded = [];

  try {
    for (const file of files) {
      uploaded.push(await uploadBuffer(file, folderType));
    }
    return uploaded;
  } catch (error) {
    await deleteImages(uploaded.map(image => image.public_id));
    throw error;
  }
};

const insertProductImages = async (client, productId, uploadedImages, productName, startOrder = 0) => {
  for (const [index, image] of uploadedImages.entries()) {
    await client.query(`
      INSERT INTO product_images (
        product_id, secure_url, public_id, width, height, format, alt_text, sort_order, is_primary
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      productId,
      image.secure_url,
      image.public_id,
      image.width,
      image.height,
      image.format,
      productName,
      startOrder + index,
      startOrder === 0 && index === 0
    ]);
  }
};

const replaceProductVariants = async (client, productId, variants) => {
  await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);

  for (const variant of variants) {
    if (!variant?.name || !variant?.value) continue;
    await client.query(`
      INSERT INTO product_variants (product_id, name, value, price_adjustment, stock_status)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      productId,
      variant.name,
      variant.value,
      Number(variant.price_adjustment || 0),
      variant.stock_status || 'Consultar disponibilidad'
    ]);
  }
};

const replaceProductTags = async (client, productId, tags) => {
  await client.query('DELETE FROM product_tag_relations WHERE product_id = $1', [productId]);

  for (const tag of tags) {
    const name = typeof tag === 'string' ? tag : tag?.name;
    const slug = typeof tag === 'string' ? tag : tag?.slug || tag?.name;
    if (!name || !slug) continue;

    const tagResult = await client.query(`
      INSERT INTO product_tags (name, slug)
      VALUES ($1, $2)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [name, slug]);

    await client.query(`
      INSERT INTO product_tag_relations (product_id, tag_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [productId, tagResult.rows[0].id]);
  }
};

const createProduct = async (body, files = []) => {
  const product = normalizeProductInput(body);
  const variants = parseJsonArray(body.variants);
  const tags = parseJsonArray(body.tags);
  validateProduct(product);

  const categoryId = await resolveCategoryId(product.category_id || product.category_slug);
  if (!categoryId) throw createHttpError(400, 'Categoria invalida');
  if (await productSlugExists(product.slug)) throw createHttpError(409, 'Ya existe un producto con ese slug');

  const uploadedImages = await uploadFiles(files, 'products');

  try {
    const productId = await transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO products (
          category_id, name, slug, description, price, material, color, size,
          stock_status, whatsapp_message, is_featured, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        categoryId,
        product.name,
        product.slug,
        product.description,
        product.price,
        product.material,
        product.color,
        product.size,
        product.stock_status,
        product.whatsapp_message,
        product.is_featured,
        product.is_active
      ]);

      const newProductId = Number(result.rows[0].id);
      await insertProductImages(client, newProductId, uploadedImages, product.name);

      if (variants.length) await replaceProductVariants(client, newProductId, variants);
      if (tags.length) await replaceProductTags(client, newProductId, tags);

      return newProductId;
    });

    return getProductByIdentifier(String(productId), { includeInactive: true });
  } catch (error) {
    await deleteImages(uploadedImages.map(image => image.public_id));
    throw error;
  }
};

const updateProductImageState = async (client, productId, imagePayload, primaryImageId) => {
  const imageUpdates = parseJsonArray(imagePayload);

  for (const [index, image] of imageUpdates.entries()) {
    if (!image?.id) continue;
    await client.query(`
      UPDATE product_images
      SET sort_order = $1,
          alt_text = COALESCE($2, alt_text),
          is_primary = $3
      WHERE id = $4 AND product_id = $5
    `, [
      Number.isInteger(Number(image.sort_order)) ? Number(image.sort_order) : index,
      image.alt_text || null,
      String(image.id) === String(primaryImageId),
      image.id,
      productId
    ]);
  }

  if (primaryImageId) {
    await client.query('UPDATE product_images SET is_primary = FALSE WHERE product_id = $1 AND id <> $2', [productId, primaryImageId]);
    await client.query('UPDATE product_images SET is_primary = TRUE WHERE product_id = $1 AND id = $2', [productId, primaryImageId]);
  }
};

const updateProduct = async (identifier, body, files = []) => {
  const existing = await getProductByIdentifier(identifier, { includeInactive: true });
  if (!existing) throw createHttpError(404, 'Producto no encontrado');

  const incoming = normalizeProductInput({
    ...existing,
    ...body,
    slug: body.slug || existing.slug,
    category_id: body.category_id || body.category_slug || existing.category_id
  });
  validateProduct(incoming);

  const categoryId = await resolveCategoryId(body.category_id || body.category_slug || existing.category_id);
  if (!categoryId) throw createHttpError(400, 'Categoria invalida');
  if (await productSlugExists(incoming.slug, existing.id)) throw createHttpError(409, 'Ya existe un producto con ese slug');

  const uploadedImages = await uploadFiles(files, 'products');
  const removeImageIds = parseIdList(body.remove_image_ids || body.removed_image_ids);
  const oldImages = await getProductImages(existing.id);
  const imagesToDelete = oldImages.filter(image => removeImageIds.includes(Number(image.id)));
  const variants = body.variants !== undefined ? parseJsonArray(body.variants) : null;
  const tags = body.tags !== undefined ? parseJsonArray(body.tags) : null;

  try {
    await transaction(async (client) => {
      await client.query(`
        UPDATE products
        SET category_id = $1,
            name = $2,
            slug = $3,
            description = $4,
            price = $5,
            material = $6,
            color = $7,
            size = $8,
            stock_status = $9,
            whatsapp_message = $10,
            is_featured = $11,
            is_active = $12
        WHERE id = $13
      `, [
        categoryId,
        incoming.name,
        incoming.slug,
        incoming.description,
        incoming.price,
        incoming.material,
        incoming.color,
        incoming.size,
        incoming.stock_status,
        incoming.whatsapp_message,
        incoming.is_featured,
        incoming.is_active,
        existing.id
      ]);

      if (removeImageIds.length) {
        await client.query('DELETE FROM product_images WHERE product_id = $1 AND id = ANY($2::bigint[])', [existing.id, removeImageIds]);
      }

      await updateProductImageState(client, existing.id, body.images, body.primary_image_id);
      await insertProductImages(client, existing.id, uploadedImages, incoming.name, oldImages.length);

      if (variants) await replaceProductVariants(client, existing.id, variants);
      if (tags) await replaceProductTags(client, existing.id, tags);
    });
  } catch (error) {
    await deleteImages(uploadedImages.map(image => image.public_id));
    throw error;
  }

  await deleteImages(imagesToDelete.map(image => image.public_id));
  return getProductByIdentifier(String(existing.id), { includeInactive: true });
};

const deleteProduct = async (identifier) => {
  const existing = await getProductByIdentifier(identifier, { includeInactive: true });
  if (!existing) throw createHttpError(404, 'Producto no encontrado');

  const images = await getProductImages(existing.id);
  await transaction(async (client) => {
    await client.query('DELETE FROM products WHERE id = $1', [existing.id]);
  });
  await deleteImages(images.map(image => image.public_id));
};

const addProductImages = async (identifier, files = []) => {
  const existing = await getProductByIdentifier(identifier, { includeInactive: true });
  if (!existing) throw createHttpError(404, 'Producto no encontrado');
  if (!files.length) throw createHttpError(400, 'Debes enviar al menos una imagen');

  const oldImages = await getProductImages(existing.id);
  const uploadedImages = await uploadFiles(files, 'products');

  try {
    await transaction(async (client) => {
      await insertProductImages(client, existing.id, uploadedImages, existing.name, oldImages.length);
    });
  } catch (error) {
    await deleteImages(uploadedImages.map(image => image.public_id));
    throw error;
  }

  return getProductByIdentifier(String(existing.id), { includeInactive: true });
};

const deleteProductImage = async (productIdentifier, imageId) => {
  const product = await getProductByIdentifier(productIdentifier, { includeInactive: true });
  if (!product) throw createHttpError(404, 'Producto no encontrado');

  const images = await getProductImages(product.id);
  const image = images.find(item => String(item.id) === String(imageId));
  if (!image) throw createHttpError(404, 'Imagen no encontrada');

  await transaction(async (client) => {
    await client.query('DELETE FROM product_images WHERE product_id = $1 AND id = $2', [product.id, imageId]);
  });
  await deleteImage(image.public_id);
};

const createCategory = async (body, file = null) => {
  const category = normalizeCategoryInput(body);
  validateCategory(category);
  if (await categorySlugExists(category.slug)) throw createHttpError(409, 'Ya existe una categoria con ese slug');

  const uploadedImage = file ? await uploadBuffer(file, 'categories') : null;

  try {
    const categoryId = await transaction(async (client) => {
      const result = await client.query(`
        INSERT INTO categories (name, slug, description, image_url, image_public_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        category.name,
        category.slug,
        category.description,
        uploadedImage?.secure_url || null,
        uploadedImage?.public_id || null,
        category.is_active
      ]);
      return Number(result.rows[0].id);
    });

    return getCategoryByIdentifier(String(categoryId));
  } catch (error) {
    await deleteImage(uploadedImage?.public_id);
    throw error;
  }
};

const updateCategory = async (identifier, body, file = null) => {
  const existing = await getCategoryByIdentifier(identifier);
  if (!existing) throw createHttpError(404, 'Categoria no encontrada');

  const incoming = normalizeCategoryInput({
    ...existing,
    ...body,
    slug: body.slug || existing.slug
  });
  validateCategory(incoming);
  if (await categorySlugExists(incoming.slug, existing.id)) throw createHttpError(409, 'Ya existe una categoria con ese slug');

  const uploadedImage = file ? await uploadBuffer(file, 'categories') : null;

  try {
    await transaction(async (client) => {
      await client.query(`
        UPDATE categories
        SET name = $1,
            slug = $2,
            description = $3,
            image_url = COALESCE($4, image_url),
            image_public_id = COALESCE($5, image_public_id),
            is_active = $6
        WHERE id = $7
      `, [
        incoming.name,
        incoming.slug,
        incoming.description,
        uploadedImage?.secure_url || null,
        uploadedImage?.public_id || null,
        incoming.is_active,
        existing.id
      ]);
    });
  } catch (error) {
    await deleteImage(uploadedImage?.public_id);
    throw error;
  }

  if (uploadedImage && existing.image_public_id) {
    await deleteImage(existing.image_public_id);
  }

  return getCategoryByIdentifier(String(existing.id));
};

const deleteCategory = async (identifier) => {
  const existing = await getCategoryByIdentifier(identifier);
  if (!existing) throw createHttpError(404, 'Categoria no encontrada');

  try {
    await query('DELETE FROM categories WHERE id = $1', [existing.id]);
  } catch (error) {
    if (error.code === '23503') {
      throw createHttpError(409, 'No se puede eliminar una categoria con productos asociados');
    }
    throw error;
  }

  await deleteImage(existing.image_public_id);
};

const updateCatalogSettings = async (body = {}) => {
  const storeName = body.store_name?.trim();
  const whatsappNumber = body.whatsapp_number?.trim();

  if (!storeName) throw createHttpError(400, 'El nombre de la tienda es obligatorio');
  if (!whatsappNumber) throw createHttpError(400, 'El numero de WhatsApp es obligatorio');

  const result = await query(`
    INSERT INTO catalog_settings (
      id, store_name, whatsapp_number, instagram_url, default_whatsapp_message, currency
    )
    VALUES (1, $1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE
    SET store_name = EXCLUDED.store_name,
        whatsapp_number = EXCLUDED.whatsapp_number,
        instagram_url = EXCLUDED.instagram_url,
        default_whatsapp_message = EXCLUDED.default_whatsapp_message,
        currency = EXCLUDED.currency
    RETURNING id, store_name, whatsapp_number, instagram_url, default_whatsapp_message, currency, created_at, updated_at
  `, [
    storeName,
    whatsappNumber,
    body.instagram_url?.trim() || null,
    body.default_whatsapp_message?.trim() || null,
    body.currency?.trim() || 'S/'
  ]);

  return result.rows[0];
};

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  addProductImages,
  deleteProductImage,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCatalogSettings
};
