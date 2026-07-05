import { requireAuth, requireStaff } from "@/core/auth";
import { runDomain } from "@/core/errors";
import {
  ApiErrorSchema,
  PromoCodeListSchema,
  PromoCodeSchema,
  PromoCreateSchema,
  PromoRedeemResultSchema,
  PromoRedeemSchema,
  PromoValidationSchema,
} from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createPromo, listPromos, redeemPoints, validatePromo } from "./promo.service";

// Both PromoError codes map to 409 here — preserved from the original inline
// handler, which sent a flat 409 regardless of "not_found" vs "conflict".
const STATUS_BY_CODE = { not_found: 409, conflict: 409 } as const;

export async function promoRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Validate a code for the caller (checkout/redeem preview).
  r.get(
    "/promo/:code",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["promo"],
        summary: "Validate a promo code for the caller",
        params: z.object({ code: z.string().min(3).max(40) }),
        response: { 200: PromoValidationSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => validatePromo(req.params.code, req.authUser!.id),
  );

  // Redeem a points-type code.
  r.post(
    "/me/promo/redeem",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["promo"],
        summary: "Redeem a points promo code",
        body: PromoRedeemSchema,
        response: { 200: PromoRedeemResultSchema, 401: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    (req, reply) =>
      runDomain(reply, STATUS_BY_CODE, () =>
        // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
        redeemPoints(req.authUser!.id, req.body.code),
      ),
  );

  // --- staff ---------------------------------------------------------------

  r.post(
    "/admin/promo",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Create a promo code (staff)",
        body: PromoCreateSchema,
        response: { 201: PromoCodeSchema, 401: ApiErrorSchema, 403: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      const promo = await createPromo(req.body);
      return reply.code(201).send(promo);
    },
  );

  r.get(
    "/admin/promo",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "List promo codes (staff)",
        response: { 200: PromoCodeListSchema, 401: ApiErrorSchema, 403: ApiErrorSchema },
      },
    },
    async () => listPromos(),
  );
}
