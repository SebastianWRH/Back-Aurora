const { transaction, query } = require('./database');
const {
  getProductByIdentifier,
  getProductImages,
  getProductVariants,
  getProductVariantImages,
  getCategoryByIdentifier,
  productSlugExists,
  categorySlugExists,
  resolveCategoryId,
  normalizeProductInput,
  normalizeCategoryInput,
  normalizeStockStatus,
  normalizeBoolean
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

const parseJsonObject = (value, fallback = {}) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const toInteger = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const normalizeHexColor = (value = '') => {
  const color = String(value || '').trim();
  if (!color) return null;
  return color.startsWith('#') ? color : `#${color}`;
};

const isValidHexColor = (value) => !value || /^#[0-9a-fA-F]{6}$/.test(value);

const getFieldFileKey = (fieldName = '', prefixes = []) => {
  let key = fieldName;

  for (const prefix of prefixes) {
    key = key.replace(prefix, '');
  }

  return key.replace(/\]$/, '');
};

const addGroupedFile = (map, key, file) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(file);
};

const groupProductFiles = (files = []) => {
  const grouped = {
    mainImage: null,
    galleryImages: [],
    legacyImages: [],
    variantCoverImages: new Map(),
    variantGalleryImages: new Map(),
    variantImages: new Map()
  };

  for (const file of files) {
    if (file.fieldname === 'main_image' || file.fieldname === 'mainImage') {
      grouped.mainImage = grouped.mainImage || file;
      continue;
    }

    if (file.fieldname === 'gallery_images' || file.fieldname === 'galleryImages') {
      grouped.galleryImages.push(file);
      continue;
    }

    if (file.fieldname === 'images') {
      grouped.legacyImages.push(file);
      continue;
    }

    if (file.fieldname.startsWith('variant_cover_') || file.fieldname.startsWith('variantCover_') || file.fieldname.startsWith('variantCover[')) {
      const key = getFieldFileKey(file.fieldname, [/^variant_cover_/, /^variantCover_/, /^variantCover\[/]);
      addGroupedFile(grouped.variantCoverImages, key, file);
      continue;
    }

    if (file.fieldname.startsWith('variant_gallery_') || file.fieldname.startsWith('variantGallery_') || file.fieldname.startsWith('variantGallery[')) {
      const key = getFieldFileKey(file.fieldname, [/^variant_gallery_/, /^variantGallery_/, /^variantGallery\[/]);
      addGroupedFile(grouped.variantGalleryImages, key, file);
      continue;
    }

    if (file.fieldname.startsWith('variant_images_') || file.fieldname.startsWith('variantImages_') || file.fieldname.startsWith('variantImages[')) {
      const key = getFieldFileKey(file.fieldname, [/^variant_images_/, /^variantImages_/, /^variantImages\[/]);
      addGroupedFile(grouped.variantImages, key, file);
    }
  }

  return grouped;
};

const validateProduct = (product) => {
  if (!product.name) throw createHttpError(400, 'El nombre del producto es obligatorio');
  if (!product.slug) throw createHttpError(400, 'El slug del producto es obligatorio');
  if (product.price !== null && product.price < 0) throw createHttpError(400, 'El precio no puede ser negativo');
};

const normalizeVariantInput = (variant = {}, index = 0) => {
  const value = String(variant.value || variant.color_name || variant.color || '').trim();
  const colorHex = normalizeHexColor(variant.color_hex || variant.hex);
  const stockQuantity = toInteger(variant.stock_quantity ?? variant.stock);
  const mainImageId = toInteger(
    variant.main_image_id ||
    variant.primary_image_id ||
    variant.cover_image_id ||
    variant.main_image?.id
  );

  return {
    id: variant.id ? Number(variant.id) : null,
    client_id: String(variant.client_id || variant.clientId || variant.temp_id || variant.id || `variant-${index}`),
    name: String(variant.name || 'Color').trim() || 'Color',
    value,
    price_adjustment: Number(variant.price_adjustment || 0),
    stock_status: normalizeStockStatus(variant.stock_status),
    color_hex: colorHex,
    stock_quantity: stockQuantity,
    is_active: normalizeBoolean(variant.is_active, true),
    sort_order: Number.isInteger(Number(variant.sort_order)) ? Number(variant.sort_order) : index,
    main_image_id: mainImageId,
    images: parseJsonArray(variant.images),
    remove_image_ids: parseIdList(variant.remove_image_ids || variant.removed_image_ids)
  };
};

const normalizeVariantsInput = (variants = []) => parseJsonArray(variants)
  .map((variant, index) => normalizeVariantInput(variant, index))
  .filter(variant => variant.value);

const validateVariants = (variants = []) => {
  const names = new Set();

  for (const variant of variants) {
    if (!variant.value) throw createHttpError(400, 'Cada color debe tener nombre');
    if (!isValidHexColor(variant.color_hex)) throw createHttpError(400, `Color hexadecimal invalido para ${variant.value}`);
    if (variant.stock_quantity !== null && variant.stock_quantity < 0) throw createHttpError(400, `Stock invalido para ${variant.value}`);

    const key = variant.value.toLowerCase();
    if (names.has(key)) throw createHttpError(400, `Color duplicado: ${variant.value}`);
    names.add(key);
  }
};

const validateVariantFileGroups = (variants = [], groupedFiles) => {
  const validKeys = new Set();

  variants.forEach((variant) => {
    validKeys.add(String(variant.client_id));
    if (variant.id) validKeys.add(String(variant.id));
  });

  const assertValidKeys = (map, label) => {
    for (const [key] of map.entries()) {
      if (!validKeys.has(String(key))) {
        throw createHttpError(400, `Imagen de ${label} sin color relacionado`);
      }
    }
  };

  assertValidKeys(groupedFiles.variantCoverImages, 'portada');
  assertValidKeys(groupedFiles.variantGalleryImages, 'galeria');
  assertValidKeys(groupedFiles.variantImages, 'color');

  for (const [key, files] of groupedFiles.variantCoverImages.entries()) {
    if (files.length > 1) {
      throw createHttpError(400, `Solo se permite una portada para el color ${key}`);
    }
  }
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

const uploadVariantFileGroups = async (variantFiles = new Map()) => {
  const uploaded = new Map();
  const uploadedPublicIds = [];

  try {
    for (const [key, files] of variantFiles.entries()) {
      const images = await uploadFiles(files, 'products');
      uploaded.set(String(key), images);
      uploadedPublicIds.push(...images.map(image => image.public_id));
    }

    return { uploaded, uploadedPublicIds };
  } catch (error) {
    await deleteImages(uploadedPublicIds);
    throw error;
  }
};

const insertProductImages = async (client, productId, uploadedImages, productName, startOrder = 0, options = {}) => {
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
      Boolean(options.primary)
    ]);
  }
};

const replaceProductVariants = async (client, productId, variants) => {
  await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);

  for (const [index, rawVariant] of variants.entries()) {
    const variant = normalizeVariantInput(rawVariant, index);
    if (!variant.value) continue;
    await client.query(`
      INSERT INTO product_variants (
        product_id, name, value, price_adjustment, stock_status, color_hex, stock_quantity, is_active, sort_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      productId,
      variant.name,
      variant.value,
      Number(variant.price_adjustment || 0),
      variant.stock_status || 'Consultar disponibilidad',
      variant.color_hex,
      variant.stock_quantity,
      variant.is_active,
      variant.sort_order
    ]);
  }
};

const insertVariantImages = async (client, variantId, uploadedImages, productName, variantValue, startOrder = 0, options = {}) => {
  for (const [index, image] of uploadedImages.entries()) {
    await client.query(`
      INSERT INTO product_variant_images (
        variant_id, secure_url, public_id, width, height, format, alt_text, sort_order, is_primary
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      variantId,
      image.secure_url,
      image.public_id,
      image.width,
      image.height,
      image.format,
      `${productName} - ${variantValue}`,
      startOrder + index,
      Boolean(options.primary)
    ]);
  }
};

const updateVariantImageState = async (client, variantId, images, primaryImageId = null) => {
  if (primaryImageId) {
    await client.query('UPDATE product_variant_images SET is_primary = FALSE WHERE variant_id = $1', [variantId]);
  }

  for (const [index, image] of parseJsonArray(images).entries()) {
    if (!image?.id) continue;
    await client.query(`
      UPDATE product_variant_images
      SET sort_order = $1,
          alt_text = COALESCE($2, alt_text),
          is_primary = $3
      WHERE id = $4 AND variant_id = $5
    `, [
      Number.isInteger(Number(image.sort_order)) ? Number(image.sort_order) : index,
      image.alt_text || null,
      primaryImageId
        ? String(image.id) === String(primaryImageId)
        : Boolean(image.is_primary),
      image.id,
      variantId
    ]);
  }

  if (primaryImageId) {
    await client.query('UPDATE product_variant_images SET is_primary = TRUE WHERE variant_id = $1 AND id = $2', [variantId, primaryImageId]);
  }
};

const getUploadedVariantFiles = (map, variant) => (
  map.get(String(variant.client_id)) || map.get(String(variant.id)) || []
);

const getNextImageOrder = (images = []) => (
  images.length
    ? Math.max(...images.map(image => Number(image.sort_order || 0))) + 1
    : 0
);

const syncProductVariants = async (client, productId, productName, variants, uploadedVariantImages = {}) => {
  const uploadedCoverImages = uploadedVariantImages.coverImages || new Map();
  const uploadedGalleryImages = uploadedVariantImages.galleryImages || new Map();
  const uploadedLegacyImages = uploadedVariantImages instanceof Map
    ? uploadedVariantImages
    : uploadedVariantImages.legacyImages || new Map();
  const existingVariants = await getProductVariants(productId, client);
  const existingIds = new Set(existingVariants.map(variant => Number(variant.id)));
  const incomingIds = new Set(variants.filter(variant => variant.id).map(variant => Number(variant.id)));
  const variantImagesToDelete = [];

  for (const variant of existingVariants) {
    if (!incomingIds.has(Number(variant.id))) {
      const images = await getProductVariantImages(variant.id, client);
      variantImagesToDelete.push(...images.map(image => image.public_id));
      await client.query('DELETE FROM product_variants WHERE id = $1 AND product_id = $2', [variant.id, productId]);
    }
  }

  for (const variant of variants) {
    if (variant.id && !existingIds.has(Number(variant.id))) {
      throw createHttpError(400, `Variante invalida: ${variant.value}`);
    }

    let variantId = variant.id;

    if (variantId) {
      await client.query(`
        UPDATE product_variants
        SET name = $1,
            value = $2,
            price_adjustment = $3,
            stock_status = $4,
            color_hex = $5,
            stock_quantity = $6,
            is_active = $7,
            sort_order = $8
        WHERE id = $9 AND product_id = $10
      `, [
        variant.name,
        variant.value,
        variant.price_adjustment,
        variant.stock_status,
        variant.color_hex,
        variant.stock_quantity,
        variant.is_active,
        variant.sort_order,
        variantId,
        productId
      ]);
    } else {
      const result = await client.query(`
        INSERT INTO product_variants (
          product_id, name, value, price_adjustment, stock_status, color_hex, stock_quantity, is_active, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
        productId,
        variant.name,
        variant.value,
        variant.price_adjustment,
        variant.stock_status,
        variant.color_hex,
        variant.stock_quantity,
        variant.is_active,
        variant.sort_order
      ]);
      variantId = Number(result.rows[0].id);
    }

    if (variant.remove_image_ids.length) {
      const oldImages = await getProductVariantImages(variantId, client);
      variantImagesToDelete.push(...oldImages
        .filter(image => variant.remove_image_ids.includes(Number(image.id)))
        .map(image => image.public_id));
      await client.query(
        'DELETE FROM product_variant_images WHERE variant_id = $1 AND id = ANY($2::bigint[])',
        [variantId, variant.remove_image_ids]
      );
    }

    await updateVariantImageState(client, variantId, variant.images, variant.main_image_id);

    const nextCoverImages = getUploadedVariantFiles(uploadedCoverImages, variant);
    const nextGalleryImages = getUploadedVariantFiles(uploadedGalleryImages, variant);
    const nextLegacyImages = getUploadedVariantFiles(uploadedLegacyImages, variant);

    if (nextCoverImages.length) {
      await client.query('UPDATE product_variant_images SET is_primary = FALSE WHERE variant_id = $1', [variantId]);
      await insertVariantImages(client, variantId, nextCoverImages.slice(0, 1), productName, variant.value, 0, { primary: true });
    }

    let currentImages = await getProductVariantImages(variantId, client);
    let imageOrder = getNextImageOrder(currentImages);

    if (nextGalleryImages.length) {
      await insertVariantImages(client, variantId, nextGalleryImages, productName, variant.value, imageOrder);
      imageOrder += nextGalleryImages.length;
    }

    if (nextLegacyImages.length) {
      currentImages = await getProductVariantImages(variantId, client);
      const hasPrimaryImage = currentImages.some(image => image.is_primary);
      const legacyMain = hasPrimaryImage ? [] : nextLegacyImages.slice(0, 1);
      const legacyGallery = hasPrimaryImage ? nextLegacyImages : nextLegacyImages.slice(1);

      if (legacyMain.length) {
        await client.query('UPDATE product_variant_images SET is_primary = FALSE WHERE variant_id = $1', [variantId]);
        await insertVariantImages(client, variantId, legacyMain, productName, variant.value, 0, { primary: true });
      }

      if (legacyGallery.length) {
        const nextOrder = getNextImageOrder(await getProductVariantImages(variantId, client));
        await insertVariantImages(client, variantId, legacyGallery, productName, variant.value, nextOrder);
      }
    }
  }

  return variantImagesToDelete;
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
  const variants = normalizeVariantsInput(body.variants);
  const tags = parseJsonArray(body.tags);
  const groupedFiles = groupProductFiles(files);
  validateProduct(product);
  validateVariants(variants);
  validateVariantFileGroups(variants, groupedFiles);

  const categoryId = await resolveCategoryId(product.category_id || product.category_slug);
  if (!categoryId) throw createHttpError(400, 'Categoria invalida');
  if (await productSlugExists(product.slug)) throw createHttpError(409, 'Ya existe un producto con ese slug');

  const uploadedMainImage = groupedFiles.mainImage ? await uploadFiles([groupedFiles.mainImage], 'products') : [];
  const uploadedGalleryImages = await uploadFiles(groupedFiles.galleryImages, 'products');
  const uploadedLegacyImages = await uploadFiles(groupedFiles.legacyImages, 'products');
  const { uploaded: uploadedVariantCoverImages, uploadedPublicIds: uploadedVariantCoverPublicIds } =
    await uploadVariantFileGroups(groupedFiles.variantCoverImages);
  const { uploaded: uploadedVariantGalleryImages, uploadedPublicIds: uploadedVariantGalleryPublicIds } =
    await uploadVariantFileGroups(groupedFiles.variantGalleryImages);
  const { uploaded: uploadedLegacyVariantImages, uploadedPublicIds: uploadedLegacyVariantPublicIds } =
    await uploadVariantFileGroups(groupedFiles.variantImages);
  const uploadedImages = [
    ...uploadedMainImage,
    ...uploadedGalleryImages,
    ...uploadedLegacyImages,
    ...uploadedVariantCoverPublicIds.map(public_id => ({ public_id })),
    ...uploadedVariantGalleryPublicIds.map(public_id => ({ public_id })),
    ...uploadedLegacyVariantPublicIds.map(public_id => ({ public_id }))
  ];

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
      let imageOrder = 0;

      if (uploadedMainImage.length) {
        await insertProductImages(client, newProductId, uploadedMainImage, product.name, imageOrder, { primary: true });
        imageOrder += uploadedMainImage.length;
      }

      if (uploadedGalleryImages.length) {
        await insertProductImages(client, newProductId, uploadedGalleryImages, product.name, imageOrder);
        imageOrder += uploadedGalleryImages.length;
      }

      if (uploadedLegacyImages.length) {
        const legacyMain = uploadedMainImage.length ? [] : uploadedLegacyImages.slice(0, 1);
        const legacyGallery = uploadedMainImage.length ? uploadedLegacyImages : uploadedLegacyImages.slice(1);

        if (legacyMain.length) {
          await insertProductImages(client, newProductId, legacyMain, product.name, imageOrder, { primary: true });
          imageOrder += legacyMain.length;
        }

        if (legacyGallery.length) {
          await insertProductImages(client, newProductId, legacyGallery, product.name, imageOrder);
        }
      }

      if (variants.length) {
        await syncProductVariants(client, newProductId, product.name, variants, {
          coverImages: uploadedVariantCoverImages,
          galleryImages: uploadedVariantGalleryImages,
          legacyImages: uploadedLegacyVariantImages
        });
      }
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

  const groupedFiles = groupProductFiles(files);
  const variants = body.variants !== undefined ? normalizeVariantsInput(body.variants) : null;
  if (variants) {
    validateVariants(variants);
    validateVariantFileGroups(variants, groupedFiles);
  } else {
    validateVariantFileGroups([], groupedFiles);
  }

  const uploadedMainImage = groupedFiles.mainImage ? await uploadFiles([groupedFiles.mainImage], 'products') : [];
  const uploadedGalleryImages = await uploadFiles(groupedFiles.galleryImages, 'products');
  const uploadedLegacyImages = await uploadFiles(groupedFiles.legacyImages, 'products');
  const { uploaded: uploadedVariantCoverImages, uploadedPublicIds: uploadedVariantCoverPublicIds } =
    await uploadVariantFileGroups(groupedFiles.variantCoverImages);
  const { uploaded: uploadedVariantGalleryImages, uploadedPublicIds: uploadedVariantGalleryPublicIds } =
    await uploadVariantFileGroups(groupedFiles.variantGalleryImages);
  const { uploaded: uploadedLegacyVariantImages, uploadedPublicIds: uploadedLegacyVariantPublicIds } =
    await uploadVariantFileGroups(groupedFiles.variantImages);
  const uploadedImages = [
    ...uploadedMainImage,
    ...uploadedGalleryImages,
    ...uploadedLegacyImages,
    ...uploadedVariantCoverPublicIds.map(public_id => ({ public_id })),
    ...uploadedVariantGalleryPublicIds.map(public_id => ({ public_id })),
    ...uploadedLegacyVariantPublicIds.map(public_id => ({ public_id }))
  ];
  const removeImageIds = parseIdList(body.remove_image_ids || body.removed_image_ids);
  const oldImages = await getProductImages(existing.id);
  const imagesToDelete = oldImages.filter(image => removeImageIds.includes(Number(image.id)));
  const tags = body.tags !== undefined ? parseJsonArray(body.tags) : null;
  const galleryImagePayload = body.gallery_images_meta || body.gallery_images || body.images;
  const primaryImageId = body.primary_image_id || body.main_image_id;
  const deletedVariantPublicIds = [];

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

      await updateProductImageState(client, existing.id, galleryImagePayload, primaryImageId);

      const activeImages = oldImages.filter(image => !removeImageIds.includes(Number(image.id)));
      let imageOrder = activeImages.length
        ? Math.max(...activeImages.map(image => Number(image.sort_order || 0))) + 1
        : 0;

      if (uploadedMainImage.length) {
        await client.query('UPDATE product_images SET is_primary = FALSE WHERE product_id = $1', [existing.id]);
        await insertProductImages(client, existing.id, uploadedMainImage, incoming.name, imageOrder, { primary: true });
        imageOrder += uploadedMainImage.length;
      }

      if (uploadedGalleryImages.length) {
        await insertProductImages(client, existing.id, uploadedGalleryImages, incoming.name, imageOrder);
        imageOrder += uploadedGalleryImages.length;
      }

      if (uploadedLegacyImages.length) {
        await insertProductImages(client, existing.id, uploadedLegacyImages, incoming.name, imageOrder);
      }

      if (variants) {
        deletedVariantPublicIds.push(...await syncProductVariants(
          client,
          existing.id,
          incoming.name,
          variants,
          {
            coverImages: uploadedVariantCoverImages,
            galleryImages: uploadedVariantGalleryImages,
            legacyImages: uploadedLegacyVariantImages
          }
        ));
      }
      if (tags) await replaceProductTags(client, existing.id, tags);
    });
  } catch (error) {
    await deleteImages(uploadedImages.map(image => image.public_id));
    throw error;
  }

  await deleteImages(imagesToDelete.map(image => image.public_id));
  await deleteImages(deletedVariantPublicIds);
  return getProductByIdentifier(String(existing.id), { includeInactive: true });
};

const deleteProduct = async (identifier) => {
  const existing = await getProductByIdentifier(identifier, { includeInactive: true });
  if (!existing) throw createHttpError(404, 'Producto no encontrado');

  const images = await getProductImages(existing.id);
  const variants = await getProductVariants(existing.id);
  const variantImagePublicIds = variants.flatMap(variant => variant.images?.map(image => image.public_id) || []);
  await transaction(async (client) => {
    await client.query('DELETE FROM products WHERE id = $1', [existing.id]);
  });
  await deleteImages([...images.map(image => image.public_id), ...variantImagePublicIds]);
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
