import { buildApp } from "@/app";
import { GigCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { slugify } from "./gigs.service";

describe("slugify", () => {
  it("makes an ascii slug from a Latin title", () => {
    expect(slugify("  Logo & Brand Design!! ")).toBe("logo-brand-design");
  });
  it("falls back to 'gig' for a non-Latin (Arabic) title", () => {
    expect(slugify("تصميم شعار")).toBe("gig");
  });
});

describe("GigCreateSchema", () => {
  it("rejects a price below $5", () => {
    const res = GigCreateSchema.safeParse({
      category_id: "11111111-1111-1111-1111-111111111111",
      title: "Professional logo design",
      description: "I will design a clean, modern logo for your brand with revisions.",
      price_usd_minor: 100,
      delivery_days: 3,
    });
    expect(res.success).toBe(false);
  });
  it("accepts a valid gig", () => {
    const res = GigCreateSchema.safeParse({
      category_id: "11111111-1111-1111-1111-111111111111",
      title: "Professional logo design",
      description: "I will design a clean, modern logo for your brand with revisions.",
      price_usd_minor: 5000,
      delivery_days: 3,
    });
    expect(res.success).toBe(true);
  });
});

describe("gig auth guard", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects POST /v1/gigs without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/gigs",
      payload: {
        category_id: "11111111-1111-1111-1111-111111111111",
        title: "Professional logo design",
        description: "I will design a clean, modern logo for your brand with revisions.",
        price_usd_minor: 5000,
        delivery_days: 3,
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
