# Deploying Nilework

Two deployables: **nilework-api** (Fly.io — `app` + `worker`) and **nilework-web**
(Vercel). Supabase is the shared data layer. Everything runs in dev-simulation mode
until the corresponding provider secret is set, so you can deploy first and wire
providers incrementally.

## 1. Supabase (data layer)

1. Create a Supabase project; copy the URL, `anon` key, and `service_role` key
   (Settings → API) and the Postgres connection string (Settings → Database).
2. Migrations are forward-only SQL in `supabase/migrations/` and run automatically
   on every Fly deploy (`release_command = node scripts/migrate.mjs`). To run them
   by hand: `DATABASE_URL=... npm run migrate`.
3. Realtime + Storage are configured by the migrations themselves (the
   `supabase_realtime` publication for messages/notifications, and the private
   `identity-docs` bucket with owner-only RLS).

## 2. nilework-api (Fly.io)

```sh
fly launch --no-deploy           # reuses the checked-in fly.toml
fly secrets set \
  SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
  DATABASE_URL=... WEB_BASE_URL=https://app.nilework.com \
  CORS_ORIGINS=https://app.nilework.com
fly deploy
fly scale count app=1 worker=1   # run one HTTP + one worker machine
```

The image runs both process groups (`app` → HTTP, `worker` → pg-boss cron for
settle-holds + fx-refresh). Health check: `GET /v1/health`. API docs: `/docs`.

### Provider secrets (each flips one feature from dev-sim to live)

| Secret(s) | Enables |
|---|---|
| `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`, `PAYMOB_HMAC_SECRET` | Real Paymob checkout + the verified webhook (else checkout simulates funding) |
| `KASHIER_MERCHANT_ID`, `KASHIER_API_KEY` (+ `KASHIER_SECRET_KEY`, `KASHIER_MODE`) | Real Kashier checkout + the verified webhook |
| `RESEND_API_KEY` (+ `RESEND_FROM`) | Email notifications (else in-app only) |
| `OTP_PROVIDER=cequens`, `CEQUENS_API_KEY`, `CEQUENS_SENDER` | Real WhatsApp/SMS OTP (else the code is logged) |
| `FX_API_URL` (+ `FX_API_KEY`) | Live USD→EGP feed (else the seeded placeholder rate) |
| `SENTRY_DSN` | Error tracking |

**Choosing the gateway:** `PAYMENT_PROVIDER` = `auto` (default; prefers Paymob, then
Kashier, else simulation), or force `paymob` / `kashier` to test one sandbox at a
time. Both can be configured at once. Webhook URLs to register:
- Paymob: `https://<api-host>/v1/payments/paymob/webhook` (Paymob appends `?hmac=`).
- Kashier: `https://<api-host>/v1/payments/kashier/webhook` (also set `API_BASE_URL`
  so checkout can pass `serverWebhook`, or configure the webhook in Kashier's
  dashboard).

## 3. Seed a staff user (admin console access)

The admin console (`/admin`) is gated by an active `staff_users` row. After the
person signs up, find their `auth.users` id and:

```sql
insert into public.staff_users (user_id, email, staff_role)
values ('<auth-user-uuid>', 'ops@nilework.com', 'super_admin');
```

> Follow-up before real ops use: mandatory 2FA for admin (MASTER_PLAN §6.2).

## 3b. Seed demo data (dev/staging only)

To make a fresh environment immediately walkable, populate a few confirmed users
(two freelancers, one client) and sample gigs:

```sh
DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed
```

Idempotent and safe to re-run; prints the shared demo password. Never run against
production data.

## 4. nilework-web (Vercel)

Import the repo in Vercel and set env vars (see `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_API_URL=https://<api-host>`, and optionally `NEXT_PUBLIC_GA_ID`.
Add the Vercel domain to the API's `CORS_ORIGINS`.

## 5. Smoke test (verify a deploy)

Walk the public surface (and, with a key, authenticated `/me` endpoints):

```sh
API_BASE=https://<api-host> npm run smoke
# also exercise authenticated routes with a key from /dashboard/api-keys:
API_BASE=https://<api-host> NILEWORK_API_KEY=nw_... npm run smoke
```

Exits non-zero on the first failure, so it can gate a deploy in CI.

## 6. Go-live gate

Real EGP custody (live Paymob + payouts) is gated on the Egypt money-licensing /
escrow-custody question (MASTER_PLAN §8/§12). Everything is fully testable against
Paymob's sandbox before that clears.
