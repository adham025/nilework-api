import { getDb } from "@/core/db";
import type { FreelancerLevel, FreelancerTier } from "@nilework/schemas";

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

/** Compute a freelancer's Pro Path level from their orders + reviews. */
export async function computeFreelancerLevel(profileId: string): Promise<FreelancerLevel> {
  const sql = getDb();
  const orderRows = await sql<{ c: number }[]>`
    select count(*)::int as c from public.orders
    where freelancer_id = ${profileId} and status = 'released'
  `;
  const reviewRows = await sql<{ avg: number | null; c: number }[]>`
    select avg(rating)::float8 as avg, count(*)::int as c from public.reviews
    where reviewee_id = ${profileId}
  `;
  const completed = orderRows[0]?.c ?? 0;
  const avgRaw = reviewRows[0]?.avg ?? null;
  const avg = avgRaw === null ? null : Math.round(avgRaw * 100) / 100;
  const reviews = reviewRows[0]?.c ?? 0;

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
