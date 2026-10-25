-- 社媒素材包 (modules/socialkit): each day's five most-followed events, the words for the image cards and
-- the posts written for each platform. The images are drawn from these on request.
CREATE TABLE IF NOT EXISTS socialkit_kits (
  date         date PRIMARY KEY,
  ranking_id   bigint,
  items        jsonb NOT NULL,
  cards        jsonb,
  copy         jsonb,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
