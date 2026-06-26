import { requireAuth } from "@/core/auth";
import {
  ApiErrorSchema,
  HourlyContractCreateSchema,
  HourlyContractDetailSchema,
  HourlyContractListSchema,
  HourlyContractSchema,
  OrderDetailSchema,
  TimeLogCreateSchema,
  TimeLogSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  HourlyError,
  approveLog,
  billContract,
  createContract,
  getContractDetail,
  listMyContracts,
  logTime,
} from "./hourly.service";

const STATUS_BY_CODE = { not_found: 404, forbidden: 403, conflict: 409 } as const;

async function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HourlyError) {
      await reply.code(STATUS_BY_CODE[err.code]).send({
        error: { code: err.code, message: err.message },
      });
      return undefined;
    }
    throw err;
  }
}

const IdParam = z.object({ id: z.string().uuid() });
const LogParam = z.object({ id: z.string().uuid(), logId: z.string().uuid() });

export async function hourlyRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/contracts",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["hourly"],
        summary: "Create an hourly contract (client)",
        body: HourlyContractCreateSchema,
        response: {
          201: HourlyContractSchema,
          401: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      const c = await run(reply, () => createContract(userId, req.body));
      if (c) return reply.code(201).send(c);
    },
  );

  r.get(
    "/me/contracts",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["hourly"],
        summary: "List the caller's hourly contracts",
        response: { 200: HourlyContractListSchema, 401: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listMyContracts(req.authUser!.id),
  );

  r.get(
    "/contracts/:id",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["hourly"],
        summary: "Get a contract + time logs (party only)",
        params: IdParam,
        response: { 200: HourlyContractDetailSchema, 401: ApiErrorSchema, 404: ApiErrorSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => getContractDetail(req.params.id, req.authUser!.id)),
  );

  r.post(
    "/contracts/:id/logs",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["hourly"],
        summary: "Log time on a contract (freelancer)",
        params: IdParam,
        body: TimeLogCreateSchema,
        response: {
          201: TimeLogSchema,
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
      const log = await run(reply, () =>
        logTime(req.params.id, userId, req.body.minutes, req.body.description),
      );
      if (log) return reply.code(201).send(log);
    },
  );

  r.post(
    "/contracts/:id/logs/:logId/approve",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["hourly"],
        summary: "Approve a time log (client)",
        params: LogParam,
        response: {
          200: TimeLogSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => approveLog(req.params.id, req.params.logId, userId));
    },
  );

  r.post(
    "/contracts/:id/bill",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["hourly"],
        summary: "Bill approved hours → create an order (client)",
        params: IdParam,
        response: {
          200: OrderDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          409: ApiErrorSchema,
        },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => billContract(req.params.id, req.authUser!.id)),
  );
}
