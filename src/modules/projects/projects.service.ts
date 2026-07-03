import { getDb } from "@/core/db";
import { getPublicConfig } from "@/modules/config/config.service";
import { freelancerTier, tierCommissionBps } from "@/modules/levels/levels.service";
import { notify } from "@/modules/notifications/notifications.service";
import { insertOrder } from "@/modules/orders/orders.service";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type {
  Project,
  ProjectCreateInput,
  ProjectListItem,
  ProjectListQuery,
  ProjectListResponse,
  ProjectStatusUpdateInput,
  Proposal,
  ProposalCreateInput,
  ProposalListItem,
} from "@nilework/schemas";

/** Typed error so routes can map project/proposal failures to HTTP codes. */
export class ProjectError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "ProjectError";
  }
}

const PROJECT_COLUMNS = `
  id, client_id, category_id, title, description,
  budget_min_usd_minor, budget_max_usd_minor, expected_delivery_days,
  status, awarded_order_id, proposal_count, created_at, updated_at
`;

const PROPOSAL_COLUMNS = `
  id, project_id, freelancer_id, cover_letter, price_usd_minor,
  delivery_days, status, order_id, created_at, updated_at
`;

// --- projects ----------------------------------------------------------------

export async function createProject(clientId: string, input: ProjectCreateInput): Promise<Project> {
  await ensureProfile(clientId);
  const sql = getDb();

  const cat = await sql<{ id: string }[]>`
    select id from public.categories where id = ${input.category_id}
  `;
  if (!cat[0]) throw new ProjectError("invalid", "Unknown category");

  const rows = await sql<Project[]>`
    insert into public.projects
      (client_id, category_id, title, description,
       budget_min_usd_minor, budget_max_usd_minor, expected_delivery_days)
    values
      (${clientId}, ${input.category_id}, ${input.title}, ${input.description},
       ${input.budget_min_usd_minor}, ${input.budget_max_usd_minor},
       ${input.expected_delivery_days})
    returning ${sql.unsafe(PROJECT_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  return rows[0]!;
}

/** Public browse: open/in-review projects, newest first, cursor-paginated. */
export async function listProjects(query: ProjectListQuery): Promise<ProjectListResponse> {
  const sql = getDb();
  const limit = query.limit;
  // Keyword search: simple ILIKE over title+description (parity with gig browse;
  // FTS upgrade tracked under public-browse-search-phase1).
  const q = query.q?.trim() ? `%${query.q.trim()}%` : null;

  const rows = await sql<(ProjectListItem & { category_json: unknown; client_json: unknown })[]>`
    select
      p.id, p.client_id, p.category_id, p.title, p.description,
      p.budget_min_usd_minor, p.budget_max_usd_minor, p.expected_delivery_days,
      p.status, p.awarded_order_id, p.proposal_count, p.created_at, p.updated_at,
      json_build_object('id', c.id, 'slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar) as category,
      json_build_object('id', pr.id, 'display_name', pr.display_name, 'avatar_url', pr.avatar_url) as client
    from public.projects p
    join public.categories c on c.id = p.category_id
    join public.profiles pr on pr.id = p.client_id
    where p.status in ('open', 'in_review')
      ${query.category ? sql`and c.slug = ${query.category}` : sql``}
      ${q ? sql`and (p.title ilike ${q} or p.description ilike ${q})` : sql``}
      ${query.budget_min !== undefined ? sql`and p.budget_max_usd_minor >= ${query.budget_min}` : sql``}
      ${query.budget_max !== undefined ? sql`and p.budget_min_usd_minor <= ${query.budget_max}` : sql``}
      ${query.cursor ? sql`and p.created_at < ${query.cursor}` : sql``}
    order by p.created_at desc
    limit ${limit + 1}
  `;

  const items = rows.slice(0, limit) as ProjectListItem[];
  const next = rows.length > limit ? (items[items.length - 1]?.created_at ?? null) : null;
  return { items, next_cursor: next };
}

export async function getProject(projectId: string, viewerId?: string): Promise<ProjectListItem> {
  const sql = getDb();
  const rows = await sql<ProjectListItem[]>`
    select
      p.id, p.client_id, p.category_id, p.title, p.description,
      p.budget_min_usd_minor, p.budget_max_usd_minor, p.expected_delivery_days,
      p.status, p.awarded_order_id, p.proposal_count, p.created_at, p.updated_at,
      json_build_object('id', c.id, 'slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar) as category,
      json_build_object('id', pr.id, 'display_name', pr.display_name, 'avatar_url', pr.avatar_url) as client
    from public.projects p
    join public.categories c on c.id = p.category_id
    join public.profiles pr on pr.id = p.client_id
    where p.id = ${projectId}
  `;
  const project = rows[0];
  if (!project) throw new ProjectError("not_found", "Project not found");
  // Closed/cancelled projects are visible only to their owner.
  if (
    (project.status === "closed" || project.status === "cancelled") &&
    project.client_id !== viewerId
  ) {
    throw new ProjectError("not_found", "Project not found");
  }
  return project;
}

export async function listMyProjects(clientId: string): Promise<Project[]> {
  const sql = getDb();
  return sql<Project[]>`
    select ${sql.unsafe(PROJECT_COLUMNS)} from public.projects
    where client_id = ${clientId}
    order by created_at desc
  `;
}

/**
 * Client-driven status moves (Req 12). Awarding is NOT reachable here — it only
 * happens through acceptProposal, atomically with order creation.
 */
export async function updateProjectStatus(
  projectId: string,
  clientId: string,
  input: ProjectStatusUpdateInput,
): Promise<Project> {
  const sql = getDb();
  const rows = await sql<Project[]>`
    select ${sql.unsafe(PROJECT_COLUMNS)} from public.projects where id = ${projectId}
  `;
  const project = rows[0];
  if (!project) throw new ProjectError("not_found", "Project not found");
  if (project.client_id !== clientId) throw new ProjectError("forbidden", "Not your project");
  if (project.status === "awarded" || project.status === "cancelled") {
    throw new ProjectError("conflict", `Project is ${project.status}, status is final`);
  }

  const updated = await sql<Project[]>`
    update public.projects set status = ${input.status}
    where id = ${projectId}
    returning ${sql.unsafe(PROJECT_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: update...returning yields one row.
  return updated[0]!;
}

// --- proposals ---------------------------------------------------------------

export async function submitProposal(
  projectId: string,
  freelancerId: string,
  input: ProposalCreateInput,
): Promise<Proposal> {
  await ensureProfile(freelancerId);
  const sql = getDb();

  const created = await sql.begin(async (tx) => {
    const projects = await tx<
      { client_id: string; status: string; budget_min_usd_minor: number }[]
    >`
      select client_id, status, budget_min_usd_minor from public.projects where id = ${projectId} for update
    `;
    const project = projects[0];
    if (!project) throw new ProjectError("not_found", "Project not found");
    if (project.client_id === freelancerId) {
      throw new ProjectError("forbidden", "You cannot bid on your own project");
    }
    if (project.status !== "open") {
      throw new ProjectError("conflict", `Project is ${project.status}, not accepting proposals`);
    }
    if (isLowballBid(input.price_usd_minor, Number(project.budget_min_usd_minor))) {
      throw new ProjectError(
        "invalid",
        "Bid is below half the project minimum budget (anti-lowball guardrail)",
      );
    }

    const existing = await tx<{ id: string; status: string }[]>`
      select id, status from public.proposals
      where project_id = ${projectId} and freelancer_id = ${freelancerId}
    `;
    if (existing[0] && existing[0].status !== "withdrawn") {
      throw new ProjectError("conflict", "You already have a proposal on this project");
    }

    // A withdrawn proposal can be re-submitted in place (unique constraint).
    const rows = existing[0]
      ? await tx<Proposal[]>`
          update public.proposals set
            cover_letter = ${input.cover_letter},
            price_usd_minor = ${input.price_usd_minor},
            delivery_days = ${input.delivery_days},
            status = 'pending', order_id = null
          where id = ${existing[0].id}
          returning ${tx.unsafe(PROPOSAL_COLUMNS)}
        `
      : await tx<Proposal[]>`
          insert into public.proposals
            (project_id, freelancer_id, cover_letter, price_usd_minor, delivery_days)
          values
            (${projectId}, ${freelancerId}, ${input.cover_letter},
             ${input.price_usd_minor}, ${input.delivery_days})
          returning ${tx.unsafe(PROPOSAL_COLUMNS)}
        `;
    await tx`
      update public.projects
      set proposal_count = (select count(*) from public.proposals
                            where project_id = ${projectId} and status <> 'withdrawn')
      where id = ${projectId}
    `;
    // biome-ignore lint/style/noNonNullAssertion: insert/update...returning yields one row.
    return { proposal: rows[0]!, clientId: project.client_id };
  });

  await notify(created.clientId, "proposal_received", {
    project_id: projectId,
    proposal_id: created.proposal.id,
  });
  return created.proposal;
}

/** Client view: all proposals on their project, with freelancer cards. */
export async function listProposals(
  projectId: string,
  clientId: string,
): Promise<ProposalListItem[]> {
  const sql = getDb();
  const owner = await sql<{ client_id: string }[]>`
    select client_id from public.projects where id = ${projectId}
  `;
  if (!owner[0]) throw new ProjectError("not_found", "Project not found");
  if (owner[0].client_id !== clientId) throw new ProjectError("forbidden", "Not your project");

  return sql<ProposalListItem[]>`
    select
      pp.id, pp.project_id, pp.freelancer_id, pp.cover_letter, pp.price_usd_minor,
      pp.delivery_days, pp.status, pp.order_id, pp.created_at, pp.updated_at,
      json_build_object('id', f.id, 'display_name', f.display_name, 'avatar_url', f.avatar_url) as freelancer
    from public.proposals pp
    join public.profiles f on f.id = pp.freelancer_id
    where pp.project_id = ${projectId} and pp.status <> 'withdrawn'
    order by pp.created_at asc
  `;
}

/** Freelancer view: their proposals across projects. */
export async function listMyProposals(freelancerId: string): Promise<Proposal[]> {
  const sql = getDb();
  return sql<Proposal[]>`
    select ${sql.unsafe(PROPOSAL_COLUMNS)} from public.proposals
    where freelancer_id = ${freelancerId}
    order by created_at desc
  `;
}

/** Freelancer withdraws a pending/shortlisted proposal. */
export async function withdrawProposal(
  proposalId: string,
  freelancerId: string,
): Promise<Proposal> {
  const sql = getDb();
  const rows = await sql<Proposal[]>`
    select ${sql.unsafe(PROPOSAL_COLUMNS)} from public.proposals where id = ${proposalId}
  `;
  const proposal = rows[0];
  if (!proposal) throw new ProjectError("not_found", "Proposal not found");
  if (proposal.freelancer_id !== freelancerId) {
    throw new ProjectError("forbidden", "Not your proposal");
  }
  if (proposal.status !== "pending" && proposal.status !== "shortlisted") {
    throw new ProjectError("conflict", `Proposal is ${proposal.status}, cannot withdraw`);
  }
  const updated = await sql<Proposal[]>`
    update public.proposals set status = 'withdrawn'
    where id = ${proposalId}
    returning ${sql.unsafe(PROPOSAL_COLUMNS)}
  `;
  await sql`
    update public.projects
    set proposal_count = (select count(*) from public.proposals
                          where project_id = ${proposal.project_id} and status <> 'withdrawn')
    where id = ${proposal.project_id}
  `;
  // biome-ignore lint/style/noNonNullAssertion: update...returning yields one row.
  return updated[0]!;
}

/** Client shortlists or declines a proposal (Req 9/10). */
export async function reviewProposal(
  proposalId: string,
  clientId: string,
  action: "shortlisted" | "declined",
): Promise<Proposal> {
  const sql = getDb();
  const updated = await sql.begin(async (tx) => {
    const rows = await tx<(Proposal & { client_id: string })[]>`
      select pp.id, pp.project_id, pp.freelancer_id, pp.cover_letter, pp.price_usd_minor,
             pp.delivery_days, pp.status, pp.order_id, pp.created_at, pp.updated_at,
             p.client_id
      from public.proposals pp
      join public.projects p on p.id = pp.project_id
      where pp.id = ${proposalId}
      for update of pp
    `;
    const proposal = rows[0];
    if (!proposal) throw new ProjectError("not_found", "Proposal not found");
    if (proposal.client_id !== clientId) throw new ProjectError("forbidden", "Not your project");
    if (proposal.status !== "pending" && proposal.status !== "shortlisted") {
      throw new ProjectError("conflict", `Proposal is ${proposal.status}`);
    }
    const result = await tx<Proposal[]>`
      update public.proposals set status = ${action}
      where id = ${proposalId}
      returning ${tx.unsafe(PROPOSAL_COLUMNS)}
    `;
    // biome-ignore lint/style/noNonNullAssertion: update...returning yields one row.
    return result[0]!;
  });

  await notify(updated.freelancer_id, `proposal_${action}`, {
    project_id: updated.project_id,
    proposal_id: updated.id,
  });
  return updated;
}

/**
 * Client accepts a proposal: atomically create the escrow order (reusing the
 * orders engine + Pro Path commission tier, same as offer acceptance), mark
 * the proposal accepted, the project awarded, and decline the rest. One
 * transaction with a project row lock — a project can never award twice.
 */
export async function acceptProposal(
  proposalId: string,
  clientId: string,
): Promise<{ proposal: Proposal; orderId: string }> {
  const sql = getDb();
  const result = await sql.begin(async (tx) => {
    const rows = await tx<(Proposal & { client_id: string; project_status: string })[]>`
      select pp.id, pp.project_id, pp.freelancer_id, pp.cover_letter, pp.price_usd_minor,
             pp.delivery_days, pp.status, pp.order_id, pp.created_at, pp.updated_at,
             p.client_id, p.status as project_status
      from public.proposals pp
      join public.projects p on p.id = pp.project_id
      where pp.id = ${proposalId}
      for update of pp, p
    `;
    const proposal = rows[0];
    if (!proposal) throw new ProjectError("not_found", "Proposal not found");
    if (proposal.client_id !== clientId) throw new ProjectError("forbidden", "Not your project");
    if (proposal.status === "accepted" && proposal.order_id) {
      // Idempotent re-accept: return the existing order.
      return { proposal, orderId: proposal.order_id, alreadyAccepted: true };
    }
    if (proposal.status !== "pending" && proposal.status !== "shortlisted") {
      throw new ProjectError("conflict", `Proposal is ${proposal.status}, cannot accept`);
    }
    if (proposal.project_status !== "open" && proposal.project_status !== "in_review") {
      throw new ProjectError("conflict", `Project is ${proposal.project_status}, cannot award`);
    }

    const titleRow = await tx<{ title: string }[]>`
      select title from public.projects where id = ${proposal.project_id}
    `;
    const baseBps = (await getPublicConfig()).commission_bps;
    const tierBps = tierCommissionBps(await freelancerTier(proposal.freelancer_id), baseBps);
    const order = await insertOrder(tx, {
      clientId,
      freelancerId: proposal.freelancer_id,
      gigId: null,
      title: titleRow[0]?.title ?? "Project engagement",
      grossUsdMinor: proposal.price_usd_minor,
      deliveryDays: proposal.delivery_days,
      ...(tierBps !== baseBps ? { commissionBpsOverride: tierBps } : {}),
    });

    const accepted = await tx<Proposal[]>`
      update public.proposals set status = 'accepted', order_id = ${order.id}
      where id = ${proposalId}
      returning ${tx.unsafe(PROPOSAL_COLUMNS)}
    `;
    await tx`
      update public.projects set status = 'awarded', awarded_order_id = ${order.id}
      where id = ${proposal.project_id}
    `;
    await tx`
      update public.proposals set status = 'declined'
      where project_id = ${proposal.project_id}
        and id <> ${proposalId}
        and status in ('pending', 'shortlisted')
    `;
    // biome-ignore lint/style/noNonNullAssertion: update...returning yields one row.
    return { proposal: accepted[0]!, orderId: order.id, alreadyAccepted: false };
  });

  if (!result.alreadyAccepted) {
    await notify(result.proposal.freelancer_id, "proposal_accepted", {
      project_id: result.proposal.project_id,
      proposal_id: result.proposal.id,
      order_id: result.orderId,
    });
  }
  return { proposal: result.proposal, orderId: result.orderId };
}

/**
 * Anti-lowball guardrail (Phase 2: Trust & Quality). A bid below half the
 * client's own stated MINIMUM budget is treated as predatory race-to-the-
 * bottom pricing and rejected server-side; the web form warns softly below
 * the minimum itself. Pure predicate, exported for property/unit tests.
 */
export function isLowballBid(priceUsdMinor: number, budgetMinUsdMinor: number): boolean {
  return priceUsdMinor < Math.ceil(budgetMinUsdMinor / 2);
}
