import { describe, expect, it } from "vitest";
import { splitCommission } from "./orders.service";

describe("splitCommission", () => {
  it("splits gross into commission + net (10%)", () => {
    expect(splitCommission(10_000, 1000)).toEqual({ commission: 1000, net: 9000 });
  });
  it("floors the commission so net never loses cents to rounding", () => {
    const { commission, net } = splitCommission(999, 1000); // 99.9 → 99
    expect(commission).toBe(99);
    expect(net).toBe(900);
    expect(commission + net).toBe(999);
  });
  it("is a no-op at zero commission", () => {
    expect(splitCommission(5000, 0)).toEqual({ commission: 0, net: 5000 });
  });
  it("always conserves the gross amount", () => {
    for (const gross of [1, 333, 12_345, 1_000_000]) {
      const { commission, net } = splitCommission(gross, 850);
      expect(commission + net).toBe(gross);
    }
  });
});
