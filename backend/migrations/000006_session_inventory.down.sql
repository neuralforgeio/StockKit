DROP TABLE IF EXISTS inventory_cost_layers;
DROP TABLE IF EXISTS inventory_movements;
DROP TABLE IF EXISTS stock_levels;
DROP TABLE IF EXISTS stock_adjustments;
DROP SEQUENCE IF EXISTS movement_seq;
ALTER TABLE refresh_families DROP COLUMN IF EXISTS remember;
ALTER TABLE signing_keys DROP COLUMN IF EXISTS private_key;
