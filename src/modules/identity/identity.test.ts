import { buildApp } from "@/app";
import { IdentitySubmitSchema, PhoneVerifySchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("PhoneVerifySchema", () => {
  it("requires a 6-digit code", () => {
    expect(PhoneVerifySchema.safeParse({ code: "123" }).success).toBe(false);
    expect(PhoneVerifySchema.safeParse({ code: "123456" }).success).toBe(true);
  });
});

describe("IdentitySubmitSchema", () => {
  it("requires name, id number, and a front document path", () => {
    expect(
      IdentitySubmitSchema.safeParse({ full_name: "A", national_id_number: "1", front_path: "" })
        .success,
    ).toBe(false);
    expect(
      IdentitySubmitSchema.safeParse({
        full_name: "Mona Salah",
        national_id_number: "29801011234567",
        front_path: "uid/front.jpg",
      }).success,
    ).toBe(true);
  });
});

describe("identity auth + staff guards", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects starting phone verification without a token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/me/phone/start",
      payload: { phone: "+201000000000" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects the staff identity queue without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/admin/identity" });
    expect(res.statusCode).toBe(401);
  });
});
