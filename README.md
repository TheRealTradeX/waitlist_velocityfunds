# Velocity Funds - Launch Waitlist

Static waitlist landing page + Cloudflare Pages Functions API (D1).

## Deploy (Cloudflare Pages + D1)

1. Push this repo to GitHub.
2. Cloudflare Dashboard -> Pages -> Create a project -> connect the GitHub repo.
3. Build settings:
   - Framework preset: None
   - Build command: (leave blank)
   - Output directory: `/` (or `.` depending on the UI)
4. Create a D1 database:
   - Cloudflare Dashboard -> D1 -> Create database (example: `vf_waitlist_prod`)
   - Run the schema in `d1/waitlist.sql`
5. Bind D1 to Pages:
   - Pages -> your project -> Settings -> Functions -> D1 database bindings
   - Binding name: `WAITLIST_DB`
   - Select your D1 database
6. Add environment variables (Pages -> Settings -> Variables):
   - `WAITLIST_STATS_TOKEN` (long random string; used to protect internal stats)
   - Optional: `WAITLIST_TABLE` (defaults to `waitlist_signups`)
7. Deploy.

## Waitlist Tracking & Anti-Bot

### Env var checklist

Required:
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET`
- `IP_SALT`

Existing:
- `WAITLIST_DB`
- `WAITLIST_STATS_TOKEN`
- Optional: `WAITLIST_TABLE`

### What is captured

Frontend sends:
- `email`
- `turnstileToken`
- `referrer`
- `landing_path`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`

Backend adds:
- `email_normalized`
- `country` (from `CF-IPCountry`, fallback `XX`)
- `user_agent`
- `ip_hash` (`SHA-256(CF-Connecting-IP + IP_SALT)`)
- `status` (`accepted` or `blocked`)
- `block_reason` (for example `rate_limit`)

### Behavior

- Turnstile is required for every submit.
- Duplicate email detection is based on `email_normalized`.
- Rate limit: if the same `ip_hash` has 5+ attempts in 10 minutes, a row is inserted as blocked and API returns `429`.

### D1 migration notes (manual, do not auto-run in code)

Use these statements to add missing columns/indexes to an existing `waitlist_signups` table:

```sql
ALTER TABLE waitlist_signups ADD COLUMN email_normalized TEXT;
ALTER TABLE waitlist_signups ADD COLUMN referrer TEXT;
ALTER TABLE waitlist_signups ADD COLUMN landing_path TEXT;
ALTER TABLE waitlist_signups ADD COLUMN utm_source TEXT;
ALTER TABLE waitlist_signups ADD COLUMN utm_medium TEXT;
ALTER TABLE waitlist_signups ADD COLUMN utm_campaign TEXT;
ALTER TABLE waitlist_signups ADD COLUMN utm_content TEXT;
ALTER TABLE waitlist_signups ADD COLUMN utm_term TEXT;
ALTER TABLE waitlist_signups ADD COLUMN country TEXT;
ALTER TABLE waitlist_signups ADD COLUMN user_agent TEXT;
ALTER TABLE waitlist_signups ADD COLUMN ip_hash TEXT;
ALTER TABLE waitlist_signups ADD COLUMN status TEXT;
ALTER TABLE waitlist_signups ADD COLUMN block_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist_signups (created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_email_normalized ON waitlist_signups (email_normalized);
CREATE INDEX IF NOT EXISTS idx_waitlist_ip_hash ON waitlist_signups (ip_hash);

-- Optional, recommended dedupe hardening:
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_email_normalized ON waitlist_signups (email_normalized);
```

## Internal stats

The endpoint `GET /api/waitlist-stats` returns:
- `total` (total signups)
- `by_day` (last 30 days)
- `recent` (recent emails)

Auth options:
- `Authorization: Bearer <WAITLIST_STATS_TOKEN>`
- or `X-Admin-Token: <WAITLIST_STATS_TOKEN>`
- or `?token=<WAITLIST_STATS_TOKEN>` (least preferred)

## Data stored

Signups store:
- `email`
- `email_normalized`
- `created_at`
- attribution fields (`referrer`, `landing_path`, `utm_*`)
- request signals (`country`, `user_agent`, `ip_hash`)
- moderation fields (`status`, `block_reason`)

No confirmation emails are sent by this repo.
