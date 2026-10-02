CREATE TABLE customer_invoices (
  tenant_id        uuid        NOT NULL,
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number           varchar(32) NOT NULL,
  customer_id      uuid        NOT NULL,
  sales_order_id   uuid,
  invoice_date     date        NOT NULL DEFAULT now(),
  due_date         date,
  status           varchar(16) NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','partial','paid','cancelled')),
  total_minor      bigint      NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  paid_minor       bigint      NOT NULL DEFAULT 0 CHECK (paid_minor >= 0),
  note             text        NOT NULL DEFAULT '',
  created_by       uuid        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id)    REFERENCES customers (tenant_id, id),
  FOREIGN KEY (tenant_id, sales_order_id) REFERENCES sales_orders (tenant_id, id)
);

CREATE TRIGGER customer_invoices_updated_at BEFORE UPDATE ON customer_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE customer_invoice_lines (
  tenant_id             uuid   NOT NULL,
  id                    uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            uuid   NOT NULL,
  sales_order_line_id   uuid,
  product_id            uuid   NOT NULL,
  qty_invoiced          bigint NOT NULL CHECK (qty_invoiced > 0),
  unit_price_minor      bigint NOT NULL CHECK (unit_price_minor >= 0),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, invoice_id)          REFERENCES customer_invoices (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, sales_order_line_id) REFERENCES sales_order_lines (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)          REFERENCES products (tenant_id, id)
);

CREATE TABLE customer_receipts (
  tenant_id            uuid        NOT NULL,
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number               varchar(32) NOT NULL,
  customer_invoice_id  uuid        NOT NULL,
  cash_account_id      uuid        NOT NULL,
  amount_minor         bigint      NOT NULL CHECK (amount_minor > 0),
  receipt_date         date        NOT NULL DEFAULT now(),
  payment_method       varchar(32) NOT NULL DEFAULT 'transfer',
  reference            varchar(64) NOT NULL DEFAULT '',
  note                 text        NOT NULL DEFAULT '',
  status               varchar(12) NOT NULL DEFAULT 'completed'
                     CHECK (status IN ('completed','cancelled')),
  recorded_by          uuid        NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_invoice_id) REFERENCES customer_invoices (tenant_id, id),
  FOREIGN KEY (tenant_id, cash_account_id)     REFERENCES cash_accounts (tenant_id, id)
);

CREATE INDEX customer_invoice_lines_by_invoice ON customer_invoice_lines (tenant_id, invoice_id);
CREATE INDEX customer_receipts_by_invoice ON customer_receipts (tenant_id, customer_invoice_id);
