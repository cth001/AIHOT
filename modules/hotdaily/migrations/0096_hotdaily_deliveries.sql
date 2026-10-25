-- One row per issue and subscriber: an issue is sent to each subscriber once, failures retried a few times.
CREATE TABLE IF NOT EXISTS hotdaily_deliveries (
  edition_date   date NOT NULL,
  subscriber_id  bigint NOT NULL REFERENCES hotdaily_subscribers (id) ON DELETE CASCADE,
  status         text NOT NULL CHECK (status IN ('sent', 'failed')),
  attempts       integer NOT NULL DEFAULT 1,
  error          text,
  at             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (edition_date, subscriber_id)
);
