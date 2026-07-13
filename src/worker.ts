import { closeDb } from "@/core/db";
import { env } from "@/core/env";
import { initSentry } from "@/core/sentry";
import { refreshFxRate } from "@/modules/fx/fx.service";
import { expireOffers } from "@/modules/offers/offers.service";
import { expirePendingOrders, settleHolds } from "@/modules/orders/orders.service";
import { PgBoss } from "pg-boss";

/**
 * Queue/cron entrypoint (MASTER_PLAN §6.6: `worker` process group), now on pg-boss
 * — durable, Postgres-backed scheduling that survives restarts and won't double-run
 * across instances (replacing the slice-#4 setInterval). Same service functions the
 * HTTP routes use; pg-boss only schedules them.
 */
const SETTLE_HOLDS = "settle-holds";
const FX_REFRESH = "fx-refresh";
const EXPIRE_OFFERS = "expire-offers";
const EXPIRE_PENDING_ORDERS = "expire-pending-orders";

async function ensureQueue(boss: PgBoss, name: string): Promise<void> {
  try {
    await boss.createQueue(name);
  } catch (err) {
    // Already exists across restarts — safe to ignore.
    console.warn(`createQueue(${name}):`, err);
  }
}

async function main() {
  initSentry();

  if (!env.DATABASE_URL) {
    console.log("worker idle: DATABASE_URL not set");
    return;
  }

  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err: Error) => console.error("pg-boss error:", err));
  await boss.start();

  await ensureQueue(boss, SETTLE_HOLDS);
  await ensureQueue(boss, FX_REFRESH);
  await ensureQueue(boss, EXPIRE_OFFERS);
  await ensureQueue(boss, EXPIRE_PENDING_ORDERS);

  await boss.work(SETTLE_HOLDS, async () => {
    const released = await settleHolds();
    if (released > 0) console.log(`settle-holds: auto-released ${released} order(s)`);
  });
  await boss.work(FX_REFRESH, async () => {
    await refreshFxRate();
  });
  await boss.work(EXPIRE_OFFERS, async () => {
    const expired = await expireOffers();
    if (expired > 0) console.log(`expire-offers: expired ${expired} offer(s)`);
  });
  await boss.work(EXPIRE_PENDING_ORDERS, async () => {
    const cancelled = await expirePendingOrders();
    if (cancelled > 0) {
      console.log(`expire-pending-orders: cancelled ${cancelled} unfunded order(s)`);
    }
  });

  // Durable cron schedules (idempotent upserts).
  await boss.schedule(SETTLE_HOLDS, "*/5 * * * *"); // every 5 minutes
  await boss.schedule(FX_REFRESH, "0 * * * *"); // hourly
  await boss.schedule(EXPIRE_OFFERS, "*/10 * * * *"); // every 10 minutes
  await boss.schedule(EXPIRE_PENDING_ORDERS, "30 * * * *"); // hourly

  console.log(
    "nilework worker started (pg-boss: settle-holds */5m, fx-refresh hourly, expire-offers */10m, expire-pending-orders hourly)",
  );

  const shutdown = async () => {
    await boss.stop({ graceful: true });
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main();
