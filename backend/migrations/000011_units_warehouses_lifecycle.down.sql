DROP TRIGGER IF EXISTS warehouses_updated_at ON warehouses;
DROP TRIGGER IF EXISTS units_updated_at ON units;
ALTER TABLE warehouses DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE units DROP COLUMN IF EXISTS updated_at, DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS active;
