import { getDb } from "@/core/db";
import { DomainError } from "@/core/errors";
import { notify } from "@/modules/notifications/notifications.service";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type { Agency, AgencyMember, MyAgency } from "@nilework/schemas";

/** Typed error so routes can map agency failures to HTTP codes. */
export class AgencyError extends DomainError<"not_found" | "forbidden" | "conflict"> {}

async function membershipOf(
  profileId: string,
): Promise<{ agency_id: string; role: string } | null> {
  const sql = getDb();
  const rows = await sql<{ agency_id: string; role: string }[]>`
    select agency_id, role from public.agency_members where profile_id = ${profileId} limit 1
  `;
  return rows[0] ?? null;
}

/** Create an agency; the caller becomes its owner. One agency per person. */
export async function createAgency(ownerId: string, name: string): Promise<Agency> {
  await ensureProfile(ownerId);
  if (await membershipOf(ownerId)) {
    throw new AgencyError("conflict", "You are already in an agency");
  }
  const sql = getDb();
  return sql.begin(async (tx) => {
    const rows = await tx<Agency[]>`
      insert into public.agencies (owner_id, name) values (${ownerId}, ${name})
      returning id, owner_id, name, created_at, updated_at
    `;
    // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
    const agency = rows[0]!;
    await tx`
      insert into public.agency_members (agency_id, profile_id, role)
      values (${agency.id}, ${ownerId}, 'owner')
    `;
    return agency;
  });
}

/** The caller's agency (with roster), or null if they aren't in one. */
export async function getMyAgency(userId: string): Promise<MyAgency> {
  const membership = await membershipOf(userId);
  if (!membership) return null;
  const sql = getDb();
  const agencies = await sql<Agency[]>`
    select id, owner_id, name, created_at, updated_at from public.agencies
    where id = ${membership.agency_id} limit 1
  `;
  const agency = agencies[0];
  if (!agency) return null;
  const members = await sql<AgencyMember[]>`
    select m.profile_id, m.role, p.display_name, p.avatar_url, m.created_at
    from public.agency_members m
    join public.profiles p on p.id = m.profile_id
    where m.agency_id = ${membership.agency_id}
    order by (m.role = 'owner') desc, m.created_at
  `;
  return { agency, my_role: membership.role as "owner" | "member", members };
}

/** Owner adds a member by their referral code. */
export async function addMember(ownerId: string, code: string): Promise<void> {
  const membership = await membershipOf(ownerId);
  if (!membership || membership.role !== "owner") {
    throw new AgencyError("forbidden", "Only the agency owner can add members");
  }
  const sql = getDb();
  const targets = await sql<{ id: string }[]>`
    select id from public.profiles where referral_code = ${code.toUpperCase()} limit 1
  `;
  const target = targets[0];
  if (!target) throw new AgencyError("not_found", "No user with that code");
  if (await membershipOf(target.id)) {
    throw new AgencyError("conflict", "That user is already in an agency");
  }
  await sql`
    insert into public.agency_members (agency_id, profile_id, role)
    values (${membership.agency_id}, ${target.id}, 'member')
  `;
  await notify(target.id, "agency_added", { agency_id: membership.agency_id });
}

/** Owner removes a member (not themselves). */
export async function removeMember(ownerId: string, profileId: string): Promise<void> {
  const membership = await membershipOf(ownerId);
  if (!membership || membership.role !== "owner") {
    throw new AgencyError("forbidden", "Only the agency owner can remove members");
  }
  if (profileId === ownerId) throw new AgencyError("conflict", "The owner cannot be removed");
  const sql = getDb();
  await sql`
    delete from public.agency_members
    where agency_id = ${membership.agency_id} and profile_id = ${profileId} and role = 'member'
  `;
}

/** A member leaves their agency (the owner cannot leave). */
export async function leaveAgency(userId: string): Promise<void> {
  const membership = await membershipOf(userId);
  if (!membership) throw new AgencyError("not_found", "You are not in an agency");
  if (membership.role === "owner") {
    throw new AgencyError("conflict", "The owner cannot leave; delete the agency instead");
  }
  const sql = getDb();
  await sql`delete from public.agency_members where profile_id = ${userId} and role = 'member'`;
}
