import { requireAuth, requireStaff } from "@/core/auth";
import { runDomain } from "@/core/errors";
import { auditLog } from "@/modules/admin/audit.service";
import { ApiErrorSchema, CheckoutResponseSchema, IdParamSchema } from "@nilework/schemas";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  PaymentError,
  handleKashierWebhook,
  handlePaymobWebhook,
  initiateCheckout,
  recordWebhook,
  refundPayment,
} from "./payments.service";

const ORDER_STATUS_BY_CODE = { not_found: 404, forbidden: 403, conflict: 409 } as const;
const PAYMENT_STATUS_BY_CODE = { unauthorized: 401, bad_request: 400, not_found: 404 } as const;

export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Start checkout for an order (client). Returns a gateway redirect or simulates.
  r.post(
    "/orders/:id/checkout",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["payments"],
        summary: "Begin payment for an order (client) — Paymob iframe or dev simulation",
        params: IdParamSchema,
        response: {
          200: CheckoutResponseSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    (req, reply) =>
      runDomain(reply, ORDER_STATUS_BY_CODE, () =>
        // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
        initiateCheckout(req.params.id, req.authUser!.id),
      ),
  );

  // Paymob "transaction processed" callback. Public, but HMAC-verified in the service.
  r.post(
    "/payments/paymob/webhook",
    {
      schema: {
        tags: ["payments"],
        summary: "Paymob payment webhook (HMAC-verified)",
        querystring: z.object({ hmac: z.string().optional() }),
        body: z.object({ obj: z.record(z.unknown()) }),
        response: {
          200: z.object({ received: z.boolean() }),
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    (req, reply) =>
      runDomain(reply, PAYMENT_STATUS_BY_CODE, async () => {
        await handlePaymobWebhook(req.body.obj, req.query.hmac ?? "");
        return { received: true };
      }),
  );

  // Kashier payment callback. Public, but signature-verified in the service.
  // Records the webhook attempt (verified/processed/error) even on failure —
  // that side effect has to happen inside the catch, so this route keeps its
  // own try/catch rather than the shared runDomain wrapper.
  r.post(
    "/payments/kashier/webhook",
    {
      schema: {
        tags: ["payments"],
        summary: "Kashier payment webhook (signature-verified)",
        body: z.record(z.unknown()),
        response: {
          200: z.object({ received: z.boolean() }),
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const data = (
        req.body.data && typeof req.body.data === "object" ? req.body.data : req.body
      ) as Record<string, unknown>;
      // Server webhooks sign via the x-kashier-signature header (confirmed on a
      // real sandbox callback); redirect payloads carry data.signature instead.
      const headerSig = req.headers["x-kashier-signature"];
      const headerSignature = typeof headerSig === "string" ? headerSig : undefined;
      const signature =
        headerSignature ?? (typeof data.signature === "string" ? data.signature : null);
      try {
        await handleKashierWebhook(req.body, headerSignature);
        await recordWebhook({
          provider: "kashier",
          paymentId: null,
          payload: req.body,
          signature,
          verified: true,
          processed: true,
        });
        return { received: true };
      } catch (err) {
        if (err instanceof PaymentError) {
          await recordWebhook({
            provider: "kashier",
            paymentId: null,
            payload: req.body,
            signature,
            verified: err.code !== "unauthorized",
            processed: false,
            error: err.message,
          });
          return reply
            .code(PAYMENT_STATUS_BY_CODE[err.code])
            .send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    },
  );

  // Staff refund: returns the client's money at the provider (Kashier launch
  // gateway; 'simulated' refunds locally for dev). Idempotent.
  r.post(
    "/admin/payments/:orderId/refund",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["payments"],
        summary: "Refund the captured payment on an order (staff only, idempotent)",
        params: z.object({ orderId: z.string().uuid() }),
        response: {
          200: z.object({
            payment_id: z.string().uuid(),
            order_id: z.string().uuid(),
            status: z.literal("refunded"),
            refund_ref: z.string().nullable(),
          }),
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    (req, reply) =>
      runDomain(reply, PAYMENT_STATUS_BY_CODE, async () => {
        const result = await refundPayment(req.params.orderId);
        // biome-ignore lint/style/noNonNullAssertion: requireStaff guarantees staffUser.
        await auditLog(req.staffUser!.id, "payment_refunded", "order", req.params.orderId, {
          payment_id: result.payment_id,
          refund_ref: result.refund_ref,
        });
        return result;
      }),
  );
}
