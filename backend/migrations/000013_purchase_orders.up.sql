CREATE TABLE purchase_orders (
  tenant_id           uuid        NOT NULL,
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number              varchar(32) NOT NULL,
  purchase_request_id uuid,
  supplier_id         uuid        NOT NULL,
  warehouse_id        uuid        NOT NULL,
  terms               text        NOT NULL DEFAULT '',
  expected_date       date,
  status              varchar(20) NOT NULL DEFAULT 'issued'
                      CHECK (status IN ('draft','issued','partially_received','received','closed','closed_short','cancelled')),
  issued_at           timestamptz,
  closed_at           timestamptz,
  created_by          uuid        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_request_id) REFERENCES purchase_requests (tenant_id, id),
  FOREIGN KEY (tenant_id, supplier_id)         REFERENCES suppliers (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id)        REFERENCES warehouses (tenant_id, id)
);

CREATE TRIGGER purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE purchase_order_lines (
  tenant_id                uuid   NOT NULL,
  id                       uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id        uuid   NOT NULL,
  purchase_request_line_id uuid,
  product_id               uuid   NOT NULL,
  qty_ordered              bigint NOT NULL CHECK (qty_ordered > 0),
  allowed_qty              bigint NOT NULL CHECK (allowed_qty >= qty_ordered),
  received_qty             bigint NOT NULL DEFAULT 0
                           CHECK (received_qty >= 0 AND received_qty <= allowed_qty),
  unit_price_minor         bigint NOT NULL CHECK (unit_price_minor >= 0),
  tax_code_id              uuid,
  tax_rate_bp              int    NOT NULL DEFAULT 0,
  price_mode               varchar(10) NOT NULL DEFAULT 'exclusive',
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_order_id)        REFERENCES purchase_orders (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_request_line_id) REFERENCES purchase_request_lines (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)               REFERENCES products (tenant_id, id)
);

CREATE INDEX po_lines_by_po ON purchase_order_lines (tenant_id, purchase_order_id);
