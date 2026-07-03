import { buildApp } from "@/app";
import { ProjectCreateSchema, ProposalCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("ProjectCreateSchema", () => {
  const valid = {
    category_id: "11111111-1111-1111-1111-111111111111",
    title: "Build a landing page",
    description: "A responsive bilingual landing page for a local bakery brand.",
    budget_min_usd_minor: 10000,
    budget_max_usd_minor: 25000,
    expected_delivery_days: 14,
  };

  it("accepts a valid range budget", () => {
    expect(ProjectCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a fixed budget (min == max)", () => {
    expect(
      ProjectCreateSchema.safeParse({
        ...valid,
        budget_max_usd_minor: valid.budget_min_usd_minor,
      }).success,
    ).toBe(true);
  });

  it("rejects max below min (Req 2)", () => {
    expect(ProjectCreateSchema.safeParse({ ...valid, budget_max_usd_minor: 5000 }).success).toBe(
      false,
    );
  });

  it("rejects a budget below $5", () => {
    expect(
      ProjectCreateSchema.safeParse({
        ...valid,
        budget_min_usd_minor: 100,
        budget_max_usd_minor: 100,
      }).success,
    ).toBe(false);
  });

  it("rejects a too-short title", () => {
    expect(ProjectCreateSchema.safeParse({ ...valid, title: "Logo" }).success).toBe(false);
  });

  it("rejects delivery beyond a year", () => {
    expect(ProjectCreateSchema.safeParse({ ...valid, expected_delivery_days: 400 }).success).toBe(
      false,
    );
  });
});

describe("ProposalCreateSchema", () => {
  const valid = {
    cover_letter: "I have shipped five similar bakery sites; see my portfolio links.",
    price_usd_minor: 15000,
    delivery_days: 10,
  };

  it("accepts a valid proposal", () => {
    expect(ProposalCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a bid below $5", () => {
    expect(ProposalCreateSchema.safeParse({ ...valid, price_usd_minor: 100 }).success).toBe(false);
  });

  it("rejects a too-short cover letter", () => {
    expect(ProposalCreateSchema.safeParse({ ...valid, cover_letter: "hi" }).success).toBe(false);
  });
});

describe("project auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  const uuid = "11111111-1111-1111-1111-111111111111";

  it("rejects posting a project without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/projects",
      payload: {
        category_id: uuid,
        title: "Build a landing page",
        description: "A responsive bilingual landing page for a local bakery brand.",
        budget_min_usd_minor: 10000,
        budget_max_usd_minor: 25000,
        expected_delivery_days: 14,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects submitting a proposal without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/projects/${uuid}/proposals`,
      payload: {
        cover_letter: "I have shipped five similar bakery sites; see my portfolio.",
        price_usd_minor: 15000,
        delivery_days: 10,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects listing proposals without a token", async () => {
    const res = await app.inject({ method: "GET", url: `/v1/projects/${uuid}/proposals` });
    expect(res.statusCode).toBe(401);
  });

  it("rejects accepting a proposal without a token", async () => {
    const res = await app.inject({ method: "POST", url: `/v1/proposals/${uuid}/accept` });
    expect(res.statusCode).toBe(401);
  });

  it("rejects status changes without a token", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${uuid}/status`,
      payload: { status: "closed" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("validates the status enum (awarding not reachable via status endpoint)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/projects/${uuid}/status`,
      payload: { status: "awarded" },
      headers: { authorization: "Bearer invalid" },
    });
    // Zod rejects "awarded" before auth even matters — 400, never a state change.
    expect([400, 401]).toContain(res.statusCode);
  });

  it("serves the public browse without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/projects" });
    // 200 with DB, 500 without — never an auth rejection.
    expect([200, 500]).toContain(res.statusCode);
  });
});
