import { requireAuth } from "@/core/auth";
import {
  AgencyAddMemberSchema,
  AgencyCreateSchema,
  AgencySchema,
  ApiErrorSchema,
  MyAgencySchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  AgencyError,
  addMember,
  createAgency,
  getMyAgency,
  leaveAgency,
  removeMember,
} from "./agencies.service";

const STATUS_BY_CODE = { not_found: 404, forbidden: 403, conflict: 409 } as const;
const OK = z.object({ ok: z.boolean() });

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AgencyError) {
      await reply.code(STATUS_BY_CODE[err.code]).send({
        error: { code: err.code, message: err.message },
      });
      return undefined;
    }
    throw err;
  }
}

export async function agencyRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/me/agency",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["agency"],
        summary: "The caller's agency + roster (or null)",
        response: { 200: MyAgencySchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => getMyAgency(req.authUser!.id),
  );

  r.post(
    "/agency",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["agency"],
        summary: "Create an agency (caller becomes owner)",
        body: AgencyCreateSchema,
        response: { 201: AgencySchema, 401: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const agency = await run(reply, () => createAgency(req.authUser!.id, req.body.name));
      if (agency) return reply.code(201).send(agency);
    },
  );

  r.post(
    "/agency/members",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["agency"],
        summary: "Add a member by referral code (owner)",
        body: AgencyAddMemberSchema,
        response: {
          200: OK,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const done = await run(reply, () => addMember(req.authUser!.id, req.body.code));
      if (done !== undefined) return { ok: true };
    },
  );

  r.delete(
    "/agency/members/:profileId",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["agency"],
        summary: "Remove a member (owner)",
        params: z.object({ profileId: z.string().uuid() }),
        response: { 200: OK, 401: ApiErrorSchema, 403: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const done = await run(reply, () => removeMember(req.authUser!.id, req.params.profileId));
      if (done !== undefined) return { ok: true };
    },
  );

  r.post(
    "/agency/leave",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["agency"],
        summary: "Leave your agency (members only)",
        response: { 200: OK, 401: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const done = await run(reply, () => leaveAgency(req.authUser!.id));
      if (done !== undefined) return { ok: true };
    },
  );
}
