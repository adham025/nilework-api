import { buildApp } from "@/app";
import { ConversationStartSchema, MessageCreateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("ConversationStartSchema", () => {
  it("requires a uuid freelancer_id", () => {
    expect(ConversationStartSchema.safeParse({ freelancer_id: "nope" }).success).toBe(false);
    expect(
      ConversationStartSchema.safeParse({
        freelancer_id: "11111111-1111-1111-1111-111111111111",
      }).success,
    ).toBe(true);
  });
});

describe("MessageCreateSchema", () => {
  it("rejects an empty body", () => {
    expect(MessageCreateSchema.safeParse({ body: "" }).success).toBe(false);
  });
  it("accepts a normal message", () => {
    expect(MessageCreateSchema.safeParse({ body: "Hello, are you available?" }).success).toBe(true);
  });
});

describe("messaging auth guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects POST /v1/conversations without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      payload: { freelancer_id: "11111111-1111-1111-1111-111111111111" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects GET /v1/conversations without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects sending a message without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/11111111-1111-1111-1111-111111111111/messages",
      payload: { body: "hi" },
    });
    expect(res.statusCode).toBe(401);
  });
});
