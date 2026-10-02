#!/bin/sh
set -e

# Application role is non-superuser by design (FR-TEN-09).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE stockkit_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stockkit_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO stockkit_app;
SQL
