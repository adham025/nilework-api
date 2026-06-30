import { buildApp } from "@/app";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { kashierAmountMajor, kashierOrderHash } from "./kashier.client";
import { computeKashierSignature, verifyKashierSignature } from "./kashier.hmac";

describe("kashierAmountMajor", () => {
  it("converts EGP piasters to a 2-decimal major string", () => {
    expect(kashierAmountMajor(245000)).toBe("2450.00");
    expect(kashierAmountMajor(99)).toBe("0.99");
  });
});

describe("kashierOrderHash", () => {
  it("is deterministic for the same inputs", () => {
    const a = kashierOrderHash("order-1", "2450.00", "EGP", "MID-1", "key");
    const b = kashierOrderHash("order-1", "2450.00", "EGP", "MID-1", "key");
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // sha256 hex
  });
  it("changes when the amount changes", () => {
    const a = kashierOrderHash("order-1", "2450.00", "EGP", "MID-1", "key");
    const b = kashierOrderHash("order-1", "2451.00", "EGP", "MID-1", "key");
    expect(a).not.toBe(b);
  });
});

describe("kashier webhook signature", () => {
  const secret = "kashier_secret";
  // A callback signed over its own signatureKeys.
  const base = {
    signatureKeys: ["paymentStatus", "merchantOrderId", "orderId"],
    paymentStatus: "SUCCESS",
    merchantOrderId: "abc-123",
    orderId: "KASHIER-9",
  };
  const data = { ...base, signature: computeKashierSignature(base, secret) as string };

  it("verifies a correctly signed callback", () => {
    expect(verifyKashierSignature(data, secret)).toBe(true);
  });
  it("rejects a tampered status", () => {
    expect(verifyKashierSignature({ ...data, paymentStatus: "FAILED" }, secret)).toBe(false);
  });
  it("rejects a wrong secret", () => {
    expect(verifyKashierSignature(data, "other")).toBe(false);
  });
  it("rejects a missing signature", () => {
    expect(verifyKashierSignature(base, secret)).toBe(false);
  });
});

describe("kashier webhook route", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects an unsigned webhook (400 unconfigured, or 401 bad signature)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/kashier/webhook",
      payload: { data: { merchantOrderId: "x" } },
    });
    // 400 when Kashier isn't configured (CI), 401 when it is but the signature is
    // missing/invalid (local with real keys). Either way the webhook is rejected.
    expect([400, 401]).toContain(res.statusCode);
  });
});
