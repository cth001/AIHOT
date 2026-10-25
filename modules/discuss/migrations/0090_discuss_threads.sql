-- Discussions of a report found on Hacker News or Reddit by the report's address (modules/discuss).
CREATE TABLE IF NOT EXISTS discuss_threads (
  id                bigserial PRIMARY KEY,
  platform          text NOT NULL CHECK (platform IN ('hn', 'reddit')),
  external_id       text NOT NULL,
  story_id          bigint NOT NULL,
  -- The report address it was found by: shown only while that report is still listed evidence of the story.
  article_url       text NOT NULL,
  url               text NOT NULL,
  title             text NOT NULL,
  community         text,
  points            integer NOT NULL DEFAULT 0,
  comment_count     integer NOT NULL DEFAULT 0,
  posted_at         timestamptz,
  fetched_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
