import { requireStaff } from "@/core/auth";
import { ApiErrorSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { listRiskSignals } from "./trust.service";

const RiskSignalSchema = z.object({
  id: z.string().uuid(),
  profile_id: z.string().uuid(),
  display_name: z.string().nullable(),
  kind: z.string(),
  severity: z.string(),
  source_type: z.string(),
  source_id: z.string().uuid().nullable(),
  detail: z.object({ pattern: z.string().optional(), excerpt: z.string().optional() }),
  created_at: z.string(),
});

/** Staff-only risk review queue (Phase 4 fraud signals). */
export async function trustRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/admin/risk",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Recent automated risk signals (staff review queue)",
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }),
        response: { 200: z.array(RiskSignalSchema), 401: ApiErrorSchema, 403: ApiErrorSchema },
      },
    },
    async (req) => listRiskSignals(req.query.limit),
  );
}
