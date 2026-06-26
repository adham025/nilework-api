import { buildApp } from "@/app";
import { MilestoneCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("MilestoneCreateSchema", () => {
  it("requires at least 2 milestones", () => {
    expect(
      MilestoneCreateSchema.safeParse({
        milestones: [{ title: "Only one", amount_usd_minor: 5000 }],
      }).success,
    ).toBe(false);
  });
  it("accepts a valid set", () => {
    expect(
      MilestoneCreateSchema.safeParse({
        milestones: [
          { title: "Design", amount_usd_minor: 3000 },
          { title: "Build", amount_usd_minor: 6000 },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("milestone auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects defining milestones without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/orders/11111111-1111-1111-1111-111111111111/milestones",
      payload: {
        milestones: [
          { title: "Design", amount_usd_minor: 3000 },
          { title: "Build", amount_usd_minor: 6000 },
        ],
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects releasing a milestone without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/orders/11111111-1111-1111-1111-111111111111/milestones/22222222-2222-2222-2222-222222222222/release",
    });
    expect(res.statusCode).toBe(401);
  });
});
