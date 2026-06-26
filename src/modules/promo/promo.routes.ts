import { requireAuth, requireStaff } from "@/core/auth";
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
import { PromoError, createPromo, listPromos, redeemPoints, validatePromo } from "./promo.service";

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
    async (req, reply) => {
      try {
        // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
        return await redeemPoints(req.authUser!.id, req.body.code);
      } catch (err) {
        if (err instanceof PromoError) {
          return reply.code(409).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
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
