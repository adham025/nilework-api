# nilework-api — multi-stage build. One image runs both process groups on Fly.io
# (via fly.toml [processes]) or combined in one container on Render's free tier
# (via scripts/start-render.sh):
#   app    → node dist/server.js   (HTTP)
#   worker → node dist/worker.js   (pg-boss cron: settle-holds, fx-refresh, expire-offers)
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY schemas/package.json ./schemas/
# scripts/ must exist before `npm ci` — it runs the `prepare` lifecycle script
# (scripts/install-hooks.mjs), which node needs to find on disk even though the
# script itself safely no-ops when there's no .git directory (as in this build).
COPY scripts ./scripts
RUN npm ci
COPY . .
RUN npm run build -w @nilework/schemas && npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY schemas/package.json ./schemas/
COPY scripts ./scripts
RUN npm ci --omit=dev
# Built JS + the shared schemas dist (workspace symlink resolves to ./schemas/dist).
COPY --from=build /app/dist ./dist
COPY --from=build /app/schemas/dist ./schemas/dist
# Migrations, used by the Fly release_command and scripts/start-render.sh.
COPY supabase ./supabase
EXPOSE 8080
CMD ["node", "dist/server.js"]
