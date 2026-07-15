ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS color_hex TEXT,
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS product_variant_images (
  id BIGSERIAL PRIMARY KEY,
  variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  secure_url TEXT NOT NULL,
  public_id TEXT,
  width INTEGER,
  height INTEGER,
  format TEXT,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_sort ON product_variants (product_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_product_variants_active ON product_variants (is_active);
CREATE INDEX IF NOT EXISTS idx_product_variant_images_variant ON product_variant_images (variant_id, sort_order, id);
