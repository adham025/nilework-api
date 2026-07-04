/**
 * Deterministic freelancer↔job match scoring (Phase 4b: backend intelligence).
 *
 * No LLM/API by design: at this catalog size, an explainable weighted score
 * beats a black box — clients can be told WHY a proposal ranks first, and the
 * function is pure enough to property-test. Weights sum to 100.
 *
 *   rating       0–30  recency-weighted avg, discounted by review confidence
 *   track record 0–20  completed (released) orders, log-scaled
 *   tier         0–15  Pro Path level (new/rising/pro/elite)
 *   category     0–15  freelancer actively sells in the project's category
 *   price fit    0–10  bid near the client's budget midpoint (proposals only)
 *   freshness    0–10  recent platform activity
 */

export type MatchTier = "new" | "rising" | "pro" | "elite";

export interface MatchInput {
  /** Recency-weighted average rating (1–5) or null when unreviewed. */
  avgRating: number | null;
  reviewCount: number;
  /** Orders released to this freelancer. */
  completedOrders: number;
  tier: MatchTier;
  /** Freelancer has an active gig in the project's category. */
  categoryMatch: boolean;
  /**
   * bid ÷ budget-midpoint (proposals). 1 = exactly mid-budget; null when there
   * is no bid to compare (e.g. recommendations without a price).
   */
  priceRatio: number | null;
  /** Days since the freelancer's last platform activity; null = unknown. */
  daysSinceActive: number | null;
}

const TIER_POINTS: Record<MatchTier, number> = { new: 0, rising: 6, pro: 11, elite: 15 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Score a freelancer for a job. Pure, deterministic, always in [0, 100]. */
export function matchScore(input: MatchInput): number {
  // Rating (0–30): scale 1–5 → 0–30, discounted by confidence so a single
  // 5-star review doesn't outrank fifty 4.8s. Confidence saturates at 10 reviews.
  let rating = 0;
  if (input.avgRating !== null && input.reviewCount > 0) {
    const base = (clamp(input.avgRating, 1, 5) - 1) / 4; // 0..1
    const confidence = clamp(input.reviewCount / 10, 0, 1);
    rating = 30 * base * (0.4 + 0.6 * confidence);
  }

  // Track record (0–20): log-scaled — the 1st→10th order matters more than
  // the 90th→100th. Saturates at ~50 completed orders.
  const track =
    20 * clamp(Math.log10(1 + Math.max(0, input.completedOrders)) / Math.log10(51), 0, 1);

  const tier = TIER_POINTS[input.tier];
  const category = input.categoryMatch ? 15 : 0;

  // Price fit (0–10): peak at the budget midpoint, fading linearly to 0 at
  // half or double the midpoint. No bid → neutral half credit.
  let price = 5;
  if (input.priceRatio !== null && input.priceRatio > 0) {
    const distance = Math.abs(Math.log2(input.priceRatio)); // 0 at midpoint, 1 at half/double
    price = 10 * clamp(1 - distance, 0, 1);
  }

  // Freshness (0–10): full marks within a week, fading to 0 at 90 days.
  let fresh = 5;
  if (input.daysSinceActive !== null) {
    const days = Math.max(0, input.daysSinceActive);
    fresh = days <= 7 ? 10 : 10 * clamp(1 - (days - 7) / 83, 0, 1);
  }

  return Math.round(clamp(rating + track + tier + category + price + fresh, 0, 100));
}
