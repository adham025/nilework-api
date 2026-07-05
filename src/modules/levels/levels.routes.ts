import { ClientLevelSchema, FreelancerLevelSchema, IdParamSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { computeClientLevel, computeFreelancerLevel } from "./levels.service";

/** Public Pro Path level — shown on profiles/gigs as the trust+status headline (§5.3). */
export async function levelRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/profiles/:id/level",
    {
      schema: {
        tags: ["levels"],
        summary: "Freelancer Pro Path level + progress",
        params: IdParamSchema,
        response: { 200: FreelancerLevelSchema },
      },
    },
    async (req) => computeFreelancerLevel(req.params.id),
  );

  r.get(
    "/profiles/:id/client-level",
    {
      schema: {
        tags: ["levels"],
        summary: "Client loyalty tier + spend progress",
        params: IdParamSchema,
        response: { 200: ClientLevelSchema },
      },
    },
    async (req) => computeClientLevel(req.params.id),
  );
}
