import { buildApp } from "@/app";
import { LedgerEntrySchema, WalletSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("WalletSchema", () => {
  it("accepts a zero-balance wallet", () => {
    const res = WalletSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      profile_id: "22222222-2222-2222-2222-222222222222",
      balance_usd_minor: 0,
      pending_usd_minor: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(res.success).toBe(true);
  });
  it("rejects a negative balance", () => {
    const res = WalletSchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      profile_id: "22222222-2222-2222-2222-222222222222",
      balance_usd_minor: -100,
      pending_usd_minor: 0,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });
    expect(res.success).toBe(false);
  });
});

describe("LedgerEntrySchema", () => {
  it("allows a signed (negative) debit amount", () => {
    const res = LedgerEntrySchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      wallet_id: "22222222-2222-2222-2222-222222222222",
      profile_id: "33333333-3333-3333-3333-333333333333",
      entry_type: "escrow_release",
      bucket: "pending",
      amount_usd_minor: -5000,
      reference_type: "order",
      reference_id: "44444444-4444-4444-4444-444444444444",
      fx_rate_id: null,
      memo: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(res.success).toBe(true);
  });
  it("rejects an unknown entry_type", () => {
    const res = LedgerEntrySchema.safeParse({
      id: "11111111-1111-1111-1111-111111111111",
      wallet_id: "22222222-2222-2222-2222-222222222222",
      profile_id: "33333333-3333-3333-3333-333333333333",
      entry_type: "withdrawal",
      bucket: "available",
      amount_usd_minor: 100,
      reference_type: null,
      reference_id: null,
      fx_rate_id: null,
      memo: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(res.success).toBe(false);
  });
});

describe("wallet auth guard", () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it("rejects GET /v1/me/wallet without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/wallet" });
    expect(res.statusCode).toBe(401);
  });
  it("rejects GET /v1/me/wallet/ledger without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me/wallet/ledger" });
    expect(res.statusCode).toBe(401);
  });
});
