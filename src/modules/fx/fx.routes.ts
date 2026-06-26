import { ApiErrorSchema, CurrencySchema, FxRateSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { getLatestRate } from "./fx.service";

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
}
