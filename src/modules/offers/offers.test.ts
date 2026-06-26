import { buildApp } from "@/app";
import { OfferCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("OfferCreateSchema", () => {
  it("rejects a price below $5", () => {
    const res = OfferCreateSchema.safeParse({
      title: "Logo design",
      description: "A clean modern logo with two revisions.",
      price_usd_minor: 100,
      delivery_days: 3,
    });
    expect(res.success).toBe(false);
  });
  it("rejects an expiry beyond 30 days", () => {
    const res = OfferCreateSchema.safeParse({
      title: "Logo design",
      description: "A clean modern logo with two revisions.",
      price_usd_minor: 5000,
      delivery_days: 3,
      expires_in_days: 60,
    });
    expect(res.success).toBe(false);
  });
  it("accepts a valid offer", () => {
    const res = OfferCreateSchema.safeParse({
      title: "Logo design",
      description: "A clean modern logo with two revisions.",
      price_usd_minor: 5000,
      delivery_days: 3,
    });
    expect(res.success).toBe(true);
  });
});

describe("offer auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects sending an offer without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/11111111-1111-1111-1111-111111111111/offers",
      payload: {
        title: "Logo design",
        description: "A clean modern logo with two revisions.",
        price_usd_minor: 5000,
        delivery_days: 3,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects accepting an offer without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/offers/11111111-1111-1111-1111-111111111111/accept",
    });
    expect(res.statusCode).toBe(401);
  });
});
