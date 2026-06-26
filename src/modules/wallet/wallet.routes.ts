import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  LedgerListResponseSchema,
  PaginationQuerySchema,
  WalletSchema,
} from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getWallet, listLedger } from "./wallet.service";

/** Authenticated wallet endpoints — balances + ledger history for the caller. */
export async function walletRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me/wallet",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wallet"],
        summary: "Get (or lazily create) the caller's wallet balances",
        response: { 200: WalletSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => getWallet(req.authUser!.id),
  );

  r.get(
    "/me/wallet/ledger",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["wallet"],
        summary: "List the caller's ledger entries (cursor-paginated, newest first)",
        querystring: PaginationQuerySchema,
        response: { 200: LedgerListResponseSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listLedger(req.authUser!.id, req.query),
  );
}
