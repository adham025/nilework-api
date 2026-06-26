import { buildApp } from "@/app";
import { HourlyContractCreateSchema, TimeLogCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("HourlyContractCreateSchema", () => {
  it("requires a rate of at least $1/hr", () => {
    const base = {
      freelancer_id: "11111111-1111-1111-1111-111111111111",
      title: "Build me an app",
    };
    expect(
      HourlyContractCreateSchema.safeParse({ ...base, hourly_rate_usd_minor: 50 }).success,
    ).toBe(false);
    expect(
      HourlyContractCreateSchema.safeParse({ ...base, hourly_rate_usd_minor: 2500 }).success,
    ).toBe(true);
  });
});

describe("TimeLogCreateSchema", () => {
  it("bounds minutes to 1..1440", () => {
    expect(TimeLogCreateSchema.safeParse({ minutes: 0, description: "work" }).success).toBe(false);
    expect(TimeLogCreateSchema.safeParse({ minutes: 1500, description: "work" }).success).toBe(
      false,
    );
    expect(
      TimeLogCreateSchema.safeParse({ minutes: 90, description: "Built the API" }).success,
    ).toBe(true);
  });
});

describe("hourly auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects creating a contract without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/contracts",
      payload: {
        freelancer_id: "11111111-1111-1111-1111-111111111111",
        title: "Build me an app",
        hourly_rate_usd_minor: 2500,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects billing without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/contracts/11111111-1111-1111-1111-111111111111/bill",
    });
    expect(res.statusCode).toBe(401);
  });
});
