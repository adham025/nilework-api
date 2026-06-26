import { buildApp } from "@/app";
import { PayoutCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { payoutAmountError } from "./payouts.service";

describe("payoutAmountError", () => {
  const min = 1000; // $10
  it("flags an amount below the minimum", () => {
    expect(payoutAmountError(500, 100000, min)).toBe("below_min");
  });
  it("flags an amount over the available balance", () => {
    expect(payoutAmountError(5000, 3000, min)).toBe("insufficient");
  });
  it("accepts a valid amount within balance and at/above min", () => {
    expect(payoutAmountError(1000, 1000, min)).toBeNull();
    expect(payoutAmountError(2500, 9000, min)).toBeNull();
  });
});

describe("PayoutCreateSchema", () => {
  it("rejects a non-positive amount", () => {
    const res = PayoutCreateSchema.safeParse({
      amount_usd_minor: 0,
      destination_type: "instapay",
      destination_details: "user@instapay",
    });
    expect(res.success).toBe(false);
  });
  it("rejects an unknown destination type", () => {
    const res = PayoutCreateSchema.safeParse({
      amount_usd_minor: 5000,
      destination_type: "paypal",
      destination_details: "x@y.com",
    });
    expect(res.success).toBe(false);
  });
  it("accepts a valid Vodafone Cash payout", () => {
    const res = PayoutCreateSchema.safeParse({
      amount_usd_minor: 5000,
      destination_type: "vodafone_cash",
      destination_details: "01000000000",
    });
    expect(res.success).toBe(true);
  });
});

describe("payout auth + staff guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects POST /v1/me/payouts without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/me/payouts",
      payload: {
        amount_usd_minor: 5000,
        destination_type: "instapay",
        destination_details: "user@instapay",
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects GET /v1/me/payouts without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/payouts" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects the staff payouts queue without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/payouts" });
    expect(res.statusCode).toBe(401);
  });
});
