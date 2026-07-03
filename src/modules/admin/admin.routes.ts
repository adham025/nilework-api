import { requireStaff } from "@/core/auth";
import { ApiErrorSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getFinancialSummary } from "./financial.service";

const FinancialSummarySchema = z.object({
  gmv_usd_minor: z.number().int().nonnegative(),
  gmv_order_count: z.number().int().nonnegative(),
  revenue_usd_minor: z.number().int().nonnegative(),
  released_order_count: z.number().int().nonnegative(),
  pending_escrow_usd_minor: z.number().int().nonnegative(),
  pending_escrow_order_count: z.number().int().nonnegative(),
  refunded_usd_minor: z.number().int().nonnegative(),
  refunded_order_count: z.number().int().nonnegative(),
  pending_payouts_usd_minor: z.number().int().nonnegative(),
  pending_payout_count: z.number().int().nonnegative(),
  paid_payouts_usd_minor: z.number().int().nonnegative(),
  paid_payout_count: z.number().int().nonnegative(),
  orders_by_status: z.record(z.number().int().nonnegative()),
  fx_rate: z.number().nullable(),
  fx_captured_at: z.string().nullable(),
});

/**
 * Admin endpoints — the web admin console calls these (staff-only, §6.2).
 * /admin/me gates the console; /admin/financial/summary is the finance
 * reconciliation view over the escrow engine.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/admin/me",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Get the caller's staff identity (gates the admin console)",
        response: {
          200: z.object({ id: z.string().uuid(), role: z.string() }),
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (req) => ({
      // biome-ignore lint/style/noNonNullAssertion: requireStaff guarantees staffUser.
      id: req.staffUser!.id,
      // biome-ignore lint/style/noNonNullAssertion: requireStaff guarantees staffUser.
      role: req.staffUser!.role,
    }),
  );

  r.get(
    "/admin/financial/summary",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Financial reconciliation: GMV, revenue, escrow liability, payouts (staff)",
        response: {
          200: FinancialSummarySchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async () => getFinancialSummary(),
  );
}
