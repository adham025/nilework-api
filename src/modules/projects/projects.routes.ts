import { requireAuth } from "@/core/auth";
import { runDomain } from "@/core/errors";
import {
  IdParamSchema,
  ProjectCreateSchema,
  ProjectListItemSchema,
  ProjectListQuerySchema,
  ProjectListResponseSchema,
  ProjectSchema,
  ProjectStatusUpdateSchema,
  ProposalCreateSchema,
  ProposalListSchema,
  ProposalSchema,
} from "@nilework/schemas";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  acceptProposal,
  createProject,
  getProject,
  listMyProjects,
  listMyProposals,
  listProjects,
  listProposals,
  reviewProposal,
  submitProposal,
  updateProjectStatus,
  withdrawProposal,
} from "./projects.service";

const STATUS_BY_CODE = { not_found: 404, forbidden: 403, conflict: 409, invalid: 400 } as const;

function run<T>(reply: FastifyReply, fn: () => Promise<T>): Promise<T | undefined> {
  return runDomain(reply, STATUS_BY_CODE, fn);
}

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Public browse of open projects.
  r.get(
    "/projects",
    {
      schema: {
        tags: ["projects"],
        summary: "Browse open projects (cursor-paginated, keyword + budget filters)",
        querystring: ProjectListQuerySchema,
        response: { 200: ProjectListResponseSchema },
      },
    },
    async (req) => listProjects(req.query),
  );

  // Client's own projects. Must precede /projects/:id.
  r.get(
    "/projects/mine",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "List the caller's posted projects",
        response: { 200: z.array(ProjectSchema) },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listMyProjects(req.authUser!.id),
  );

  // Freelancer's proposals across projects. Must precede /projects/:id.
  r.get(
    "/projects/proposals/mine",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "List the caller's submitted proposals",
        response: { 200: z.array(ProposalSchema) },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req) => listMyProposals(req.authUser!.id),
  );

  // Public project detail (owner also sees closed/cancelled).
  r.get(
    "/projects/:id",
    {
      schema: {
        tags: ["projects"],
        summary: "Get a project by id",
        params: IdParamSchema,
        response: { 200: ProjectListItemSchema },
      },
    },
    async (req, reply) => run(reply, () => getProject(req.params.id, undefined)),
  );

  // Post a project.
  r.post(
    "/projects",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "Post a new project",
        body: ProjectCreateSchema,
        response: { 201: ProjectSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const project = await run(reply, () => createProject(req.authUser!.id, req.body));
      if (project) reply.code(201);
      return project;
    },
  );

  // Client-driven status moves (open/in_review/closed/cancelled).
  r.patch(
    "/projects/:id/status",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "Update project status (owner only; awarding happens via acceptance)",
        params: IdParamSchema,
        body: ProjectStatusUpdateSchema,
        response: { 200: ProjectSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => updateProjectStatus(req.params.id, userId, req.body));
    },
  );

  // Submit a proposal.
  r.post(
    "/projects/:id/proposals",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "Submit a proposal on an open project",
        params: IdParamSchema,
        body: ProposalCreateSchema,
        response: { 201: ProposalSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      const proposal = await run(reply, () => submitProposal(req.params.id, userId, req.body));
      if (proposal) reply.code(201);
      return proposal;
    },
  );

  // Client lists proposals on their project.
  r.get(
    "/projects/:id/proposals",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "List proposals on a project (owner only)",
        params: IdParamSchema,
        response: { 200: ProposalListSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => listProposals(req.params.id, req.authUser!.id)),
  );

  // Freelancer withdraws their proposal.
  r.post(
    "/proposals/:id/withdraw",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "Withdraw a pending/shortlisted proposal (author only)",
        params: IdParamSchema,
        response: { 200: ProposalSchema },
      },
    },
    // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
    async (req, reply) => run(reply, () => withdrawProposal(req.params.id, req.authUser!.id)),
  );

  // Client shortlists / declines.
  r.post(
    "/proposals/:id/shortlist",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "Shortlist a proposal (project owner only)",
        params: IdParamSchema,
        response: { 200: ProposalSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => reviewProposal(req.params.id, userId, "shortlisted"));
    },
  );

  r.post(
    "/proposals/:id/decline",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "Decline a proposal (project owner only)",
        params: IdParamSchema,
        response: { 200: ProposalSchema },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
      const userId = req.authUser!.id;
      return run(reply, () => reviewProposal(req.params.id, userId, "declined"));
    },
  );

  // Client accepts → escrow order created atomically; project awarded.
  r.post(
    "/proposals/:id/accept",
    {
      preHandler: requireAuth,
      schema: {
        tags: ["projects"],
        summary: "Accept a proposal: creates the escrow order and awards the project",
        params: IdParamSchema,
        response: { 200: z.object({ proposal: ProposalSchema, order_id: z.string().uuid() }) },
      },
    },
    async (req, reply) =>
      run(reply, async () => {
        // biome-ignore lint/style/noNonNullAssertion: requireAuth guarantees authUser.
        const result = await acceptProposal(req.params.id, req.authUser!.id);
        return { proposal: result.proposal, order_id: result.orderId };
      }),
  );
}
