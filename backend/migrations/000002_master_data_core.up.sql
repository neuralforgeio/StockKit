CREATE TABLE categories (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name      varchar(100) NOT NULL,
  parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  FOREIGN KEY (tenant_id, parent_id) REFERENCES categories (tenant_id, id)
);

CREATE TABLE units (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code      varchar(20) NOT NULL,
  name      varchar(50) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id)
);

CREATE TABLE warehouses (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  code      varchar(20) NOT NULL,
  name      varchar(100) NOT NULL,
  branch    varchar(100),
  active    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id)
);

CREATE TABLE products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  sku                   varchar(50) NOT NULL,
  barcode               varchar(50),
  name                  varchar(200) NOT NULL,
  type                  varchar(10) NOT NULL DEFAULT 'product' CHECK (type IN ('product', 'service')),
  category_id           uuid,
  unit_id               uuid NOT NULL,
  cost_method           varchar(10) NOT NULL DEFAULT 'average' CHECK (cost_method IN ('average', 'fifo')),
  default_sell_price_minor bigint NOT NULL DEFAULT 0 CHECK (default_sell_price_minor >= 0),
  default_buy_price_minor  bigint NOT NULL DEFAULT 0 CHECK (default_buy_price_minor >= 0),
  min_stock             bigint NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  active                boolean NOT NULL DEFAULT true,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES categories (tenant_id, id),
  FOREIGN KEY (tenant_id, unit_id) REFERENCES units (tenant_id, id)
);

CREATE UNIQUE INDEX products_sku_active ON products (tenant_id, sku) WHERE deleted_at IS NULL;

CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
