# nilework-api — multi-stage build. One image runs both process groups on Fly.io:
#   app    → node dist/server.js   (HTTP)
#   worker → node dist/worker.js   (pg-boss cron: settle-holds, fx-refresh)
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY schemas/package.json ./schemas/
RUN npm ci
COPY . .
RUN npm run build -w @nilework/schemas && npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY schemas/package.json ./schemas/
RUN npm ci --omit=dev
# Built JS + the shared schemas dist (workspace symlink resolves to ./schemas/dist).
COPY --from=build /app/dist ./dist
COPY --from=build /app/schemas/dist ./schemas/dist
# Migrations + runner, used by the Fly release_command.
COPY supabase ./supabase
COPY scripts ./scripts
EXPOSE 8080
CMD ["node", "dist/server.js"]
