-- Downgrade: remove the aligned constraint (legacy literal set is unknown,
-- so we do not attempt to restore it).
ALTER TABLE approval_steps
    DROP CONSTRAINT IF EXISTS approval_steps_decision_check;
