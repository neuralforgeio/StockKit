CREATE TABLE IF NOT EXISTS stock_adjustments (
  tenant_id  uuid        NOT NULL,
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number     varchar(32) NOT NULL,
  reason     text        NOT NULL,
  created_by uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)
);

ALTER TABLE stock_levels
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_mime varchar(32),
  ADD COLUMN IF NOT EXISTS avatar_data bytea;
