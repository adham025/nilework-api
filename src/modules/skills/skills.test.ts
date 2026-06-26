import { buildApp } from "@/app";
import { SkillSubmitSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("SkillSubmitSchema", () => {
  it("requires at least one answer", () => {
    expect(SkillSubmitSchema.safeParse({ answers: [] }).success).toBe(false);
    expect(SkillSubmitSchema.safeParse({ answers: [0, 1, 2] }).success).toBe(true);
  });
  it("rejects negative answer indices", () => {
    expect(SkillSubmitSchema.safeParse({ answers: [-1] }).success).toBe(false);
  });
});

describe("skills auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects listing tests without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/skill-tests" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects submitting without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/skill-tests/web-fundamentals/submit",
      payload: { answers: [0, 0, 1, 1] },
    });
    expect(res.statusCode).toBe(401);
  });
});
