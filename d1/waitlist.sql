CREATE TABLE IF NOT EXISTS waitlist_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  email_normalized TEXT,
  created_at TEXT NOT NULL,
  referrer TEXT,
  landing_path TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  country TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  status TEXT,
  block_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_waitlist_created_at
  ON waitlist_signups (created_at);

CREATE INDEX IF NOT EXISTS idx_waitlist_email_normalized
  ON waitlist_signups (email_normalized);

CREATE INDEX IF NOT EXISTS idx_waitlist_ip_hash
  ON waitlist_signups (ip_hash);

CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_email_normalized
  ON waitlist_signups (email_normalized);
