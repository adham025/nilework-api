import { randomUUID } from "node:crypto";
import { getDb } from "@/core/db";
import { awardAchievement } from "@/modules/gamification/gamification.service";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type {
  Gig,
  GigCreateInput,
  GigListItem,
  GigListQuery,
  GigListResponse,
  GigStatus,
} from "@nilework/schemas";

const GIG_COLUMNS = `
  id, freelancer_id, category_id, title, slug, description,
  price_usd_minor, delivery_days, status, created_at, updated_at
`;

/** ASCII slug from a title (Arabic falls back to "gig"); always uniquified. */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base || "gig";
}

export async function createGig(freelancerId: string, input: GigCreateInput): Promise<Gig> {
  const sql = getDb();
  await ensureProfile(freelancerId);
  const slug = `${slugify(input.title)}-${randomUUID().slice(0, 8)}`;

  const rows = await sql<Gig[]>`
    insert into public.gigs
      (freelancer_id, category_id, title, slug, description, price_usd_minor, delivery_days)
    values
      (${freelancerId}, ${input.category_id}, ${input.title}, ${slug},
       ${input.description}, ${input.price_usd_minor}, ${input.delivery_days})
    returning ${sql.unsafe(GIG_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  const gig = rows[0]!;
  await awardAchievement(freelancerId, "first_gig");
  return gig;
}

/** Public browse — active gigs only, with embedded category + safe freelancer info. */
export async function listGigs(query: GigListQuery): Promise<GigListResponse> {
  const sql = getDb();
  const { limit } = query;

  const rows = await sql<GigListItem[]>`
    select
      g.id, g.freelancer_id, g.category_id, g.title, g.slug, g.description,
      g.price_usd_minor, g.delivery_days, g.status, g.created_at, g.updated_at,
      json_build_object('id', c.id, 'slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar)
        as category,
      json_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
        as freelancer
    from public.gigs g
    join public.categories c on c.id = g.category_id
    join public.profiles p on p.id = g.freelancer_id
    where g.status = 'active'
      ${query.category ? sql`and c.slug = ${query.category}` : sql``}
      ${query.cursor ? sql`and g.created_at < ${query.cursor}` : sql``}
    -- Featured gigs float to the top of the first page (§5.3 redemption reward);
    -- deeper pages page purely by created_at to keep the cursor consistent.
    order by
      ${query.cursor ? sql`` : sql`coalesce(g.featured_until > now(), false) desc,`}
      g.created_at desc
    limit ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore ? (items.at(-1)?.created_at ?? null) : null };
}

export async function getGigBySlug(slug: string): Promise<GigListItem | null> {
  const sql = getDb();
  const rows = await sql<GigListItem[]>`
    select
      g.id, g.freelancer_id, g.category_id, g.title, g.slug, g.description,
      g.price_usd_minor, g.delivery_days, g.status, g.created_at, g.updated_at,
      json_build_object('id', c.id, 'slug', c.slug, 'name_en', c.name_en, 'name_ar', c.name_ar)
        as category,
      json_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url)
        as freelancer
    from public.gigs g
    join public.categories c on c.id = g.category_id
    join public.profiles p on p.id = g.freelancer_id
    where g.slug = ${slug} and g.status = 'active'
    limit 1
  `;
  return rows[0] ?? null;
}

export async function listMyGigs(freelancerId: string): Promise<Gig[]> {
  const sql = getDb();
  return sql<Gig[]>`
    select ${sql.unsafe(GIG_COLUMNS)}
    from public.gigs
    where freelancer_id = ${freelancerId}
    order by created_at desc
  `;
}

export async function updateGigStatus(
  gigId: string,
  freelancerId: string,
  status: GigStatus,
): Promise<Gig | null> {
  const sql = getDb();
  const rows = await sql<Gig[]>`
    update public.gigs set status = ${status}
    where id = ${gigId} and freelancer_id = ${freelancerId}
    returning ${sql.unsafe(GIG_COLUMNS)}
  `;
  return rows[0] ?? null;
}
