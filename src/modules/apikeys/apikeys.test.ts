import { buildApp } from "@/app";
import { hashApiKey } from "@/core/auth";
import { ApiKeyCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("hashApiKey", () => {
  it("is deterministic and hides the plaintext", () => {
    const h = hashApiKey("nw_secret");
    expect(h).toBe(hashApiKey("nw_secret"));
    expect(h).not.toContain("secret");
    expect(h).toHaveLength(64);
  });
});

describe("ApiKeyCreateSchema", () => {
  it("requires a name", () => {
    expect(ApiKeyCreateSchema.safeParse({}).success).toBe(false);
    expect(ApiKeyCreateSchema.safeParse({ name: "CI bot" }).success).toBe(true);
  });
});

describe("api-keys auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects listing keys without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/api-keys" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects a bogus X-API-Key", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/me/api-keys",
      headers: { "x-api-key": "nw_not_a_real_key" },
    });
    expect(res.statusCode).toBe(401);
  });
});
