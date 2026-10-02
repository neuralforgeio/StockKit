CREATE TABLE supplier_invoices (
  tenant_id         uuid        NOT NULL,
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number            varchar(64) NOT NULL,
  supplier_id       uuid        NOT NULL,
  purchase_order_id uuid,
  goods_receipt_id  uuid,
  invoice_date      date        NOT NULL DEFAULT now(),
  due_date          date,
  status            varchar(16) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','matched','disputed','paid','cancelled')),
  total_minor       bigint      NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  note              text        NOT NULL DEFAULT '',
  created_by        uuid        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, supplier_id, number),
  FOREIGN KEY (tenant_id, supplier_id)       REFERENCES suppliers (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES purchase_orders (tenant_id, id),
  FOREIGN KEY (tenant_id, goods_receipt_id)  REFERENCES goods_receipts (tenant_id, id)
);

CREATE TRIGGER supplier_invoices_updated_at BEFORE UPDATE ON supplier_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE supplier_invoice_lines (
  tenant_id                uuid        NOT NULL,
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id               uuid        NOT NULL,
  purchase_order_line_id   uuid,
  product_id               uuid        NOT NULL,
  qty_invoiced             bigint      NOT NULL CHECK (qty_invoiced > 0),
  unit_price_minor         bigint      NOT NULL CHECK (unit_price_minor >= 0),
  match_status             varchar(12) NOT NULL DEFAULT 'matched'
                           CHECK (match_status IN ('matched','disputed')),
  match_note               text,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, invoice_id)             REFERENCES supplier_invoices (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, purchase_order_line_id) REFERENCES purchase_order_lines (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)             REFERENCES products (tenant_id, id)
);

CREATE INDEX supplier_invoice_lines_by_invoice ON supplier_invoice_lines (tenant_id, invoice_id);
CREATE INDEX supplier_invoices_by_status ON supplier_invoices (tenant_id, status);
