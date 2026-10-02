CREATE TABLE fx_rates (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL,
  base_currency  varchar(3)  NOT NULL,
  quote_currency varchar(3)  NOT NULL,
  rate           numeric(18,8) NOT NULL CHECK (rate > 0),
  effective_date date        NOT NULL DEFAULT CURRENT_DATE,
  source         varchar(16) NOT NULL DEFAULT 'manual',
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (tenant_id, base_currency, quote_currency, effective_date)
);
CREATE INDEX idx_fx_rates_latest ON fx_rates (tenant_id, base_currency, quote_currency, effective_date DESC);
