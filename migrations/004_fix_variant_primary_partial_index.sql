DROP INDEX IF EXISTS idx_product_variant_images_primary;

CREATE UNIQUE INDEX idx_product_variant_images_primary
  ON product_variant_images (variant_id)
  WHERE is_primary = TRUE;
