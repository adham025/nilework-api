import { buildApp } from "@/app";
import { DisputeOpenSchema, DisputeResolveSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("DisputeOpenSchema", () => {
  it("requires a reason of at least 10 chars", () => {
    expect(DisputeOpenSchema.safeParse({ reason: "bad" }).success).toBe(false);
    expect(DisputeOpenSchema.safeParse({ reason: "The delivery was incomplete." }).success).toBe(
      true,
    );
  });
});

describe("DisputeResolveSchema", () => {
  it("only allows release or refund", () => {
    expect(DisputeResolveSchema.safeParse({ resolution: "cancel", note: "x" }).success).toBe(false);
    expect(
      DisputeResolveSchema.safeParse({ resolution: "refund", note: "Client was right" }).success,
    ).toBe(true);
  });
});

describe("dispute auth + staff guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects opening a dispute without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/orders/11111111-1111-1111-1111-111111111111/dispute",
      payload: { reason: "The delivery was incomplete." },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects the staff dispute queue without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/disputes" });
    expect(res.statusCode).toBe(401);
  });
});
