# nilework-api

Backend for **Nilework** — Node.js + Fastify + Zod, deployed to Fly.io as two
process groups (`api` HTTP + `worker` queue/cron). Owns all business logic and
all writes to money/trust-sensitive tables. See `../MASTER_PLAN.md` (§6).

## Stack
- **Fastify 5 + Zod** (`fastify-type-provider-zod`) — validated routes + OpenAPI.
- **`@nilework/schemas`** (workspace) — shared Zod schemas + branded ID types,
  the single cross-repo contract consumed by `nilework-web` (§6.6).
- **Supabase** — Postgres (service-role connection), Auth (JWT verification).
- **Sentry** — error tracking. **tsup** build · **tsx** dev · **Biome** lint/format · **Vitest** tests.
- ESM, strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).

## Setup
```sh
cp .env.example .env   # fill in real values
npm install            # also self-activates the local git hooks
npm run dev            # http://localhost:8080  (docs at /docs, health at /v1/health)
```

## Scripts
| Script | What it does |
|---|---|
| `npm run dev` | Watch-mode HTTP server (tsx) |
| `npm run worker` | Watch-mode queue/cron worker |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome check |
| `npm run test` | Vitest |
| `npm run build` | tsup bundle (server + worker) |
| `npm run ci` | schemas build → typecheck → lint → test → build (the full gate) |

## Local CI (git hooks) — MASTER_PLAN §6.4
No GitHub Actions; the quality gate runs locally, zero hosted-CI minutes.
- **pre-commit** → `typecheck` + `lint` (fast).
- **pre-push** → `npm run ci` (full gate). Push aborts if anything fails.
- Hooks live in `.githooks/` and self-activate via the `prepare` script on install.
- Emergency bypass: `git commit --no-verify` / `git push --no-verify` (sparingly).
