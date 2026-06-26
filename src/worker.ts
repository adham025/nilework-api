import { closeDb } from "@/core/db";
import { initSentry } from "@/core/sentry";
import { settleHolds } from "@/modules/orders/orders.service";

/**
 * Queue/cron entrypoint (MASTER_PLAN §6.6: `worker` process group).
 * Imports the same service functions the HTTP routes call — never a second
 * implementation. Until pg-boss lands (slice #9), scheduled jobs run on a simple
 * interval; the job logic itself is already production-shaped, so that swap is
 * the scheduler only, not the work.
 */
const SETTLE_HOLDS_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

async function runSettleHolds(): Promise<void> {
  try {
    const released = await settleHolds();
    if (released > 0) console.log(`settle-holds: auto-released ${released} order(s)`);
  } catch (err) {
    console.error("settle-holds failed:", err);
  }
}

async function main() {
  initSentry();
  console.log("nilework worker started (settle-holds every 5m)");

  const timer = setInterval(() => void runSettleHolds(), SETTLE_HOLDS_INTERVAL_MS);
  void runSettleHolds(); // run once at boot, don't wait a full interval

  const shutdown = async () => {
    clearInterval(timer);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main();
