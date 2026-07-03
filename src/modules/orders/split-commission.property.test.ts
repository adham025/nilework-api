import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { splitCommission } from "./orders.service";

/**
 * Property suite for the single function every escrow order's money math flows
 * through (order-flow-week4a correctness). Gross amounts are USD minor units;
 * commission rates are basis points (0–10000).
 */

const grossArb = fc.integer({ min: 0, max: 100_000_000 }); // $0 – $1M
const bpsArb = fc.integer({ min: 0, max: 10_000 });

describe("splitCommission — properties", () => {
  it("Property 1 (conservation): commission + net === gross, exactly, always", () => {
    fc.assert(
      fc.property(grossArb, bpsArb, (gross, bps) => {
        const { commission, net } = splitCommission(gross, bps);
        expect(commission + net).toBe(gross);
      }),
      { numRuns: 500 },
    );
  });

  it("Property 2 (non-negativity): neither side can go negative", () => {
    fc.assert(
      fc.property(grossArb, bpsArb, (gross, bps) => {
        const { commission, net } = splitCommission(gross, bps);
        expect(commission).toBeGreaterThanOrEqual(0);
        expect(net).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 500 },
    );
  });

  it("Property 3 (floor semantics): the platform never over-charges by rounding", () => {
    fc.assert(
      fc.property(grossArb, bpsArb, (gross, bps) => {
        const { commission } = splitCommission(gross, bps);
        // commission is the floor of the exact proportional amount
        expect(commission).toBeLessThanOrEqual((gross * bps) / 10_000);
        expect(commission).toBeGreaterThan((gross * bps) / 10_000 - 1);
      }),
      { numRuns: 500 },
    );
  });

  it("Property 4 (monotonicity): a higher rate never lowers the commission", () => {
    fc.assert(
      fc.property(grossArb, bpsArb, bpsArb, (gross, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(splitCommission(gross, hi).commission).toBeGreaterThanOrEqual(
          splitCommission(gross, lo).commission,
        );
      }),
      { numRuns: 300 },
    );
  });

  it("Property 5 (integrality): both sides are whole minor units", () => {
    fc.assert(
      fc.property(grossArb, bpsArb, (gross, bps) => {
        const { commission, net } = splitCommission(gross, bps);
        expect(Number.isInteger(commission)).toBe(true);
        expect(Number.isInteger(net)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("edges: 0 bps takes nothing; 10000 bps takes everything", () => {
    fc.assert(
      fc.property(grossArb, (gross) => {
        expect(splitCommission(gross, 0)).toEqual({ commission: 0, net: gross });
        expect(splitCommission(gross, 10_000)).toEqual({ commission: gross, net: 0 });
      }),
      { numRuns: 200 },
    );
  });
});
