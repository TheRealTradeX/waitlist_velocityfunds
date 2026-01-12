CREATE TABLE IF NOT EXISTS waitlist_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  ip_address TEXT,
  cookie_id TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  postal_code TEXT,
  timezone TEXT,
  latitude REAL,
  longitude REAL,
  continent TEXT,
  user_agent TEXT,
  accept_language TEXT,
  locale TEXT,
  client_time TEXT,
  page_url TEXT,
  referrer TEXT,
  cookies_enabled INTEGER,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  location_json TEXT,
  client_context_json TEXT
);

CREATE INDEX IF NOT EXISTS waitlist_signups_created_at_idx
  ON waitlist_signups (created_at);

CREATE INDEX IF NOT EXISTS waitlist_signups_country_idx
  ON waitlist_signups (country);
