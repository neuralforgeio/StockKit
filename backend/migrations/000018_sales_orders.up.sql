CREATE TABLE sales_orders (
  tenant_id    uuid        NOT NULL,
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number       varchar(32) NOT NULL,
  customer_id  uuid        NOT NULL,
  warehouse_id uuid        NOT NULL,
  status       varchar(20) NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','submitted','reserved','picking','packed','delivered','invoiced','paid','cancelled')),
  price_list   varchar(20) NOT NULL DEFAULT 'retail',
  note         text        NOT NULL DEFAULT '',
  created_by   uuid        NOT NULL,
  submitted_at timestamptz,
  cancelled_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id)  REFERENCES customers (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id)
);

CREATE TRIGGER sales_orders_updated_at BEFORE UPDATE ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sales_order_lines (
  tenant_id        uuid   NOT NULL,
  id               uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id   uuid   NOT NULL,
  product_id       uuid   NOT NULL,
  quantity         bigint NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  reserved_qty     bigint NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  delivered_qty    bigint NOT NULL DEFAULT 0 CHECK (delivered_qty >= 0),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, sales_order_id) REFERENCES sales_orders (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)     REFERENCES products (tenant_id, id)
);

CREATE INDEX so_lines_by_so ON sales_order_lines (tenant_id, sales_order_id);
