import { buildApp } from "@/app";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("admin auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects /admin/me without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects /admin/financial/summary without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/financial/summary" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects /admin/financial/summary with a garbage token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/financial/summary",
      headers: { authorization: "Bearer not-a-real-jwt" },
    });
    expect(res.statusCode).toBe(401);
  });
});
