-- The top comments of a discussion, in the platform's own order; body_zh is the model's Chinese translation.
CREATE TABLE IF NOT EXISTS discuss_comments (
  thread_id     bigint NOT NULL REFERENCES discuss_threads (id) ON DELETE CASCADE,
  external_id   text NOT NULL,
  rank          smallint NOT NULL,
  author        text,
  body          text NOT NULL,
  body_zh       text,
  score         integer,
  replies       integer NOT NULL DEFAULT 0,
  posted_at     timestamptz,
  PRIMARY KEY (thread_id, external_id)
);
