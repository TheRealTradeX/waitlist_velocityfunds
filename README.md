# Velocity Funds — Launch Waitlist

Static waitlist landing page + Cloudflare Pages Functions API.

## Deploy (Cloudflare Pages + D1 + Resend)

1. Push this repo to GitHub.
2. In Cloudflare Dashboard → **Pages** → **Create a project** → connect the GitHub repo.
3. Create a D1 database:
   - Cloudflare Dashboard → **D1** → **Create database** (ex: `vf_waitlist_prod`)
   - Run the schema in `d1/waitlist.sql`
4. Bind D1 to Pages:
   - Pages → your project → **Settings** → **Functions** → **D1 database bindings**
   - Binding name: `WAITLIST_DB`
   - Select your D1 database
5. Add environment variables (Pages → Settings → Variables):
   - `WAITLIST_STATS_TOKEN` (long random string; used for internal stats access)
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` (ex: `Velocity Funds <updates@velocityfunds.io>`)
   - Optional: `RESEND_REPLY_TO`, `WAITLIST_TABLE` (defaults to `waitlist_signups`)
6. Deploy.

## Internal stats

The endpoint `GET /api/waitlist-stats` returns totals grouped by day and country.

Auth options:
- `Authorization: Bearer <WAITLIST_STATS_TOKEN>`
- or `X-Admin-Token: <WAITLIST_STATS_TOKEN>`
- or `?token=<WAITLIST_STATS_TOKEN>` (least preferred)

## Data stored

Signups capture `email`, `created_at`, `ip_address`, `cookie_id`, Cloudflare geo (`request.cf`), and UTM + client context.
