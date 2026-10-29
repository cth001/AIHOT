-- The hot daily's closing analysis the kit was written from (its summary, market impact and companies).
ALTER TABLE socialkit_kits ADD COLUMN IF NOT EXISTS analysis jsonb;
