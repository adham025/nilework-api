# Secrets & environment checklist

Every credential the project uses, where to get it, whether it's required, and at
which launch stage you need it. Set runtime values as **host secrets** (Fly / Vercel),
never in the repo. Local dev uses `.env` files (gitignored) copied from `.env.example`.

Legend — **Stage:** when you first need it · **Req:** required to boot / function.

---

## A. API runtime — set as Fly secrets (`fly secrets set KEY=value`)

| Variable | Where to get it | Stage | Req |
|---|---|---|---|
| `NODE_ENV` | Set to `production` on Fly | 2 | ✅ |
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | 2 | ✅ |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` public key | 2 | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` key (**secret**) | 2 | ✅ |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (use the **pooler** in prod) | 2 | ✅* |
| `WEB_BASE_URL` | Your web URL, e.g. `https://nilework.com` (post-payment redirects) | 2 | ✅ |
| `CORS_ORIGINS` | Comma-separated web origins, e.g. `https://nilework.com` | 2 | ✅ |
| `SENTRY_DSN` | Sentry → Project → Client Keys (DSN). Optional error tracking | 7 | ⬜ |
| `RESEND_API_KEY` | resend.com → API Keys. Unset = in-app notifications only | 6 | ⬜ |
| `RESEND_FROM` | A verified Resend sender, e.g. `Nilework <noreply@nilework.com>` | 6 | ⬜ |
| `PAYMOB_API_KEY` | Paymob dashboard → Settings → Account Info (use **test** keys first) | 6 | ⬜† |
| `PAYMOB_INTEGRATION_ID` | Paymob → Developers → Payment Integrations (card integration id) | 6 | ⬜† |
| `PAYMOB_IFRAME_ID` | Paymob → Developers → iFrames | 6 | ⬜† |
| `PAYMOB_HMAC_SECRET` | Paymob → Developers → the HMAC secret for webhook verification | 6 | ⬜† |
| `OTP_PROVIDER` | `log` (dev, code printed to logs) or `cequens` (live) | 6 | ⬜ |
| `CEQUENS_API_KEY` | cequens.com dashboard → API credentials | 6 | ⬜ |
| `CEQUENS_SENDER` | Your approved Cequens sender id / WhatsApp number | 6 | ⬜ |
| `FX_API_URL` | Your USD→EGP rate feed endpoint. Unset = seeded placeholder rate | 6 | ⬜ |
| `FX_API_KEY` | API key for that FX feed, if it needs one | 6 | ⬜ |

\* `DATABASE_URL` is technically optional at boot (health reports `unconfigured`),
but the app does nothing useful without it — treat as required.
† Paymob: **all four** must be present together, or checkout stays in dev simulation
(`isPaymobConfigured`). Set the test set first, swap to live after merchant approval.

> Local dev: copy `.env.example` → `.env` and fill the same keys.

---

## B. Web — set as Vercel environment variables

All are **public** (`NEXT_PUBLIC_*`, shipped to the browser — anon key only, never
the service role).

| Variable | Where to get it | Stage | Req |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` above | 2 | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY` (anon only) | 2 | ✅ |
| `NEXT_PUBLIC_API_URL` | Your Fly API URL, e.g. `https://nilework-api.fly.dev` | 2 | ✅ |
| `NEXT_PUBLIC_GA_ID` | Google Analytics 4 → Measurement ID. Empty = analytics off | 7 | ⬜ |
| `NEXT_PUBLIC_GTM_ID` | Google Tag Manager container id. Empty = off | 7 | ⬜ |

> After deploying the web app, add its URL to the API's `CORS_ORIGINS`.

---

## C. GitHub Actions — repo secrets (Settings → Secrets and variables → Actions)

Only needed if you use the auto-deploy workflows (`.github/workflows/deploy.yml`).

| Repo | Secret | Where to get it |
|---|---|---|
| nilework-api | `FLY_API_TOKEN` | `fly tokens create deploy` |
| nilework-web | `VERCEL_TOKEN` | vercel.com/account/tokens |
| nilework-web | `VERCEL_ORG_ID` | `vercel link` → read `.vercel/project.json` |
| nilework-web | `VERCEL_PROJECT_ID` | `vercel link` → read `.vercel/project.json` |

(If you use Vercel's native Git integration instead, you can delete the web deploy
workflow and skip the three `VERCEL_*` secrets.)

---

## Minimum to go live in SANDBOX (fake money)
Section A required rows + Section B required rows. Nothing in C is mandatory (you
can deploy by hand). Paymob/Cequens/Resend/FX all run in safe fallback mode unset.

## To switch on REAL money
Add the four `PAYMOB_*` **live** keys (after merchant + payouts approval — see
`DEPLOY.md` Stage 5), then optionally Cequens (OTP), Resend (email), and an FX feed.
