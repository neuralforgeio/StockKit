DROP TRIGGER IF EXISTS trg_audit_approval_instances ON approval_instances;
DROP TRIGGER IF EXISTS trg_audit_purchase_requests ON purchase_requests;
DROP TRIGGER IF EXISTS trg_audit_sales_orders ON sales_orders;

DROP FUNCTION IF EXISTS fn_audit_log();
DROP TABLE IF EXISTS audit_logs;

ALTER TABLE sales_orders DROP COLUMN IF EXISTS currency;
ALTER TABLE sales_orders DROP COLUMN IF EXISTS exchange_rate;
ALTER TABLE sales_orders DROP COLUMN IF EXISTS base_amount_minor;

ALTER TABLE purchase_requests DROP COLUMN IF EXISTS currency;
ALTER TABLE purchase_requests DROP COLUMN IF EXISTS exchange_rate;
ALTER TABLE purchase_requests DROP COLUMN IF EXISTS base_amount_minor;

ALTER TABLE customer_invoices DROP COLUMN IF EXISTS currency;
ALTER TABLE customer_invoices DROP COLUMN IF EXISTS exchange_rate;
ALTER TABLE customer_invoices DROP COLUMN IF EXISTS base_amount_minor;

ALTER TABLE supplier_invoices DROP COLUMN IF EXISTS currency;
ALTER TABLE supplier_invoices DROP COLUMN IF EXISTS exchange_rate;
ALTER TABLE supplier_invoices DROP COLUMN IF EXISTS base_amount_minor;
