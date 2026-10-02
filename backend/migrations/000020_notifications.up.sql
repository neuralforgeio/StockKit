CREATE TABLE notifications (
  tenant_id   uuid        NOT NULL,
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  kind        varchar(32) NOT NULL,
  title       varchar(160) NOT NULL,
  body        text        NOT NULL DEFAULT '',
  entity_type varchar(32),
  entity_id   uuid,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX notifications_user_unread ON notifications (tenant_id, user_id, created_at DESC)
  WHERE read_at IS NULL;
