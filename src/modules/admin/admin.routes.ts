import { requireStaff } from "@/core/auth";
import { ApiErrorSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * Admin identity endpoint — the web admin console calls this to gate its routes
 * (staff-only). Returns the caller's staff role, or 403 if they aren't staff (§6.2).
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
}
