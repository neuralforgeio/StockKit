-- Platform core schema: tenants, identity, RBAC, sessions, audit, idempotency, outbox.
-- Conventions per PRD v3.1 section 3.3: uuid PK plus UNIQUE (tenant_id, id) for
-- composite FK eligibility (FR-TEN-07a), timestamptz everywhere, non-superuser
-- application role stockkit_app created by infra/postgres/initdb.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TABLE tenants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name     varchar(200) NOT NULL,
  address        text NOT NULL DEFAULT '',
  tax_id         varchar(64) NOT NULL DEFAULT '',
  base_currency  char(3) NOT NULL DEFAULT 'IDR',
  default_locale varchar(5) NOT NULL DEFAULT 'en' CHECK (default_locale IN ('en', 'id')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON tenants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  email           citext NOT NULL,
  password_hash   text NOT NULL,
  full_name       varchar(200) NOT NULL,
  status          varchar(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated')),
  failed_attempts int NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until    timestamptz,
  perm_version    int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (email),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id)
);

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        varchar(64) NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, name),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id)
);

CREATE TABLE permissions (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code   varchar(64) NOT NULL UNIQUE,
  module varchar(32) NOT NULL,
  action varchar(32) NOT NULL
);

CREATE TABLE role_permissions (
  tenant_id     uuid NOT NULL,
  role_id       uuid NOT NULL,
  permission_id uuid NOT NULL,
  PRIMARY KEY (tenant_id, role_id, permission_id),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id),
  FOREIGN KEY (permission_id) REFERENCES permissions (id)
);

CREATE TABLE user_roles (
  tenant_id  uuid NOT NULL,
  user_id    uuid NOT NULL,
  role_id    uuid NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, role_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id),
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id),
  FOREIGN KEY (tenant_id, granted_by) REFERENCES users (tenant_id, id)
);

CREATE TABLE refresh_families (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  user_id     uuid NOT NULL,
  fingerprint varchar(128) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
);

CREATE TABLE refresh_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL,
  token_hash    char(64) NOT NULL UNIQUE,
  parent_id     uuid,
  rotation_kind varchar(12) NOT NULL DEFAULT 'root'
                CHECK (rotation_kind IN ('root', 'rotation', 'grace_sibling')),
  status        varchar(10) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'rotated', 'revoked')),
  rotated_at    timestamptz,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (family_id) REFERENCES refresh_families (id),
  FOREIGN KEY (parent_id) REFERENCES refresh_tokens (id)
);

CREATE INDEX refresh_by_family ON refresh_tokens (family_id, status);

CREATE TABLE signing_keys (
  kid          varchar(32) PRIMARY KEY,
  algorithm    varchar(8) NOT NULL CHECK (algorithm IN ('RS256', 'EdDSA')),
  public_key   text NOT NULL,
  active_from  timestamptz NOT NULL,
  retire_after timestamptz NOT NULL,
  retired_at   timestamptz
);

CREATE TABLE audit_log (
  tenant_id     uuid NOT NULL,
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid,
  action        varchar(64) NOT NULL,
  entity_type   varchar(32) NOT NULL,
  entity_id     uuid,
  before        jsonb,
  after         jsonb,
  request_id    varchar(64),
  ip_hash       char(64),
  ua_hash       char(64),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_guard BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

DO $$
BEGIN
  REVOKE UPDATE, DELETE ON audit_log FROM stockkit_app;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

CREATE TABLE idempotency_keys (
  tenant_id     uuid NOT NULL,
  endpoint      varchar(64) NOT NULL,
  key           varchar(64) NOT NULL,
  user_id       uuid NOT NULL,
  request_hash  char(64) NOT NULL,
  status_code   int,
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, endpoint, key)
);

CREATE TABLE outbox_events (
  tenant_id       uuid NOT NULL,
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type  varchar(32) NOT NULL,
  aggregate_id    uuid NOT NULL,
  event_type      varchar(48) NOT NULL,
  payload         jsonb NOT NULL,
  status          varchar(12) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'dispatched', 'dead')),
  attempt_count   int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  dispatched_at   timestamptz
);

CREATE INDEX outbox_relay ON outbox_events (status, next_attempt_at, id);
