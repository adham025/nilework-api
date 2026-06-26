import { getDb } from "@/core/db";
import { weightedAverage } from "@/modules/reviews/reviews.service";
import type { ClientLevel, ClientTier, FreelancerLevel, FreelancerTier } from "@nilework/schemas";

/**
 * Pro Path thresholds (§5.3). Tiers are earned from real outcomes — completed
 * (released) orders + rating quality — never vanity. Kept here as the single
 * source of truth, mirrored in the web copy.
 */
const TIERS = {
  rising: { orders: 1, rating: 0, reviews: 0 },
  pro: { orders: 10, rating: 4.5, reviews: 5 },
  elite: { orders: 50, rating: 4.8, reviews: 20 },
} as const;

const ORDER: FreelancerTier[] = ["new", "rising", "pro", "elite"];

function meets(
  t: { orders: number; rating: number; reviews: number },
  completed: number,
  avg: number | null,
  reviews: number,
): boolean {
  return completed >= t.orders && (avg ?? 0) >= t.rating && reviews >= t.reviews;
}

/**
 * Compute a freelancer's tier and progress to the next one. Pure given its inputs
 * so it's unit-testable; the service wrapper just supplies the aggregates.
 */
export function tierFor(
  completed: number,
  avg: number | null,
  reviews: number,
): { level: FreelancerTier; next: FreelancerTier | null; ordersToNext: number | null } {
  let level: FreelancerTier = "new";
  if (meets(TIERS.elite, completed, avg, reviews)) level = "elite";
  else if (meets(TIERS.pro, completed, avg, reviews)) level = "pro";
  else if (meets(TIERS.rising, completed, avg, reviews)) level = "rising";

  const idx = ORDER.indexOf(level);
  const next = ORDER[idx + 1] ?? null;
  let ordersToNext: number | null = null;
  if (next && next in TIERS) {
    const req = TIERS[next as keyof typeof TIERS];
    ordersToNext = Math.max(0, req.orders - completed);
  }
  return { level, next, ordersToNext };
}

/**
 * Tier perks (§5.3) — levels unlock real economics, not just a badge. Commission
 * floors and payout-hold caps; Math.min so a lower app-config base is never raised.
 */
export function tierCommissionBps(level: FreelancerTier, baseBps: number): number {
  if (level === "elite") return Math.min(baseBps, 600); // 6%
  if (level === "pro") return Math.min(baseBps, 800); // 8%
  return baseBps; // new / rising → base (10%)
}

export function tierHoldDays(level: FreelancerTier, baseDays: number): number {
  if (level === "elite") return Math.min(baseDays, 1);
  if (level === "pro") return Math.min(baseDays, 2);
  return baseDays;
}

/** A freelancer's current tier (the input to the perk mappers above). */
export async function freelancerTier(profileId: string): Promise<FreelancerTier> {
  return (await computeFreelancerLevel(profileId)).level;
}

/** Compute a freelancer's Pro Path level from their orders + reviews. */
export async function computeFreelancerLevel(profileId: string): Promise<FreelancerLevel> {
  const sql = getDb();
  const orderRows = await sql<{ c: number }[]>`
    select count(*)::int as c from public.orders
    where freelancer_id = ${profileId} and status = 'released'
  `;
  const countRows = await sql<{ c: number }[]>`
    select count(*)::int as c from public.reviews where reviewee_id = ${profileId}
  `;
  // Recency-weighted rating (§7) from recent reviews — the tier-deciding signal.
  const ratingRows = await sql<{ rating: number; created_at: string }[]>`
    select rating, created_at from public.reviews
    where reviewee_id = ${profileId} order by created_at desc limit 100
  `;
  const completed = orderRows[0]?.c ?? 0;
  const avg = weightedAverage(ratingRows);
  const reviews = countRows[0]?.c ?? 0;

  const { level, next, ordersToNext } = tierFor(completed, avg, reviews);
  return {
    level,
    completed_orders: completed,
    avg_rating: avg,
    review_count: reviews,
    next_level: next,
    orders_to_next: ordersToNext,
  };
}

// --- client loyalty tiers (§5.3) -------------------------------------------

/** Lifetime-spend thresholds (USD minor) for each client tier. */
const CLIENT_TIERS = { silver: 50_000, gold: 200_000, platinum: 1_000_000 } as const;
const CLIENT_ORDER: ClientTier[] = ["standard", "silver", "gold", "platinum"];

/** Pure: client tier + spend remaining to the next, from lifetime spend. */
export function clientTierFor(spentUsdMinor: number): {
  level: ClientTier;
  next: ClientTier | null;
  spendToNext: number | null;
} {
  let level: ClientTier = "standard";
  if (spentUsdMinor >= CLIENT_TIERS.platinum) level = "platinum";
  else if (spentUsdMinor >= CLIENT_TIERS.gold) level = "gold";
  else if (spentUsdMinor >= CLIENT_TIERS.silver) level = "silver";

  const next = CLIENT_ORDER[CLIENT_ORDER.indexOf(level) + 1] ?? null;
  const spendToNext =
    next && next in CLIENT_TIERS
      ? Math.max(0, CLIENT_TIERS[next as keyof typeof CLIENT_TIERS] - spentUsdMinor)
      : null;
  return { level, next, spendToNext };
}

/** Compute a client's loyalty tier from their lifetime completed spend. */
export async function computeClientLevel(profileId: string): Promise<ClientLevel> {
  const sql = getDb();
  const rows = await sql<{ spent: number; orders: number }[]>`
    select coalesce(sum(gross_usd_minor), 0)::bigint as spent, count(*)::int as orders
    from public.orders where client_id = ${profileId} and status = 'released'
  `;
  const spent = rows[0]?.spent ?? 0;
  const orders = rows[0]?.orders ?? 0;
  const { level, next, spendToNext } = clientTierFor(spent);
  return {
    level,
    total_spent_usd_minor: spent,
    completed_orders: orders,
    next_level: next,
    spend_to_next_usd_minor: spendToNext,
  };
}
