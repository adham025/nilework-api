import { requireAuth } from "@/core/auth";
import { runDomain } from "@/core/errors";
import {
  ApiErrorSchema,
  MilestoneCreateSchema,
  MilestoneListSchema,
  MilestoneSchema,
  IdParamSchema as OrderParam,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createMilestones,
  deliverMilestone,
  listMilestones,
  releaseMilestone,
} from "./milestones.service";

const STATUS_BY_CODE = {
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  unprocessable: 422,
} as const;

function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  return runDomain(reply, STATUS_BY_CODE, fn);
}

const MilestoneParam = z.object({ id: z.string().uuid(), mid: z.string().uuid() });

export async function milestoneRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/orders/:id/milestones",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["milestones"],
        summary: "List an order's milestones (party only)",
        params: OrderParam,
        response: {
          200: MilestoneListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => listMilestones(req.params.id, userId));
    },
  );

  r.post(
    "/orders/:id/milestones",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["milestones"],
        summary: "Define milestones on a funded order (client)",
        params: OrderParam,
        body: MilestoneCreateSchema,
        response: {
          201: MilestoneListSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
          422: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      const list = await run(reply, () => createMilestones(req.params.id, userId, req.body));
      if (list) return reply.code(201).send(list);
    },
  );

  r.post(
    "/orders/:id/milestones/:mid/deliver",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["milestones"],
        summary: "Mark a milestone delivered (freelancer)",
        params: MilestoneParam,
        response: {
          200: MilestoneSchema,
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
      return run(reply, () => deliverMilestone(req.params.id, req.params.mid, userId));
    },
  );

  r.post(
    "/orders/:id/milestones/:mid/release",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["milestones"],
        summary: "Release a delivered milestone (client)",
        params: MilestoneParam,
        response: {
          200: MilestoneSchema,
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
      return run(reply, () => releaseMilestone(req.params.id, req.params.mid, userId));
    },
  );
}
