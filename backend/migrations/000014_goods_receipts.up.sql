CREATE TABLE goods_receipts (
  tenant_id          uuid        NOT NULL,
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number             varchar(32) NOT NULL,
  purchase_order_id  uuid        NOT NULL,
  warehouse_id       uuid        NOT NULL,
  note               text        NOT NULL DEFAULT '',
  received_by        uuid        NOT NULL,
  received_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES purchase_orders (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id)      REFERENCES warehouses (tenant_id, id)
);

CREATE TABLE goods_receipt_lines (
  tenant_id                uuid   NOT NULL,
  id                       uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id         uuid   NOT NULL,
  purchase_order_line_id   uuid   NOT NULL,
  product_id               uuid   NOT NULL,
  qty_received             bigint NOT NULL CHECK (qty_received > 0),
  unit_cost_minor          bigint NOT NULL CHECK (unit_cost_minor >= 0),
  discrepancy_note         text,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, goods_receipt_id)       REFERENCES goods_receipts (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_order_line_id) REFERENCES purchase_order_lines (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)             REFERENCES products (tenant_id, id)
);

CREATE INDEX gr_lines_by_gr ON goods_receipt_lines (tenant_id, goods_receipt_id);
CREATE INDEX gr_by_po       ON goods_receipts (tenant_id, purchase_order_id);
