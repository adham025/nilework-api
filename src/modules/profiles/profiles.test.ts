import { buildApp } from "@/app";
import { OnboardingSchema, ProfileUpdateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("profile auth guard", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects GET /v1/me without a bearer token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("unauthenticated");
  });

  it("rejects an invalid bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer not-a-real-jwt" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("profile schemas", () => {
  it("onboarding requires at least one role", () => {
    const bad = OnboardingSchema.safeParse({
      display_name: "Sara",
      locale: "ar",
      is_client: false,
      is_freelancer: false,
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a valid onboarding payload", () => {
    const ok = OnboardingSchema.safeParse({
      display_name: "Sara",
      locale: "ar",
      is_client: false,
      is_freelancer: true,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects an over-long country code in a profile update", () => {
    const res = ProfileUpdateSchema.safeParse({ country: "Egypt" });
    expect(res.success).toBe(false);
  });
});
