CREATE TABLE customers (
  tenant_id           uuid NOT NULL,
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                varchar(20) NOT NULL,
  name                varchar(200) NOT NULL,
  type                varchar(12) NOT NULL DEFAULT 'company'
                      CHECK (type IN ('company', 'individual')),
  contact_name        varchar(200) NOT NULL DEFAULT '',
  email               citext,
  phone               varchar(32) NOT NULL DEFAULT '',
  address             text NOT NULL DEFAULT '',
  tax_id              varchar(64) NOT NULL DEFAULT '',
  payment_terms_days  int NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  credit_limit_minor  bigint NOT NULL DEFAULT 0 CHECK (credit_limit_minor >= 0),
  salesperson_id      uuid,
  open_exposure_minor bigint NOT NULL DEFAULT 0 CHECK (open_exposure_minor >= 0),
  active              boolean NOT NULL DEFAULT true,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id),
  FOREIGN KEY (tenant_id, salesperson_id) REFERENCES users (tenant_id, id)
);

CREATE UNIQUE INDEX customers_code_active ON customers (tenant_id, code)
WHERE deleted_at IS NULL;

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE suppliers (
  tenant_id          uuid NOT NULL,
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               varchar(20) NOT NULL,
  name               varchar(200) NOT NULL,
  contact_name       varchar(200) NOT NULL DEFAULT '',
  email              citext,
  phone              varchar(32) NOT NULL DEFAULT '',
  address            text NOT NULL DEFAULT '',
  tax_id             varchar(64) NOT NULL DEFAULT '',
  payment_terms_days int NOT NULL DEFAULT 0 CHECK (payment_terms_days >= 0),
  bank_account       text,
  active             boolean NOT NULL DEFAULT true,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id)
);

CREATE UNIQUE INDEX suppliers_code_active ON suppliers (tenant_id, code)
WHERE deleted_at IS NULL;

CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
