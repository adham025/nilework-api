import { requireAuth, requireStaff } from "@/core/auth";
import {
  ApiErrorSchema,
  IdRejectSchema,
  IdVerificationListSchema,
  IdVerificationSchema,
  IdentitySubmitSchema,
  PhoneStartResultSchema,
  PhoneStartSchema,
  PhoneVerifySchema,
  SignedUrlResponseSchema,
  VerificationStatusSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  IdentityError,
  getVerificationStatus,
  listPendingIdentity,
  reviewIdentity,
  signDocUrl,
  startPhoneVerification,
  submitIdentity,
  verifyPhone,
} from "./identity.service";

const STATUS_BY_CODE = {
  not_found: 404,
  conflict: 409,
  too_many: 429,
  invalid_national_id: 400,
} as const;

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof IdentityError) {
      await reply.code(STATUS_BY_CODE[err.code]).send({
        error: { code: err.code, message: err.message },
      });
      return undefined;
    }
    throw err;
  }
}

const IdParam = z.object({ id: z.string().uuid() });

export async function identityRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me/verification",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["identity"],
        summary: "Caller's phone + ID verification status",
        response: { 200: VerificationStatusSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => getVerificationStatus(req.authUser!.id),
  );

  r.post(
    "/me/phone/start",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["identity"],
        summary: "Send a phone verification code",
        body: PhoneStartSchema,
        response: { 200: PhoneStartResultSchema, 401: ApiErrorSchema, 429: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => startPhoneVerification(userId, req.body.phone));
    },
  );

  r.post(
    "/me/phone/verify",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["identity"],
        summary: "Verify the phone code",
        body: PhoneVerifySchema,
        response: {
          200: z.object({ ok: z.boolean() }),
          401: ApiErrorSchema,
          409: ApiErrorSchema,
          429: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const done = await run(reply, () => verifyPhone(req.authUser!.id, req.body.code));
      if (done !== undefined) return { ok: true };
    },
  );

  r.post(
    "/me/identity",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["identity"],
        summary: "Submit a national-ID verification",
        body: IdentitySubmitSchema,
        response: { 201: IdVerificationSchema, 401: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const v = await run(reply, () => submitIdentity(req.authUser!.id, req.body));
      if (v) return reply.code(201).send(v);
    },
  );

  // --- staff ---------------------------------------------------------------

  r.get(
    "/admin/identity",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Pending ID verifications (staff)",
        response: { 200: IdVerificationListSchema, 401: ApiErrorSchema, 403: ApiErrorSchema },
      },
    },
    async () => listPendingIdentity(),
  );

  r.get(
    "/admin/identity/:id/doc",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Signed URL for an ID document (staff)",
        params: IdParam,
        querystring: z.object({ which: z.enum(["front", "back"]).default("front") }),
        response: {
          200: SignedUrlResponseSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      const url = await run(reply, () => signDocUrl(req.params.id, req.query.which));
      if (url) return { url };
    },
  );

  r.post(
    "/admin/identity/:id/approve",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Approve an ID verification (staff)",
        params: IdParam,
        response: {
          200: IdVerificationSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireStaff guarantees staffUser.
      const staffId = req.staffUser!.id;
      return run(reply, () => reviewIdentity(req.params.id, staffId, true, null));
    },
  );

  r.post(
    "/admin/identity/:id/reject",
    {
      preHandler: requireStaff,
      schema: {
        tags: ["admin"],
        summary: "Reject an ID verification (staff)",
        params: IdParam,
        body: IdRejectSchema,
        response: {
          200: IdVerificationSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) =>
      // biome-ignore lint/style/noNonNullAssertion: requireStaff guarantees staffUser.
      run(reply, () => reviewIdentity(req.params.id, req.staffUser!.id, false, req.body.note)),
  );
}
