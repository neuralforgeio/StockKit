ALTER TABLE users DROP COLUMN IF EXISTS avatar_data;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_mime;
ALTER TABLE stock_levels DROP COLUMN IF EXISTS updated_at;
DROP TABLE IF EXISTS stock_adjustments;
