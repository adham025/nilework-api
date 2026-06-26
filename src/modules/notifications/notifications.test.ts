import { buildApp } from "@/app";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("notification auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects listing notifications without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/notifications" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects mark-all-read without a token", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/me/notifications/read-all" });
    expect(res.statusCode).toBe(401);
  });
});
