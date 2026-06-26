import { PublicConfigSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { getPublicConfig } from "./config.service";

/** Public platform config — fee/payout terms shown transparently to users (§1, §2). */
export async function configRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/config/public",
    {
      schema: {
        tags: ["config"],
        summary: "Public platform settings (commission, payout hold, min withdrawal)",
        response: { 200: PublicConfigSchema },
      },
    },
    async () => getPublicConfig(),
  );
}
