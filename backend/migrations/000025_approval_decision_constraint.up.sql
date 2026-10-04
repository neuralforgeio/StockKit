-- Align approval_steps.decision CHECK constraint with domain values used by
-- the approval engine: NULL = pending, 'approved', 'rejected'.
--
-- Step 1: Sanitize legacy data — any value outside {NULL,'approved','rejected'}
-- is treated as pending (set to NULL). This catches '', 'pending', or any
-- legacy literal that would violate the new constraint.
UPDATE approval_steps
    SET decision = NULL
WHERE decision IS NOT NULL
  AND decision NOT IN ('approved', 'rejected');

-- Step 2: Drop legacy constraint (idempotent).
ALTER TABLE approval_steps
    DROP CONSTRAINT IF EXISTS approval_steps_decision_check;

-- Step 3: Add aligned constraint.
ALTER TABLE approval_steps
    ADD CONSTRAINT approval_steps_decision_check
    CHECK (decision IS NULL OR decision IN ('approved', 'rejected'));
