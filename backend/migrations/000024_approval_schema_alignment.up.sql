-- Align approval schema with repository code (idempotent, safe re-run).
DO $$
BEGIN
  -- approval_instances.requester_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_instances' AND column_name='requester_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_instances' AND column_name='requested_by') THEN
      ALTER TABLE approval_instances RENAME COLUMN requested_by TO requester_id;
    ELSE
      ALTER TABLE approval_instances ADD COLUMN requester_id UUID;
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_instances' AND column_name='document_label') THEN
    ALTER TABLE approval_instances ADD COLUMN document_label TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_instances' AND column_name='amount_minor') THEN
    ALTER TABLE approval_instances ADD COLUMN amount_minor BIGINT NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_instances' AND column_name='decided_by') THEN
    ALTER TABLE approval_instances ADD COLUMN decided_by UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_instances' AND column_name='decided_at') THEN
    ALTER TABLE approval_instances ADD COLUMN decided_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_instances' AND column_name='updated_at') THEN
    ALTER TABLE approval_instances ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  -- approval_steps defensive columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_steps' AND column_name='level') THEN
    ALTER TABLE approval_steps ADD COLUMN level INT NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_steps' AND column_name='approver_role') THEN
    ALTER TABLE approval_steps ADD COLUMN approver_role TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_steps' AND column_name='decision') THEN
    ALTER TABLE approval_steps ADD COLUMN decision TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_steps' AND column_name='decided_by') THEN
    ALTER TABLE approval_steps ADD COLUMN decided_by UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_steps' AND column_name='decided_at') THEN
    ALTER TABLE approval_steps ADD COLUMN decided_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approval_steps' AND column_name='reason') THEN
    ALTER TABLE approval_steps ADD COLUMN reason TEXT;
  END IF;
END $$;

-- Index pendukung inbox & lookup per dokumen
CREATE INDEX IF NOT EXISTS idx_approval_instances_pending
  ON approval_instances (tenant_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_approval_instances_document
  ON approval_instances (tenant_id, document_type, document_id);
