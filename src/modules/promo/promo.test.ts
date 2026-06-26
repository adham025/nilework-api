import { buildApp } from "@/app";
import { PromoCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeCode } from "./promo.service";

describe("normalizeCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeCode("  launch10 ")).toBe("LAUNCH10");
  });
});

describe("PromoCreateSchema", () => {
  it("rejects a non-positive value", () => {
    expect(
      PromoCreateSchema.safeParse({ code: "LAUNCH", type: "fee_waiver", value: 0 }).success,
    ).toBe(false);
  });
  it("accepts a fee_waiver code", () => {
    const res = PromoCreateSchema.safeParse({ code: "LAUNCH", type: "fee_waiver", value: 10000 });
    expect(res.success).toBe(true);
  });
});

describe("promo auth + staff guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects validating a code without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/promo/LAUNCH10" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects creating a promo without a staff token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/admin/promo",
      payload: { code: "LAUNCHX", type: "points", value: 100 },
    });
    expect(res.statusCode).toBe(401);
  });
  it("rejects admin/me without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/me" });
    expect(res.statusCode).toBe(401);
  });
});
