import { requireAuth } from "@/core/auth";
import { runDomain } from "@/core/errors";
import {
  ApiErrorSchema,
  CatalogListSchema,
  RedeemResultSchema,
  RedeemSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { listCatalog, redeem } from "./redemptions.service";

const STATUS_BY_CODE = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  bad_request: 400,
} as const;

function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  return runDomain(reply, STATUS_BY_CODE, fn);
}

export async function redemptionRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/rewards/catalog",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gamification"],
        summary: "List redeemable rewards",
        response: { 200: CatalogListSchema, 401: ApiErrorSchema },
      },
    },
    async () => listCatalog(),
  );

  r.post(
    "/me/redeem",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["gamification"],
        summary: "Redeem a reward with points",
        body: RedeemSchema,
        response: {
          200: RedeemResultSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => redeem(userId, req.body.catalog_key, req.body.gig_id));
    },
  );
}
