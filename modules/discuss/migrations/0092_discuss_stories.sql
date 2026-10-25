-- When a story's discussions were last looked for, and the model's summary of what people say about it.
CREATE TABLE IF NOT EXISTS discuss_stories (
  story_id        bigint PRIMARY KEY,
  checked_at      timestamptz NOT NULL,
  summary         text,
  -- Which comments the summary and translations were written from.
  summary_inputs  text,
  summarized_at   timestamptz
);
