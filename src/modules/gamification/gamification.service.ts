import { randomUUID } from "node:crypto";
import { getDb } from "@/core/db";
import { notify } from "@/modules/notifications/notifications.service";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type { ApplyResultSchema, RewardsSummary } from "@nilework/schemas";
import type { z } from "zod";

/** First-milestone badges — metadata in code; the DB only stores which keys are earned. */
export const ACHIEVEMENTS: Record<string, { points: number }> = {
  profile_complete: { points: 50 },
  first_gig: { points: 100 },
  first_order: { points: 100 },
  first_delivery: { points: 150 },
  first_review: { points: 50 },
  five_star: { points: 100 },
};

/** Points each side earns when a referral qualifies. */
const REFERRAL_POINTS = 200;

/** Append a points entry (best-effort). Internal — all earns route through here. */
async function addPoints(
  profileId: string,
  points: number,
  reason: string,
  referenceType: string | null,
  referenceId: string | null,
): Promise<void> {
  const sql = getDb();
  await sql`
    insert into public.points_ledger (profile_id, points, reason, reference_type, reference_id)
    values (${profileId}, ${points}, ${reason}, ${referenceType}, ${referenceId})
  `;
}

/**
 * Award a milestone badge once. Idempotent via the (profile, key) UNIQUE — calling
 * it on every gig/order create simply no-ops after the first. Best-effort: a failure
 * never breaks the action that triggered it. Returns true only on first award.
 */
export async function awardAchievement(profileId: string, key: string): Promise<boolean> {
  const meta = ACHIEVEMENTS[key];
  if (!meta) return false;
  try {
    const sql = getDb();
    const rows = await sql<{ id: string }[]>`
      insert into public.user_achievements (profile_id, achievement_key)
      values (${profileId}, ${key})
      on conflict (profile_id, achievement_key) do nothing
      returning id
    `;
    if (!rows[0]) return false; // already earned
    await addPoints(profileId, meta.points, `achievement:${key}`, "achievement", null);
    await notify(profileId, "badge_earned", { key });
    return true;
  } catch (err) {
    console.error("awardAchievement failed:", err);
    return false;
  }
}

/**
 * Qualify a pending referral once the referred user completes their first order,
 * awarding both sides. Best-effort and idempotent (status flips pending → qualified
 * in one UPDATE, so a second call finds nothing).
 */
export async function qualifyReferral(referredId: string): Promise<void> {
  try {
    const sql = getDb();
    const rows = await sql<{ referrer_id: string; referred_id: string }[]>`
      update public.referrals
      set status = 'qualified', qualified_at = now(), points_awarded = ${REFERRAL_POINTS}
      where referred_id = ${referredId} and status = 'pending'
      returning referrer_id, referred_id
    `;
    const ref = rows[0];
    if (!ref) return;
    await addPoints(ref.referrer_id, REFERRAL_POINTS, "referral", "referral", ref.referred_id);
    await addPoints(ref.referred_id, REFERRAL_POINTS, "referral", "referral", ref.referrer_id);
    await notify(ref.referrer_id, "referral_qualified", {});
    await notify(ref.referred_id, "referral_qualified", {});
  } catch (err) {
    console.error("qualifyReferral failed:", err);
  }
}

/** Generate (once) and return the caller's referral code. */
export async function ensureReferralCode(profileId: string): Promise<string> {
  const sql = getDb();
  const existing = await sql<{ referral_code: string | null }[]>`
    select referral_code from public.profiles where id = ${profileId}
  `;
  if (existing[0]?.referral_code) return existing[0].referral_code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    try {
      const rows = await sql<{ referral_code: string }[]>`
        update public.profiles set referral_code = ${code}
        where id = ${profileId} and referral_code is null
        returning referral_code
      `;
      if (rows[0]?.referral_code) return rows[0].referral_code;
      // Set concurrently by another request — return whatever stuck.
      const current = await sql<{ referral_code: string | null }[]>`
        select referral_code from public.profiles where id = ${profileId}
      `;
      if (current[0]?.referral_code) return current[0].referral_code;
    } catch {
      // Unique collision on the random code — try again.
    }
  }
  throw new Error("could not generate a referral code");
}

/** Apply a referral code to the caller (only before any first-order qualification). */
export async function applyReferral(
  referredId: string,
  code: string,
): Promise<z.infer<typeof ApplyResultSchema>> {
  await ensureProfile(referredId);
  const sql = getDb();
  const referrers = await sql<{ id: string }[]>`
    select id from public.profiles where referral_code = ${code.toUpperCase()} limit 1
  `;
  const referrer = referrers[0];
  if (!referrer || referrer.id === referredId) return { ok: false };

  const rows = await sql<{ id: string }[]>`
    insert into public.referrals (referrer_id, referred_id)
    values (${referrer.id}, ${referredId})
    on conflict (referred_id) do nothing
    returning id
  `;
  return { ok: Boolean(rows[0]) };
}

/** Dashboard rewards summary: derived points balance, earned badges, referral code. */
export async function getRewards(profileId: string): Promise<RewardsSummary> {
  await ensureProfile(profileId);
  const referralCode = await ensureReferralCode(profileId);
  const sql = getDb();

  const pointsRows = await sql<{ points: number }[]>`
    select coalesce(sum(points), 0)::int as points from public.points_ledger where profile_id = ${profileId}
  `;
  const achievementRows = await sql<{ achievement_key: string }[]>`
    select achievement_key from public.user_achievements where profile_id = ${profileId} order by created_at
  `;

  return {
    points: pointsRows[0]?.points ?? 0,
    achievements: achievementRows.map((r) => r.achievement_key),
    referral_code: referralCode,
  };
}
