ALTER TABLE product_variant_images
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

WITH ranked_images AS (
  SELECT
    id,
    variant_id,
    ROW_NUMBER() OVER (PARTITION BY variant_id ORDER BY sort_order ASC, id ASC) AS row_number
  FROM product_variant_images
),
variants_without_primary AS (
  SELECT variant_id
  FROM product_variant_images
  GROUP BY variant_id
  HAVING BOOL_OR(is_primary) IS NOT TRUE
)
UPDATE product_variant_images pvi
SET is_primary = TRUE
FROM ranked_images ri
JOIN variants_without_primary vwp ON vwp.variant_id = ri.variant_id
WHERE pvi.id = ri.id
  AND ri.row_number = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variant_images_primary
  ON product_variant_images (variant_id)
  WHERE is_primary = TRUE;
