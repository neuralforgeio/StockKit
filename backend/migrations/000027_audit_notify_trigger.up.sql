-- Notify channel 'audit_events' whenever a new audit log is inserted.
-- Payload is JSON with the essential fields so the backend LISTEN goroutine
-- can broadcast to the right tenant's WebSocket clients.
CREATE OR REPLACE FUNCTION notify_audit_event() RETURNS TRIGGER AS $$
DECLARE
  payload json;
BEGIN
  payload := json_build_object(
    'id', NEW.id,
    'tenant_id', NEW.tenant_id,
    'actor_user_id', NEW.actor_user_id,
    'event_type', NEW.event_type,
    'entity_type', NEW.entity_type,
    'entity_id', NEW.entity_id,
    'created_at', NEW.created_at
  );
  PERFORM pg_notify('audit_events', payload::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_notify ON audit_logs;
CREATE TRIGGER audit_logs_notify
AFTER INSERT ON audit_logs
FOR EACH ROW EXECUTE FUNCTION notify_audit_event();
