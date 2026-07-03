import { getDb } from "@/core/db";
import type { FreelancerCard, Profile, ProfileUpdate, PublicFreelancer } from "@nilework/schemas";

const COLUMNS = `
  id, display_name, locale, is_client, is_freelancer, headline, bio, country,
  avatar_url, phone, phone_verified, id_verification_status, onboarding_completed,
  created_at, updated_at
`;

/**
 * Ensure a profile row exists for the authenticated user, creating it on first
 * access (MASTER_PLAN §6.1: business logic in the API, not a DB trigger).
 * Idempotent via ON CONFLICT — safe under concurrent first requests.
 */
export async function ensureProfile(userId: string): Promise<Profile> {
  const sql = getDb();
  const rows = await sql<Profile[]>`
    insert into public.profiles (id)
    values (${userId})
    on conflict (id) do update set updated_at = public.profiles.updated_at
    returning ${sql.unsafe(COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning always yields one row.
  return rows[0]!;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const sql = getDb();
  const rows = await sql<Profile[]>`
    select ${sql.unsafe(COLUMNS)} from public.profiles where id = ${userId}
  `;
  return rows[0] ?? null;
}

/**
 * Apply a partial update to the user's own profile. Marks onboarding complete
 * once a display name and at least one role are present.
 */
export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<Profile> {
  const sql = getDb();
  const current = await ensureProfile(userId);

  // Resolve each field against the current value so no `undefined` reaches SQL.
  const displayName = patch.display_name ?? current.display_name;
  const locale = patch.locale ?? current.locale;
  const isClient = patch.is_client ?? current.is_client;
  const isFreelancer = patch.is_freelancer ?? current.is_freelancer;
  const headline = patch.headline ?? current.headline;
  const bio = patch.bio ?? current.bio;
  const country = patch.country ?? current.country;
  const avatarUrl = patch.avatar_url ?? current.avatar_url;
  const onboardingCompleted = Boolean(displayName) && (isClient || isFreelancer);

  const rows = await sql<Profile[]>`
    update public.profiles set
      display_name = ${displayName},
      locale = ${locale},
      is_client = ${isClient},
      is_freelancer = ${isFreelancer},
      headline = ${headline},
      bio = ${bio},
      country = ${country},
      avatar_url = ${avatarUrl},
      onboarding_completed = ${onboardingCompleted}
    where id = ${userId}
    returning ${sql.unsafe(COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: update...returning yields the row.
  return rows[0]!;
}

/** Columns exposed on public freelancer surfaces — never phone/locale/flags. */
const FREELANCER_CARD_SELECT = `
  p.id, p.display_name, p.headline, p.country, p.avatar_url,
  (p.id_verification_status = 'verified') as verified,
  round(avg(r.rating)::numeric, 2)::float8 as avg_rating,
  count(distinct r.id)::int as review_count,
  count(distinct g.id)::int as gig_count,
  p.created_at
`;

/**
 * Public freelancer browse (public-browse-search-phase1): completed-onboarding
 * freelancers with review/gig aggregates, newest first, cursor-paginated.
 * Keyword search is ILIKE over display_name + headline (FTS upgrade tracked in
 * the spec); verified_only filters to ID-verified freelancers.
 */
export async function listFreelancers(query: {
  q?: string | undefined;
  verified_only?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}): Promise<{ items: FreelancerCard[]; next_cursor: string | null }> {
  const sql = getDb();
  const q = query.q?.trim() ? `%${query.q.trim()}%` : null;

  const rows = await sql<FreelancerCard[]>`
    select ${sql.unsafe(FREELANCER_CARD_SELECT)}
    from public.profiles p
    left join public.reviews r on r.reviewee_id = p.id
    left join public.gigs g on g.freelancer_id = p.id and g.status = 'active'
    where p.is_freelancer = true and p.onboarding_completed = true
      ${q ? sql`and (p.display_name ilike ${q} or p.headline ilike ${q})` : sql``}
      ${query.verified_only === "true" ? sql`and p.id_verification_status = 'verified'` : sql``}
      ${query.cursor ? sql`and p.created_at < ${query.cursor}` : sql``}
    group by p.id
    order by p.created_at desc
    limit ${query.limit + 1}
  `;

  const items = rows.slice(0, query.limit);
  const next = rows.length > query.limit ? (items[items.length - 1]?.created_at ?? null) : null;
  return { items, next_cursor: next };
}

/** Public freelancer profile (card + bio). Null when not a public freelancer. */
export async function getPublicFreelancer(id: string): Promise<PublicFreelancer | null> {
  const sql = getDb();
  const rows = await sql<PublicFreelancer[]>`
    select ${sql.unsafe(FREELANCER_CARD_SELECT)}, p.bio
    from public.profiles p
    left join public.reviews r on r.reviewee_id = p.id
    left join public.gigs g on g.freelancer_id = p.id and g.status = 'active'
    where p.id = ${id} and p.is_freelancer = true and p.onboarding_completed = true
    group by p.id
  `;
  return rows[0] ?? null;
}
