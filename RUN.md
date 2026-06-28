# Run Nilework locally

Two repos run side by side: **nilework-api** (Fastify, port 8080) and
**nilework-web** (Next.js, port 3000). Supabase is the hosted data layer — already
migrated and seeded, so you only need to start the two apps.

## Prerequisites
- **Node.js 22+** and npm.
- `.env` files already exist and hold your Supabase keys:
  - `nilework-api/.env`
  - `nilework-web/.env.local`

## One-time setup (install dependencies)
Run once per repo (and again only when dependencies change):

```sh
cd nilework-api && npm install
cd ../nilework-web && npm install
```

## Database — already done ✅
These were already run against your Supabase, so you can skip them. For reference /
a fresh database:

```sh
cd nilework-api
npm run migrate   # apply all SQL migrations
npm run seed      # demo users + gigs (dev/staging only)
```

Seeded demo accounts (password for all: **Nilework!demo1**):
- `amira.designer@nilework.dev` — freelancer
- `omar.writer@nilework.dev` — freelancer
- `client.nour@nilework.dev` — client

## Start the app (two terminals)

**Terminal 1 — API:**
```sh
cd nilework-api
npm run dev
```
Serves on http://localhost:8080 · API docs at http://localhost:8080/docs

**Terminal 2 — Web:**
```sh
cd nilework-web
npm run dev
```
Open http://localhost:3000

> Optional **Terminal 3 — background worker** (scheduled jobs: payout-hold settling,
> FX refresh). Not needed to click around:
> ```sh
> cd nilework-api && npm run worker
> ```

## Try it
1. Open http://localhost:3000 → log in with a seeded account (or sign up).
2. Browse gigs → buy one. With no gateway keys set, checkout **simulates** payment
   and funds escrow directly, so you can walk order → deliver → release end to end.
3. Visit `/dashboard` for orders, hourly, agency, plan, API keys, leaderboard, etc.

## Verify / quality
```sh
cd nilework-api && npm run ci      # typecheck + lint + tests + build
cd nilework-web  && npm run ci      # typecheck + lint + tests + build
# Smoke-test a running API:
API_BASE=http://localhost:8080 npm run smoke   # (from nilework-api)
```

## Payments in sandbox (optional, no business papers needed)
Pick a gateway and add its **test** keys to `nilework-api/.env`, then restart the API:
```sh
PAYMENT_PROVIDER=paymob     # or: kashier
# + that provider's keys (see .env.example / SECRETS.md)
```
Leave both unset to stay in free simulation mode.
