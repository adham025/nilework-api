import { buildApp } from "@/app";
import { ReviewCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("ReviewCreateSchema", () => {
  it("rejects a rating outside 1–5", () => {
    expect(ReviewCreateSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(ReviewCreateSchema.safeParse({ rating: 6 }).success).toBe(false);
  });
  it("accepts a valid rating with an optional comment", () => {
    expect(ReviewCreateSchema.safeParse({ rating: 5 }).success).toBe(true);
    expect(ReviewCreateSchema.safeParse({ rating: 4, comment: "Great work" }).success).toBe(true);
  });
});

describe("review auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects leaving a review without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/orders/11111111-1111-1111-1111-111111111111/review",
      payload: { rating: 5 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects listing order reviews without a token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/orders/11111111-1111-1111-1111-111111111111/reviews",
    });
    expect(res.statusCode).toBe(401);
  });
});
