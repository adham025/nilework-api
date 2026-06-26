import { buildApp } from "@/app";
import { ReviewCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { weightedAverage } from "./reviews.service";

describe("weightedAverage (recency-weighted rating)", () => {
  const now = new Date("2026-06-01T00:00:00Z").getTime();
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

  it("returns null with no reviews", () => {
    expect(weightedAverage([], 180, now)).toBeNull();
  });
  it("equals the single rating", () => {
    expect(weightedAverage([{ rating: 4, created_at: daysAgo(10) }], 180, now)).toBe(4);
  });
  it("weights recent reviews more than old ones", () => {
    // A fresh 5★ should pull the score well above the flat average (3) of an old 1★.
    const score = weightedAverage(
      [
        { rating: 5, created_at: daysAgo(1) },
        { rating: 1, created_at: daysAgo(365) },
      ],
      180,
      now,
    );
    expect(score).not.toBeNull();
    expect(score as number).toBeGreaterThan(4);
  });
});

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
