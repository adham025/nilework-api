import { describe, expect, it } from "vitest";
import { estimateMinor } from "./fx.service";

describe("estimateMinor", () => {
  it("converts USD minor to settlement minor at the given rate, rounded", () => {
    // $50.00 (5000 minor) at 49.00 EGP/USD → 245000 EGP minor (2450.00 EGP).
    expect(estimateMinor(5000, 49)).toBe(245000);
  });
  it("rounds to the nearest minor unit", () => {
    expect(estimateMinor(101, 49.005)).toBe(4950); // 101 * 49.005 = 4949.505 → 4950
  });
  it("returns zero for a zero amount", () => {
    expect(estimateMinor(0, 49)).toBe(0);
  });
});
