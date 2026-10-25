-- 热度日报 (modules/hotdaily): one issue a day, the top of the hot ranking when it was composed.
CREATE TABLE IF NOT EXISTS hotdaily_editions (
  date         date PRIMARY KEY,
  title        text NOT NULL,
  lead         text,
  entries      jsonb NOT NULL,
  ranking_id   bigint,
  composed_at  timestamptz NOT NULL DEFAULT now()
);
