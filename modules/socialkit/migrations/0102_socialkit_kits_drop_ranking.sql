-- Kits are written from the day's hot daily now, not from a hot ranking of their own.
ALTER TABLE socialkit_kits DROP COLUMN IF EXISTS ranking_id;
