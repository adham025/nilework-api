import { buildApp } from "@/app";
import { ReferralApplySchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "./gamification.service";

describe("ACHIEVEMENTS catalog", () => {
  it("defines the Phase-1 milestone badges with positive point values", () => {
    for (const key of [
      "profile_complete",
      "first_gig",
      "first_order",
      "first_delivery",
      "first_review",
      "five_star",
    ]) {
      expect(ACHIEVEMENTS[key]?.points).toBeGreaterThan(0);
    }
  });
});

describe("ReferralApplySchema", () => {
  it("rejects a too-short code", () => {
    expect(ReferralApplySchema.safeParse({ code: "ab" }).success).toBe(false);
  });
  it("accepts a normal code", () => {
    expect(ReferralApplySchema.safeParse({ code: "ABCD1234" }).success).toBe(true);
  });
});

describe("gamification auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects GET /v1/me/rewards without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/rewards" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects POST /v1/me/referral without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/me/referral",
      payload: { code: "ABCD1234" },
    });
    expect(res.statusCode).toBe(401);
  });
});
