-- AI illustrations of a kit: file names under the data folder by slot (cover, 1 … 5).
ALTER TABLE socialkit_kits ADD COLUMN IF NOT EXISTS art jsonb;
