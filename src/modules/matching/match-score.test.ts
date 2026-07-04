import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type MatchInput, matchScore } from "./match-score";

const inputArb: fc.Arbitrary<MatchInput> = fc.record({
  avgRating: fc.oneof(fc.constant(null), fc.double({ min: 1, max: 5, noNaN: true })),
  reviewCount: fc.integer({ min: 0, max: 500 }),
  completedOrders: fc.integer({ min: 0, max: 1000 }),
  tier: fc.constantFrom("new", "rising", "pro", "elite") as fc.Arbitrary<MatchInput["tier"]>,
  categoryMatch: fc.boolean(),
  priceRatio: fc.oneof(fc.constant(null), fc.double({ min: 0.05, max: 20, noNaN: true })),
  daysSinceActive: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 3650 })),
});

describe("matchScore — properties", () => {
  it("Property 1 (bounds): score is always an integer in [0, 100]", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const s = matchScore(input);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }),
      { numRuns: 500 },
    );
  });

  it("Property 2 (rating monotonicity): a better rating never lowers the score", () => {
    fc.assert(
      fc.property(
        inputArb,
        fc.double({ min: 1, max: 5, noNaN: true }),
        fc.double({ min: 1, max: 5, noNaN: true }),
        (base, a, b) => {
          fc.pre(base.reviewCount > 0);
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(matchScore({ ...base, avgRating: hi })).toBeGreaterThanOrEqual(
            matchScore({ ...base, avgRating: lo }),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("Property 3 (track-record monotonicity): more completed orders never lower the score", () => {
    fc.assert(
      fc.property(
        inputArb,
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 0, max: 1000 }),
        (base, a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          expect(matchScore({ ...base, completedOrders: hi })).toBeGreaterThanOrEqual(
            matchScore({ ...base, completedOrders: lo }),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("Property 4 (tier order): each tier scores >= the one below, all else equal", () => {
    fc.assert(
      fc.property(inputArb, (base) => {
        const s = (tier: MatchInput["tier"]) => matchScore({ ...base, tier });
        expect(s("rising")).toBeGreaterThanOrEqual(s("new"));
        expect(s("pro")).toBeGreaterThanOrEqual(s("rising"));
        expect(s("elite")).toBeGreaterThanOrEqual(s("pro"));
      }),
      { numRuns: 300 },
    );
  });

  it("Property 5 (price peak): mid-budget bids score >= extreme bids, all else equal", () => {
    fc.assert(
      fc.property(inputArb, fc.double({ min: 2.2, max: 20, noNaN: true }), (base, extreme) => {
        const mid = matchScore({ ...base, priceRatio: 1 });
        expect(mid).toBeGreaterThanOrEqual(matchScore({ ...base, priceRatio: extreme }));
        expect(mid).toBeGreaterThanOrEqual(matchScore({ ...base, priceRatio: 1 / extreme }));
      }),
      { numRuns: 300 },
    );
  });

  it("Property 6 (determinism + null-safety): same input, same score; nulls never crash", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        expect(matchScore(input)).toBe(matchScore(input));
      }),
      { numRuns: 300 },
    );
    expect(() =>
      matchScore({
        avgRating: null,
        reviewCount: 0,
        completedOrders: 0,
        tier: "new",
        categoryMatch: false,
        priceRatio: null,
        daysSinceActive: null,
      }),
    ).not.toThrow();
  });
});

describe("matchScore — examples", () => {
  it("a proven pro beats a newcomer for the same job", () => {
    const common = { categoryMatch: true, priceRatio: 1, daysSinceActive: 1 } as const;
    const pro = matchScore({
      ...common,
      avgRating: 5,
      reviewCount: 5,
      completedOrders: 11,
      tier: "pro",
    });
    const newbie = matchScore({
      ...common,
      avgRating: null,
      reviewCount: 0,
      completedOrders: 0,
      tier: "new",
    });
    expect(pro).toBeGreaterThan(newbie);
    expect(pro).toBeGreaterThanOrEqual(70);
    expect(newbie).toBeLessThanOrEqual(45);
  });
});
