require('dotenv').config();

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { transaction, query, closePool } = require('../src/database');
const { uploadSource, deleteImages } = require('../src/cloudinaryService');
const { slugify } = require('../src/slugify');

const sourceDatabase = process.env.SQLITE_DATABASE_PATH ||
  process.env.OLD_DATABASE_PATH ||
  path.resolve(__dirname, '..', 'data', 'catalog.db');
const publicDir = process.env.SOURCE_PUBLIC_DIR ||
  path.resolve(__dirname, '..', '..', 'Front-Aurora', 'public');

const isRemoteUrl = (value = '') => /^https?:\/\//i.test(value);

const resolveImageSource = (imageUrl) => {
  if (!imageUrl) return null;
  if (isRemoteUrl(imageUrl)) return imageUrl;

  const normalized = imageUrl.replace(/^[\\/]+/, '');
  return path.resolve(publicDir, normalized);
};

const uploadOptionalImage = async (imageUrl, folderType) => {
  const source = resolveImageSource(imageUrl);
  if (!source) return null;
  return uploadSource(source, folderType);
};

const getRows = (db, sql) => db.prepare(sql).all();

const run = async () => {
  const source = new DatabaseSync(sourceDatabase, { readOnly: true });
  const summary = {
    categories: { processed: 0, migrated: 0, skipped: 0, failed: 0 },
    products: { processed: 0, migrated: 0, skipped: 0, failed: 0 },
    images: { processed: 0, migrated: 0, skipped: 0, failed: 0 }
  };

  try {
    const categories = getRows(source, 'SELECT * FROM categories ORDER BY id ASC');
    const products = getRows(source, 'SELECT * FROM products ORDER BY id ASC');
    const images = getRows(source, 'SELECT * FROM product_images ORDER BY product_id ASC, sort_order ASC, id ASC');
    const variants = getRows(source, 'SELECT * FROM product_variants ORDER BY product_id ASC, id ASC');
    const tags = getRows(source, 'SELECT * FROM product_tags ORDER BY id ASC');
    const tagRelations = getRows(source, 'SELECT * FROM product_tag_relations');
    const settings = getRows(source, 'SELECT * FROM catalog_settings WHERE id = 1 LIMIT 1')[0];

    const categoryIds = new Map();
    const tagIds = new Map();

    for (const category of categories) {
      summary.categories.processed += 1;
      const uploaded = [];

      try {
        const existing = await query('SELECT id, image_public_id FROM categories WHERE slug = $1', [category.slug]);
        let image = null;

        if (!existing.rows[0]?.image_public_id && category.image) {
          image = await uploadOptionalImage(category.image, 'categories');
          if (image?.public_id) uploaded.push(image.public_id);
        }

        const result = await query(`
          INSERT INTO categories (name, slug, description, image_url, image_public_id, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (slug) DO UPDATE
          SET name = EXCLUDED.name,
              description = EXCLUDED.description,
              image_url = COALESCE(categories.image_url, EXCLUDED.image_url),
              image_public_id = COALESCE(categories.image_public_id, EXCLUDED.image_public_id),
              is_active = EXCLUDED.is_active
          RETURNING id
        `, [
          category.name,
          category.slug || slugify(category.name),
          category.description || null,
          image?.secure_url || category.image || null,
          image?.public_id || null,
          Boolean(category.is_active)
        ]);

        categoryIds.set(category.id, result.rows[0].id);
        summary.categories.migrated += 1;
      } catch (error) {
        await deleteImages(uploaded);
        summary.categories.failed += 1;
        console.error(`Category migration failed for ${category.slug || category.id}: ${error.message}`);
      }
    }

    for (const tag of tags) {
      const result = await query(`
        INSERT INTO product_tags (name, slug)
        VALUES ($1, $2)
        ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [tag.name, tag.slug || slugify(tag.name)]);
      tagIds.set(tag.id, result.rows[0].id);
    }

    for (const product of products) {
      summary.products.processed += 1;
      const productImages = images.filter(image => image.product_id === product.id);
      const productVariants = variants.filter(variant => variant.product_id === product.id);
      const productTagIds = tagRelations
        .filter(relation => relation.product_id === product.id)
        .map(relation => tagIds.get(relation.tag_id))
        .filter(Boolean);
      const uploaded = [];

      try {
        const productSlug = product.slug || slugify(product.name);
        const existing = await query('SELECT id FROM products WHERE slug = $1 LIMIT 1', [productSlug]);
        const existingImageCount = existing.rows[0]
          ? await query('SELECT COUNT(*) AS count FROM product_images WHERE product_id = $1', [existing.rows[0].id])
          : null;

        const uploadedImages = [];
        if (!existingImageCount || Number(existingImageCount.rows[0].count) === 0) {
          for (const image of productImages) {
            summary.images.processed += 1;
            const uploadedImage = await uploadOptionalImage(image.image_url, 'products');
            if (uploadedImage?.public_id) uploaded.push(uploadedImage.public_id);
            uploadedImages.push({ source: image, uploaded: uploadedImage });
          }
        } else {
          summary.images.skipped += productImages.length;
        }

        await transaction(async (client) => {
          const productResult = await client.query(`
            INSERT INTO products (
              category_id, name, slug, description, price, material, color, size,
              stock_status, is_featured, is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (slug) DO UPDATE
            SET category_id = EXCLUDED.category_id,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                price = EXCLUDED.price,
                material = EXCLUDED.material,
                color = EXCLUDED.color,
                size = EXCLUDED.size,
                stock_status = EXCLUDED.stock_status,
                is_featured = EXCLUDED.is_featured,
                is_active = EXCLUDED.is_active
            RETURNING id
          `, [
            categoryIds.get(product.category_id),
            product.name,
            productSlug,
            product.description || null,
            product.price,
            product.material || null,
            product.color || null,
            product.size || null,
            product.stock_status || 'Consultar disponibilidad',
            Boolean(product.is_featured),
            Boolean(product.is_active)
          ]);

          const postgresProductId = productResult.rows[0].id;

          if (uploadedImages.length) {
            for (const [index, item] of uploadedImages.entries()) {
              if (!item.uploaded) {
                summary.images.failed += 1;
                continue;
              }

              await client.query(`
                INSERT INTO product_images (
                  product_id, secure_url, public_id, width, height, format, alt_text, sort_order, is_primary
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              `, [
                postgresProductId,
                item.uploaded.secure_url,
                item.uploaded.public_id,
                item.uploaded.width,
                item.uploaded.height,
                item.uploaded.format,
                item.source.alt_text || product.name,
                item.source.sort_order ?? index,
                index === 0
              ]);
              summary.images.migrated += 1;
            }
          }

          await client.query('DELETE FROM product_variants WHERE product_id = $1', [postgresProductId]);
          for (const variant of productVariants) {
            await client.query(`
              INSERT INTO product_variants (product_id, name, value, price_adjustment, stock_status)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              postgresProductId,
              variant.name,
              variant.value,
              variant.price_adjustment || 0,
              variant.stock_status || 'Consultar disponibilidad'
            ]);
          }

          await client.query('DELETE FROM product_tag_relations WHERE product_id = $1', [postgresProductId]);
          for (const tagId of productTagIds) {
            await client.query(`
              INSERT INTO product_tag_relations (product_id, tag_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
            `, [postgresProductId, tagId]);
          }
        });

        summary.products.migrated += 1;
      } catch (error) {
        await deleteImages(uploaded);
        summary.products.failed += 1;
        console.error(`Product migration failed for ${product.slug || product.id}: ${error.message}`);
      }
    }

    if (settings) {
      await query(`
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
      `, [
        settings.store_name,
        settings.whatsapp_number,
        settings.instagram_url,
        settings.default_whatsapp_message,
        settings.currency || 'S/'
      ]);
    }
  } finally {
    source.close();
  }

  console.log('Migration summary:', JSON.stringify(summary, null, 2));
};

run()
  .catch((error) => {
    console.error('Data migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
