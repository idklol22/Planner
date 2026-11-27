-- Protein grams logged with a meal. Nullable: old rows stay NULL and a hub that
-- has not been upgraded simply omits the field on push/pull.

ALTER TABLE meal ADD COLUMN IF NOT EXISTS protein double precision;
