# Velocity Funds — Launch Waitlist

Static waitlist landing page + Cloudflare Pages Functions API (D1).

## Deploy (Cloudflare Pages + D1)

1. Push this repo to GitHub.
2. Cloudflare Dashboard → Pages → Create a project → connect the GitHub repo.
3. Build settings:
   - Framework preset: None
   - Build command: (leave blank)
   - Output directory: / (or . depending on the UI)
4. Create a D1 database:
   - Cloudflare Dashboard → D1 → Create database (example: `vf_waitlist_prod`)
   - Run the schema in `d1/waitlist.sql`
5. Bind D1 to Pages:
   - Pages → your project → Settings → Functions → D1 database bindings
   - Binding name: `WAITLIST_DB`
   - Select your D1 database
6. Add environment variables (Pages → Settings → Variables):
   - `WAITLIST_STATS_TOKEN` (long random string; used to protect internal stats)
   - Optional: `WAITLIST_TABLE` (defaults to `waitlist_signups`)
7. Deploy.

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
- `created_at`

No confirmation emails are sent by this repo.
