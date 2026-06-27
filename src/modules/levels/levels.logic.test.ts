import { describe, expect, it } from "vitest";
import { clientTierFor, tierCommissionBps, tierFor, tierHoldDays } from "./levels.service";

describe("tierFor (freelancer Pro Path)", () => {
  it("starts everyone at new", () => {
    expect(tierFor(0, null, 0).level).toBe("new");
  });
  it("promotes to rising after the first completed order", () => {
    expect(tierFor(1, null, 0).level).toBe("rising");
  });
  it("requires orders AND rating AND review count for pro", () => {
    expect(tierFor(10, 4.5, 5).level).toBe("pro");
    expect(tierFor(10, 4.4, 5).level).toBe("rising"); // rating just short
    expect(tierFor(10, 4.5, 4).level).toBe("rising"); // too few reviews
  });
  it("reaches elite at the top thresholds", () => {
    expect(tierFor(50, 4.8, 20).level).toBe("elite");
    expect(tierFor(49, 4.8, 20).level).toBe("pro");
  });
});

describe("tier perks", () => {
  it("lowers commission only at pro/elite, never above base", () => {
    expect(tierCommissionBps("new", 1000)).toBe(1000);
    expect(tierCommissionBps("rising", 1000)).toBe(1000);
    expect(tierCommissionBps("pro", 1000)).toBe(800);
    expect(tierCommissionBps("elite", 1000)).toBe(600);
    // Never raises a base that's already below the cap.
    expect(tierCommissionBps("elite", 500)).toBe(500);
  });
  it("shortens payout hold at pro/elite, never beyond base", () => {
    expect(tierHoldDays("new", 3)).toBe(3);
    expect(tierHoldDays("pro", 3)).toBe(2);
    expect(tierHoldDays("elite", 3)).toBe(1);
    expect(tierHoldDays("elite", 0)).toBe(0);
  });
});

describe("clientTierFor (loyalty)", () => {
  it("maps lifetime spend to tiers and remaining spend", () => {
    expect(clientTierFor(0)).toMatchObject({ level: "standard", next: "silver" });
    expect(clientTierFor(50_000).level).toBe("silver");
    expect(clientTierFor(200_000).level).toBe("gold");
    expect(clientTierFor(1_000_000)).toMatchObject({ level: "platinum", next: null });
  });
  it("computes spendToNext from the next threshold", () => {
    expect(clientTierFor(40_000).spendToNext).toBe(10_000); // to silver
  });
});
