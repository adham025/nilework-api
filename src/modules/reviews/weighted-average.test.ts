import { describe, expect, it } from "vitest";
import { weightedAverage } from "./reviews.service";

const NOW = Date.parse("2026-01-01T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("weightedAverage (recency-decayed rating)", () => {
  it("returns null with no reviews", () => {
    expect(weightedAverage([], 180, NOW)).toBeNull();
  });
  it("equals the plain rating for a single review", () => {
    expect(weightedAverage([{ rating: 4, created_at: daysAgo(0) }], 180, NOW)).toBe(4);
  });
  it("averages equally-recent reviews", () => {
    const r = weightedAverage(
      [
        { rating: 5, created_at: daysAgo(1) },
        { rating: 3, created_at: daysAgo(1) },
      ],
      180,
      NOW,
    );
    expect(r).toBeCloseTo(4, 5);
  });
  it("weights recent reviews more than old ones", () => {
    // Recent 5-star + one-half-life-old 1-star should sit above the plain mean (3).
    const r = weightedAverage(
      [
        { rating: 5, created_at: daysAgo(0) },
        { rating: 1, created_at: daysAgo(180) },
      ],
      180,
      NOW,
    );
    expect(r).not.toBeNull();
    expect(r as number).toBeGreaterThan(3);
    expect(r as number).toBeLessThan(5);
  });
});
