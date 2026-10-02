CREATE TABLE cash_accounts (
  tenant_id       uuid        NOT NULL,
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number          varchar(32) NOT NULL,
  name            varchar(120) NOT NULL,
  account_type    varchar(16) NOT NULL CHECK (account_type IN ('cash','bank','ewallet')),
  currency        varchar(3)  NOT NULL DEFAULT 'IDR',
  balance_minor   bigint      NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  is_active       boolean     NOT NULL DEFAULT true,
  notes           text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, number)
);

CREATE TRIGGER cash_accounts_updated_at BEFORE UPDATE ON cash_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
