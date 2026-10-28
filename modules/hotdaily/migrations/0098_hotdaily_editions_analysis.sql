-- The issue's closing analysis: a summary of the day, its market impact and the listed companies it may move.
ALTER TABLE hotdaily_editions ADD COLUMN IF NOT EXISTS analysis jsonb;
