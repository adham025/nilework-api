import { getDb } from "@/core/db";
import type { Profile, ProfileUpdate } from "@nilework/schemas";

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
