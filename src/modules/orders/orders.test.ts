import { buildApp } from "@/app";
import { OrderCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { splitCommission } from "./orders.service";

describe("splitCommission", () => {
  it("splits a round amount at 10% (1000 bps)", () => {
    expect(splitCommission(10000, 1000)).toEqual({ commission: 1000, net: 9000 });
  });
  it("floors commission so gross always equals commission + net", () => {
    const { commission, net } = splitCommission(999, 1000); // 99.9 → floor 99
    expect(commission).toBe(99);
    expect(net).toBe(900);
    expect(commission + net).toBe(999);
  });
  it("handles a zero commission rate", () => {
    expect(splitCommission(5000, 0)).toEqual({ commission: 0, net: 5000 });
  });
});

describe("OrderCreateSchema", () => {
  it("requires a uuid gig_id", () => {
    expect(OrderCreateSchema.safeParse({ gig_id: "not-a-uuid" }).success).toBe(false);
    expect(
      OrderCreateSchema.safeParse({ gig_id: "11111111-1111-1111-1111-111111111111" }).success,
    ).toBe(true);
  });
});

describe("order auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects POST /v1/orders without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/orders",
      payload: { gig_id: "11111111-1111-1111-1111-111111111111" },
    });
    expect(res.statusCode).toBe(401);
  });
  it("rejects GET /v1/me/orders without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/orders" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects POST /v1/orders/:id/release without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/orders/11111111-1111-1111-1111-111111111111/release",
    });
    expect(res.statusCode).toBe(401);
  });
});
