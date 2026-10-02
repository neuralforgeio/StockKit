-- Multi-currency: tambahkan field currency di dokumen transaksi
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'IDR';
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1.0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS base_amount_minor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'IDR';
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1.0;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS base_amount_minor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'IDR';
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1.0;
ALTER TABLE customer_invoices ADD COLUMN IF NOT EXISTS base_amount_minor BIGINT NOT NULL DEFAULT 0;

ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'IDR';
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1.0;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS base_amount_minor BIGINT NOT NULL DEFAULT 0;

-- Backfill existing records dengan base_amount = total (IDR, rate 1.0)
-- NOTE: sales_order_lines pakai unit_price_minor; purchase_request_lines pakai estimated_price_minor
UPDATE sales_orders SET base_amount_minor = COALESCE((
    SELECT COALESCE(SUM(quantity * unit_price_minor), 0)
    FROM sales_order_lines WHERE sales_order_id = sales_orders.id
), 0) WHERE base_amount_minor = 0;

UPDATE purchase_requests SET base_amount_minor = COALESCE((
    SELECT COALESCE(SUM(quantity * estimated_price_minor), 0)
    FROM purchase_request_lines WHERE purchase_request_id = purchase_requests.id
), 0) WHERE base_amount_minor = 0;

UPDATE customer_invoices SET base_amount_minor = total_minor WHERE base_amount_minor = 0;
UPDATE supplier_invoices SET base_amount_minor = total_minor WHERE base_amount_minor = 0;

-- Audit log: immutable event trail
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    actor_user_id UUID,
    event_type VARCHAR(64) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,
    entity_id UUID NOT NULL,
    old_data JSONB,
    new_data JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_entity ON audit_logs (tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (tenant_id, actor_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION fn_audit_log() RETURNS TRIGGER AS $$
DECLARE
    tenant UUID;
    actor UUID;
    old_json JSONB;
    new_json JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        tenant := NEW.tenant_id;
        actor := NULLIF(current_setting('app.current_user_id', true), '');
        new_json := to_jsonb(NEW);
        old_json := NULL;
    ELSIF TG_OP = 'UPDATE' THEN
        tenant := NEW.tenant_id;
        actor := NULLIF(current_setting('app.current_user_id', true), '');
        new_json := to_jsonb(NEW);
        old_json := to_jsonb(OLD);
    ELSE
        tenant := OLD.tenant_id;
        actor := NULLIF(current_setting('app.current_user_id', true), '');
        new_json := NULL;
        old_json := to_jsonb(OLD);
    END IF;

    INSERT INTO audit_logs (tenant_id, actor_user_id, event_type, entity_type, entity_id, old_data, new_data)
    VALUES (tenant, actor, TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), old_json, new_json);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Idempotent: drop dulu agar aman di-run ulang
DROP TRIGGER IF EXISTS trg_audit_sales_orders ON sales_orders;
CREATE TRIGGER trg_audit_sales_orders
    AFTER INSERT OR UPDATE ON sales_orders
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_purchase_requests ON purchase_requests;
CREATE TRIGGER trg_audit_purchase_requests
    AFTER INSERT OR UPDATE ON purchase_requests
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_approval_instances ON approval_instances;
CREATE TRIGGER trg_audit_approval_instances
    AFTER INSERT OR UPDATE ON approval_instances
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
