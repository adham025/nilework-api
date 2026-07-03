import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { weightedAverage } from "./reviews.service";

/**
 * Property suite for the recency-weighted rating (reviews-ratings-week5b):
 * the trust signal on every profile/gig and the Pro Path tier input.
 */

const NOW = Date.parse("2026-07-01T00:00:00Z");

const reviewArb = fc.record({
  rating: fc.integer({ min: 1, max: 5 }),
  ageDays: fc.integer({ min: 0, max: 3650 }),
});

function toReview({ rating, ageDays }: { rating: number; ageDays: number }) {
  return { rating, created_at: new Date(NOW - ageDays * 86_400_000).toISOString() };
}

describe("weightedAverage — properties", () => {
  it("Property 1 (bounds): the average always lies within [min, max] of the ratings", () => {
    fc.assert(
      fc.property(fc.array(reviewArb, { minLength: 1, maxLength: 50 }), (raw) => {
        const reviews = raw.map(toReview);
        const avg = weightedAverage(reviews, 180, NOW);
        const ratings = raw.map((r) => r.rating);
        expect(avg).not.toBeNull();
        if (avg !== null) {
          expect(avg).toBeGreaterThanOrEqual(Math.min(...ratings) - 0.005);
          expect(avg).toBeLessThanOrEqual(Math.max(...ratings) + 0.005);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("Property 2 (empty): no reviews → null, never NaN or 0", () => {
    expect(weightedAverage([], 180, NOW)).toBeNull();
  });

  it("Property 3 (identity): a single review returns exactly its rating", () => {
    fc.assert(
      fc.property(reviewArb, (raw) => {
        expect(weightedAverage([toReview(raw)], 180, NOW)).toBe(raw.rating);
      }),
      { numRuns: 200 },
    );
  });

  it("Property 4 (consensus): identical ratings average to that rating regardless of age", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.array(fc.integer({ min: 0, max: 3650 }), { minLength: 1, maxLength: 30 }),
        (rating, ages) => {
          const reviews = ages.map((ageDays) => toReview({ rating, ageDays }));
          expect(weightedAverage(reviews, 180, NOW)).toBe(rating);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("Property 5 (recency dominance): the newer of two ratings pulls the average past the midpoint", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 200, max: 3000 }),
        (newRating, oldRating, oldAge) => {
          fc.pre(newRating !== oldRating);
          const reviews = [
            toReview({ rating: newRating, ageDays: 0 }),
            toReview({ rating: oldRating, ageDays: oldAge }),
          ];
          const avg = weightedAverage(reviews, 180, NOW);
          const midpoint = (newRating + oldRating) / 2;
          expect(avg).not.toBeNull();
          if (avg !== null) {
            // The fresh review's weight (1.0) exceeds the old one's, so the
            // average must sit strictly on the new rating's side of the midpoint.
            if (newRating > oldRating) expect(avg).toBeGreaterThan(midpoint);
            else expect(avg).toBeLessThan(midpoint);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("Property 6 (determinism): identical inputs give identical results", () => {
    fc.assert(
      fc.property(fc.array(reviewArb, { maxLength: 30 }), (raw) => {
        const reviews = raw.map(toReview);
        expect(weightedAverage(reviews, 180, NOW)).toBe(weightedAverage(reviews, 180, NOW));
      }),
      { numRuns: 200 },
    );
  });

  it("Property 7 (order independence): review order does not change the average", () => {
    fc.assert(
      fc.property(fc.array(reviewArb, { minLength: 2, maxLength: 20 }), (raw) => {
        const forward = raw.map(toReview);
        const backward = [...forward].reverse();
        expect(weightedAverage(forward, 180, NOW)).toBe(weightedAverage(backward, 180, NOW));
      }),
      { numRuns: 200 },
    );
  });
});
