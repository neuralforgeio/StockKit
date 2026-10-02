-- Seed approval rule untuk Sales Order agar user bisa langsung test workflow.
-- Rule ini bisa di-edit/dihapus di /settings/approvals.

INSERT INTO approval_rules (tenant_id, document_type, name, threshold_minor, approver_role, level, active)
SELECT tenant_id, 'SO', 'Sales order above 10 million', 10000000, 'owner', 1, true
FROM (SELECT DISTINCT tenant_id FROM users) t
WHERE NOT EXISTS (
  SELECT 1 FROM approval_rules ar
  WHERE ar.tenant_id = t.tenant_id AND ar.document_type = 'SO'
);
