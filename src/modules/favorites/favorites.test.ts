import { buildApp } from "@/app";
import { FavoriteCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("FavoriteCreateSchema", () => {
  it("requires a uuid gig_id", () => {
    expect(FavoriteCreateSchema.safeParse({ gig_id: "nope" }).success).toBe(false);
    expect(
      FavoriteCreateSchema.safeParse({ gig_id: "11111111-1111-1111-1111-111111111111" }).success,
    ).toBe(true);
  });
});

describe("favorites auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects listing favorites without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/favorites" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects saving a gig without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/me/favorites",
      payload: { gig_id: "11111111-1111-1111-1111-111111111111" },
    });
    expect(res.statusCode).toBe(401);
  });
});
