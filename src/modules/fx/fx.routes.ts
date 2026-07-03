import { requireStaff } from "@/core/auth";
import { auditLog } from "@/modules/admin/audit.service";
import { ApiErrorSchema, CurrencySchema, FxRateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getLatestRate, recordFxRate } from "./fx.service";

/** Public FX read — the web uses it to show EGP settlement/payout estimates (§6). */
export async function fxRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/fx/latest",
    {
      schema: {
        tags: ["fx"],
        summary: "Latest FX rate for a currency pair (defaults USD→EGP)",
        querystring: z.object({
          base: CurrencySchema.default("USD"),
          quote: CurrencySchema.default("EGP"),
        }),
        response: { 200: FxRateSchema, 404: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      const rate = await getLatestRate(req.query.base, req.query.quote);
      if (!rate) {
        return reply.code(404).send({ error: { code: "not_found", message: "No FX rate found" } });
      }
      return rate;
    },
  );

  // Manual rate override (fx-rate-system-phase1 Req 7): staff appends a
  // manual_override snapshot with a mandatory reason. The append-only history
  // means the override simply becomes the latest rate — no special serving
  // path, and the next scheduled fetch naturally supersedes it. Audited.
  r.post(
    "/admin/fx/override",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Manually override the USD→EGP rate (staff, audited, append-only)",
        body: z.object({
          rate: z.number().positive().finite(),
          reason: z.string().min(10).max(500),
        }),
        response: { 200: FxRateSchema, 401: ApiErrorSchema, 403: ApiErrorSchema },
      },
    },
    async (req) => {
      await recordFxRate(req.body.rate, "manual_override");
      // biome-ignore lint/style/noNonNullAssertion: requireStaff guarantees staffUser.
      await auditLog(req.staffUser!.id, "fx_override", "fx_rate", null, {
        rate: req.body.rate,
        reason: req.body.reason,
      });
      // biome-ignore lint/style/noNonNullAssertion: the row we just inserted exists.
      return (await getLatestRate("USD", "EGP"))!;
    },
  );
}
