-- Broadcast identity changes (full_name/email/status) on users UPDATE.
-- Only fires when identity fields actually change (perm_version/password
-- updates do NOT notify).
CREATE OR REPLACE FUNCTION notify_user_profile_event() RETURNS TRIGGER AS $$
DECLARE
  payload json;
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    payload := json_build_object(
      'user_id', NEW.id,
      'tenant_id', NEW.tenant_id,
      'full_name', NEW.full_name,
      'email', NEW.email,
      'status', NEW.status
    );
    PERFORM pg_notify('user_profile_events', payload::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_profile_notify ON users;
CREATE TRIGGER users_profile_notify
AFTER UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION notify_user_profile_event();
