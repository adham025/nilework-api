import { buildApp } from "@/app";
import { AgencyAddMemberSchema, AgencyCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("agency schemas", () => {
  it("requires a name of at least 2 chars", () => {
    expect(AgencyCreateSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(AgencyCreateSchema.safeParse({ name: "Nile Studio" }).success).toBe(true);
  });
  it("requires a referral code to add a member", () => {
    expect(AgencyAddMemberSchema.safeParse({ code: "ab" }).success).toBe(false);
    expect(AgencyAddMemberSchema.safeParse({ code: "ABCD1234" }).success).toBe(true);
  });
});

describe("agency auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects reading my agency without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/agency" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects creating an agency without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/agency",
      payload: { name: "Nile Studio" },
    });
    expect(res.statusCode).toBe(401);
  });
});
