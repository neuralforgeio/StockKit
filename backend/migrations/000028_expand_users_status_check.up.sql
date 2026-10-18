-- Expand users.status constraint to include 'inactive' so the user
-- lifecycle (activate/deactivate) feature works. Existing rows use
-- 'active' (from seed), so no data update is required.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'inactive'));
