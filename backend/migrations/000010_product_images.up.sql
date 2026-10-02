CREATE TABLE IF NOT EXISTS product_images (
  tenant_id  uuid        NOT NULL,
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid        NOT NULL,
  position   int         NOT NULL DEFAULT 0,
  is_primary boolean     NOT NULL DEFAULT false,
  mime       varchar(32) NOT NULL,
  data       bytea       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS one_primary_image_per_product
  ON product_images (tenant_id, product_id) WHERE is_primary;

CREATE INDEX IF NOT EXISTS product_images_order
  ON product_images (tenant_id, product_id, position);
