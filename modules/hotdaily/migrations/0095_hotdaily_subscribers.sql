-- Email subscribers. A subscription counts once its owner confirmed it from the mailbox (double opt-in);
-- the same token confirms and unsubscribes. ip_hash is a keyed hash, kept only to rate-limit sign-ups.
CREATE TABLE IF NOT EXISTS hotdaily_subscribers (
  id               bigserial PRIMARY KEY,
  email            text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  token            text NOT NULL UNIQUE,
  ip_hash          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  confirm_sent_at  timestamptz,
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz
);
