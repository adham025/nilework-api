import { buildApp } from "@/app";
import { closeDb } from "@/core/db";
import { env } from "@/core/env";
import { Sentry, initSentry } from "@/core/sentry";

/** HTTP entrypoint (MASTER_PLAN §6.6: `api` process group). */
async function main() {
  initSentry();
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    Sentry.captureException(err);
    app.log.error(err);
    process.exit(1);
  }
}

void main();
