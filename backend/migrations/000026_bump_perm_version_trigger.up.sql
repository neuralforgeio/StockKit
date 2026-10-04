-- Auto-bump perm_version when user_roles changes so role edits take effect immediately
-- on next request (frontend auto-refreshes token, picks up new perm_version).
CREATE OR REPLACE FUNCTION bump_user_perm_version() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users SET perm_version = perm_version + 1
        WHERE id = NEW.user_id AND tenant_id = NEW.tenant_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users SET perm_version = perm_version + 1
        WHERE id = OLD.user_id AND tenant_id = OLD.tenant_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_roles_change_bump_version ON user_roles;
CREATE TRIGGER user_roles_change_bump_version
AFTER INSERT OR DELETE ON user_roles
FOR EACH ROW EXECUTE FUNCTION bump_user_perm_version();
