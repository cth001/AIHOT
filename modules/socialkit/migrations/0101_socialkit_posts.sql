-- What was published where: one row per kit and platform, written by the publishers (backend/publish/).
CREATE TABLE IF NOT EXISTS socialkit_posts (
  date          date NOT NULL,
  platform      text NOT NULL CHECK (platform IN ('xiaohongshu', 'wechat', 'weibo', 'x')),
  status        text NOT NULL CHECK (status IN ('publishing', 'published', 'drafted', 'failed', 'manual')),
  url           text,
  remote_id     text,
  error         text,
  actor         text,
  attempts      integer NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, platform)
);
