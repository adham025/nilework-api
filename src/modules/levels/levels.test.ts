import { describe, expect, it } from "vitest";
import { tierCommissionBps, tierFor, tierHoldDays } from "./levels.service";

describe("tierFor (Pro Path)", () => {
  it("is new with no completed orders", () => {
    const r = tierFor(0, null, 0);
    expect(r.level).toBe("new");
    expect(r.next).toBe("rising");
    expect(r.ordersToNext).toBe(1);
  });

  it("is rising after the first completed order", () => {
    expect(tierFor(1, null, 0).level).toBe("rising");
  });

  it("reaches pro only with enough orders, rating, and reviews", () => {
    expect(tierFor(10, 4.6, 5).level).toBe("pro");
    // Enough orders but rating too low → stays rising.
    expect(tierFor(10, 4.0, 5).level).toBe("rising");
    // Enough orders + rating but too few reviews → stays rising.
    expect(tierFor(10, 4.9, 2).level).toBe("rising");
  });

  it("reaches elite at the top thresholds, with no next level", () => {
    const r = tierFor(50, 4.9, 25);
    expect(r.level).toBe("elite");
    expect(r.next).toBeNull();
    expect(r.ordersToNext).toBeNull();
  });

  it("reports orders remaining to the next tier", () => {
    expect(tierFor(4, 4.6, 6).ordersToNext).toBe(6); // rising → pro needs 10
  });
});

describe("tier perks", () => {
  it("discounts commission for pro/elite, base otherwise", () => {
    expect(tierCommissionBps("new", 1000)).toBe(1000);
    expect(tierCommissionBps("rising", 1000)).toBe(1000);
    expect(tierCommissionBps("pro", 1000)).toBe(800);
    expect(tierCommissionBps("elite", 1000)).toBe(600);
  });
  it("never raises commission above a lower config base", () => {
    expect(tierCommissionBps("pro", 500)).toBe(500);
  });
  it("shortens the payout hold for pro/elite", () => {
    expect(tierHoldDays("new", 3)).toBe(3);
    expect(tierHoldDays("pro", 3)).toBe(2);
    expect(tierHoldDays("elite", 3)).toBe(1);
  });
});
