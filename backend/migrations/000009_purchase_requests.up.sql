CREATE TABLE purchase_requests (
  tenant_id     uuid        NOT NULL,
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number        varchar(32) NOT NULL,
  requester_id  uuid        NOT NULL,
  cost_center   varchar(100),
  reason        text        NOT NULL,
  status        varchar(20) NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','submitted','pending_approval','approved','rejected','converted','completed','cancelled')),
  submitted_at  timestamptz,
  approved_at   timestamptz,
  rejected_at   timestamptz,
  converted_at  timestamptz,
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, requester_id) REFERENCES users (tenant_id, id)
);

CREATE TABLE purchase_request_lines (
  tenant_id              uuid   NOT NULL,
  id                     uuid   PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_request_id    uuid   NOT NULL,
  product_id             uuid   NOT NULL,
  quantity               bigint NOT NULL CHECK (quantity > 0),
  estimated_price_minor  bigint NOT NULL CHECK (estimated_price_minor >= 0),
  note                   text,
  converted_qty          bigint NOT NULL DEFAULT 0 CHECK (converted_qty >= 0 AND converted_qty <= quantity),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, purchase_request_id) REFERENCES purchase_requests (tenant_id, id),
  FOREIGN KEY (tenant_id, product_id)          REFERENCES products (tenant_id, id)
);

CREATE INDEX pr_lines_by_pr ON purchase_request_lines (tenant_id, purchase_request_id);

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_requests_tenant_isolation ON purchase_requests
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE purchase_request_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_request_lines_tenant_isolation ON purchase_request_lines
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE TRIGGER purchase_requests_updated_at BEFORE UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
