import { describe, expect, it } from "vitest";
import { tierFor } from "./levels.service";

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
