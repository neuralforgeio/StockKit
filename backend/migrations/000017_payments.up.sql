ALTER TABLE supplier_invoices ADD COLUMN paid_minor bigint NOT NULL DEFAULT 0;

CREATE TABLE payments (
  tenant_id              uuid        NOT NULL,
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number                 varchar(32) NOT NULL,
  supplier_invoice_id    uuid        NOT NULL,
  cash_account_id        uuid        NOT NULL,
  amount_minor           bigint      NOT NULL CHECK (amount_minor > 0),
  payment_date           date        NOT NULL DEFAULT now(),
  payment_method         varchar(32) NOT NULL DEFAULT 'transfer',
  reference              varchar(64) NOT NULL DEFAULT '',
  note                   text        NOT NULL DEFAULT '',
  status                 varchar(12) NOT NULL DEFAULT 'completed'
                         CHECK (status IN ('completed','cancelled')),
  recorded_by            uuid        NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number),
  FOREIGN KEY (tenant_id, supplier_invoice_id) REFERENCES supplier_invoices (tenant_id, id),
  FOREIGN KEY (tenant_id, cash_account_id)     REFERENCES cash_accounts (tenant_id, id)
);

CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX payments_by_invoice ON payments (tenant_id, supplier_invoice_id);
CREATE INDEX payments_by_account ON payments (tenant_id, cash_account_id);
