import { buildApp } from "@/app";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { egpChargeMinor } from "./payments.service";
import { computePaymobHmac, verifyPaymobHmac } from "./paymob.hmac";

const SECRET = "test_hmac_secret";

// A minimal but representative Paymob transaction object.
const txn = {
  amount_cents: 245000,
  created_at: "2026-06-26T10:00:00",
  currency: "EGP",
  error_occured: false,
  has_parent_transaction: false,
  id: 123456,
  integration_id: 99999,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 7777 },
  owner: 42,
  pending: false,
  source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
  success: true,
};

describe("paymob HMAC", () => {
  it("verifies an HMAC produced for the exact transaction", () => {
    const hmac = computePaymobHmac(txn, SECRET);
    expect(verifyPaymobHmac(txn, SECRET, hmac)).toBe(true);
  });
  it("rejects a tampered amount (signature no longer matches)", () => {
    const hmac = computePaymobHmac(txn, SECRET);
    expect(verifyPaymobHmac({ ...txn, amount_cents: 1 }, SECRET, hmac)).toBe(false);
  });
  it("rejects a flipped success flag (the field that matters most)", () => {
    const hmac = computePaymobHmac({ ...txn, success: false }, SECRET);
    expect(verifyPaymobHmac(txn, SECRET, hmac)).toBe(false);
  });
  it("rejects a wrong secret", () => {
    const hmac = computePaymobHmac(txn, SECRET);
    expect(verifyPaymobHmac(txn, "other_secret", hmac)).toBe(false);
  });
  it("rejects an empty hmac", () => {
    expect(verifyPaymobHmac(txn, SECRET, "")).toBe(false);
  });
});

describe("egpChargeMinor", () => {
  it("converts USD minor to EGP piasters at the rate", () => {
    // $50.00 (5000) at 49.00 → 245000 piasters (2450.00 EGP).
    expect(egpChargeMinor(5000, 49)).toBe(245000);
  });
});

describe("payments routes", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects checkout without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/orders/11111111-1111-1111-1111-111111111111/checkout",
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a webhook with no hmac query param", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/paymob/webhook",
      payload: { obj: { id: 1, order: { id: 2 } } },
    });
    expect(res.statusCode).toBe(400);
  });
});
