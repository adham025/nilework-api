import { buildApp } from "@/app";
import { SavedSearchCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("SavedSearchCreateSchema", () => {
  it("requires a label", () => {
    expect(SavedSearchCreateSchema.safeParse({ query: {} }).success).toBe(false);
    expect(SavedSearchCreateSchema.safeParse({ label: "Cheap design" }).success).toBe(true);
  });
  it("defaults query to an empty object", () => {
    const res = SavedSearchCreateSchema.safeParse({ label: "x" });
    expect(res.success && res.data.query).toEqual({});
  });
});

describe("saved-searches auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects listing without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/saved-searches" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects saving without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/me/saved-searches",
      payload: { label: "x", query: { category: "graphic-design" } },
    });
    expect(res.statusCode).toBe(401);
  });
});
