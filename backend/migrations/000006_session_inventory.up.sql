ALTER TABLE signing_keys ADD COLUMN IF NOT EXISTS private_key text;

ALTER TABLE refresh_families ADD COLUMN IF NOT EXISTS remember boolean NOT NULL DEFAULT true;

CREATE SEQUENCE IF NOT EXISTS movement_seq;

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

CREATE TABLE IF NOT EXISTS stock_levels (
  tenant_id      uuid   NOT NULL,
  product_id     uuid   NOT NULL,
  warehouse_id   uuid   NOT NULL,
  on_hand        bigint NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
  reserved       bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  avg_cost_minor bigint NOT NULL DEFAULT 0 CHECK (avg_cost_minor >= 0),
  CHECK (on_hand - reserved >= 0),
  PRIMARY KEY (tenant_id, product_id, warehouse_id),
  FOREIGN KEY (tenant_id, product_id)   REFERENCES products (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  tenant_id       uuid        NOT NULL,
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_seq    bigint      NOT NULL,
  document_type   varchar(8)  NOT NULL CHECK (document_type IN ('GR','GI','DO','TRF','ADJ','REV')),
  document_id     uuid        NOT NULL,
  movement_type   varchar(12) NOT NULL
                  CHECK (movement_type IN ('IN','OUT','TRANSFER_IN','TRANSFER_OUT','ADJ_IN','ADJ_OUT')),
  product_id      uuid        NOT NULL,
  warehouse_id    uuid        NOT NULL,
  qty             bigint      NOT NULL CHECK (qty > 0),
  unit_cost_minor bigint      NOT NULL CHECK (unit_cost_minor >= 0),
  cogs_minor      bigint      CHECK (cogs_minor IS NULL OR cogs_minor >= 0),
  balance_after   bigint      NOT NULL CHECK (balance_after >= 0),
  fifo_layers     jsonb,
  transfer_id     uuid,
  reversal_of     uuid,
  actor_user_id   uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, movement_seq),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)   REFERENCES products (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id),
  FOREIGN KEY (tenant_id, reversal_of)  REFERENCES inventory_movements (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS movements_stock_card ON inventory_movements
  (tenant_id, product_id, warehouse_id, movement_seq);

DO $$
BEGIN
  REVOKE UPDATE, DELETE ON inventory_movements FROM stockkit_app;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  tenant_id           uuid   NOT NULL,
  id                  uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          uuid   NOT NULL,
  warehouse_id        uuid   NOT NULL,
  qty_in              bigint NOT NULL CHECK (qty_in > 0),
  qty_remaining       bigint NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty_in),
  unit_cost_minor     bigint NOT NULL CHECK (unit_cost_minor >= 0),
  source_movement_seq bigint NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS layers_fifo ON inventory_cost_layers
  (tenant_id, product_id, warehouse_id, source_movement_seq) WHERE qty_remaining > 0;
