DROP TRIGGER IF EXISTS categories_updated_at ON categories;

ALTER TABLE categories
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS active;
