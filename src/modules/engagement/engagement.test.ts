import { buildApp } from "@/app";
import { LeaderboardSchema, StreakSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("engagement schemas", () => {
  it("accepts a streak shape", () => {
    expect(
      StreakSchema.safeParse({ current_streak: 3, longest_streak: 5, last_active_date: null })
        .success,
    ).toBe(true);
  });
  it("accepts a leaderboard shape", () => {
    expect(
      LeaderboardSchema.safeParse({
        period: "month",
        entries: [
          {
            rank: 1,
            profile_id: crypto.randomUUID(),
            display_name: "A",
            avatar_url: null,
            points: 9,
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("engagement auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects reading my streak without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/streak" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects pinging without a token", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/me/streak/ping" });
    expect(res.statusCode).toBe(401);
  });
});
