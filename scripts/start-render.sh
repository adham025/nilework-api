#!/bin/sh
# Render.com free-tier start command (see render.yaml). Render's free plan is
# a single "Web Service" — no separate background-worker service — so this
# runs migrations, then the pg-boss worker (settle-holds, fx-refresh,
# expire-offers) as a background process, then the HTTP server in the
# foreground as PID 1 so Render's health check and restart-on-crash target it.
# Fly.io (fly.toml) is unaffected: it runs server/worker as separate process
# groups from the same image and never invokes this script.
set -e
node scripts/migrate.mjs
node dist/worker.js &
exec node dist/server.js
