import { closeDb } from "@/core/db";
import { initSentry } from "@/core/sentry";

/**
 * Queue/cron entrypoint (MASTER_PLAN §6.6: `worker` process group).
 * Imports the same module/service functions the HTTP routes call — never a
 * second implementation. pg-boss wiring lands with the notification system
 * (slice #9) and the scheduled jobs (settle-holds, FX refresh, payouts).
 */
async function main() {
  initSentry();
  console.log("nilework worker started (no jobs registered yet)");

  const shutdown = async () => {
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main();
