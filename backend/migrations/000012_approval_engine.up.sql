CREATE TABLE approval_rules (
  tenant_id       uuid        NOT NULL,
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type   varchar(16) NOT NULL CHECK (document_type IN ('PR','PO','SO','ADJ','REFUND')),
  name            varchar(100) NOT NULL,
  threshold_minor bigint      NOT NULL DEFAULT 0 CHECK (threshold_minor >= 0),
  approver_role   varchar(32) NOT NULL,
  level           int         NOT NULL CHECK (level > 0),
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, document_type, level)
);

CREATE TABLE approval_instances (
  tenant_id      uuid        NOT NULL,
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type  varchar(16) NOT NULL CHECK (document_type IN ('PR','PO','SO','ADJ','REFUND')),
  document_id    uuid        NOT NULL,
  document_label varchar(64) NOT NULL,
  amount_minor   bigint      NOT NULL CHECK (amount_minor >= 0),
  status         varchar(16) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','cancelled')),
  requested_by   uuid        NOT NULL,
  decided_at     timestamptz,
  decided_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id)
);

CREATE INDEX approval_instances_pending
  ON approval_instances (tenant_id, created_at)
  WHERE status = 'pending';

CREATE TABLE approval_steps (
  tenant_id          uuid        NOT NULL,
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id        uuid        NOT NULL,
  level              int         NOT NULL,
  approver_role      varchar(32) NOT NULL,
  decision           varchar(8)  CHECK (decision IN ('approve','reject')),
  decided_by         uuid,
  decided_at         timestamptz,
  reason             text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, instance_id, level),
  FOREIGN KEY (tenant_id, instance_id) REFERENCES approval_instances (tenant_id, id) ON DELETE CASCADE
);

CREATE TRIGGER approval_rules_updated_at BEFORE UPDATE ON approval_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER approval_instances_updated_at BEFORE UPDATE ON approval_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO approval_rules (tenant_id, document_type, name, threshold_minor, approver_role, level, active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'PR', 'PR above 5M', 5000000, 'owner', 1, true)
ON CONFLICT (tenant_id, document_type, level) DO NOTHING;
