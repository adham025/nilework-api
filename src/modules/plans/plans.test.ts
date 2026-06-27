import { buildApp } from "@/app";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("plans auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects reading my subscription without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/subscription" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects activating without a token", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/me/subscription/activate" });
    expect(res.statusCode).toBe(401);
  });
});
