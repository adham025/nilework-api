import { buildApp } from "@/app";
import { RedeemSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("RedeemSchema", () => {
  it("requires a catalog_key", () => {
    expect(RedeemSchema.safeParse({}).success).toBe(false);
    expect(RedeemSchema.safeParse({ catalog_key: "featured_gig" }).success).toBe(true);
  });
  it("rejects a non-uuid gig_id", () => {
    expect(RedeemSchema.safeParse({ catalog_key: "featured_gig", gig_id: "x" }).success).toBe(
      false,
    );
  });
});

describe("redemptions auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects the catalog without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/rewards/catalog" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects redeeming without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/me/redeem",
      payload: { catalog_key: "featured_gig" },
    });
    expect(res.statusCode).toBe(401);
  });
});
