import { getDb } from "@/core/db";
import { grantPoints } from "@/modules/gamification/gamification.service";
import { notify } from "@/modules/notifications/notifications.service";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type { Leaderboard, Streak } from "@nilework/schemas";

/** Points granted each time a streak crosses a 7-day milestone. */
const STREAK_MILESTONE_POINTS = 50;
const LEADERBOARD_SIZE = 20;

const EMPTY: Streak = { current_streak: 0, longest_streak: 0, last_active_date: null };

export async function getMyStreak(profileId: string): Promise<Streak> {
  const sql = getDb();
  const rows = await sql<Streak[]>`
    select current_streak, longest_streak, last_active_date::text as last_active_date
    from public.activity_streaks where profile_id = ${profileId} limit 1
  `;
  return rows[0] ?? EMPTY;
}

/**
 * Record a day of activity (a daily heartbeat). Same-day calls are idempotent;
 * a consecutive day extends the streak, any longer gap resets it to 1. Crossing a
 * 7-day milestone grants points (best-effort) through the existing ledger.
 */
export async function recordActivity(profileId: string): Promise<Streak> {
  await ensureProfile(profileId);
  const current = await getMyStreak(profileId);

  // Compare on UTC calendar days.
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  if (current.last_active_date === todayKey) return current;

  let streak = 1;
  if (current.last_active_date) {
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    if (current.last_active_date === yesterday.toISOString().slice(0, 10)) {
      streak = current.current_streak + 1;
    }
  }
  const longest = Math.max(streak, current.longest_streak);

  const sql = getDb();
  await sql`
    insert into public.activity_streaks (profile_id, current_streak, longest_streak, last_active_date)
    values (${profileId}, ${streak}, ${longest}, ${todayKey}::date)
    on conflict (profile_id) do update set
      current_streak = ${streak}, longest_streak = ${longest}, last_active_date = ${todayKey}::date
  `;

  if (streak > 0 && streak % 7 === 0) {
    try {
      await grantPoints(profileId, STREAK_MILESTONE_POINTS, `streak:${streak}`, "streak", null);
      await notify(profileId, "streak_milestone", { days: streak });
    } catch {
      // A points/notify hiccup must never break the heartbeat.
    }
  }

  return { current_streak: streak, longest_streak: longest, last_active_date: todayKey };
}

/** Top earners by points over the last 30 days (public, read-only aggregate). */
export async function getLeaderboard(): Promise<Leaderboard> {
  const sql = getDb();
  const rows = await sql<
    { profile_id: string; display_name: string | null; avatar_url: string | null; points: number }[]
  >`
    select l.profile_id, p.display_name, p.avatar_url, sum(l.points)::int as points
    from public.points_ledger l
    join public.profiles p on p.id = l.profile_id
    where l.created_at >= now() - interval '30 days'
    group by l.profile_id, p.display_name, p.avatar_url
    having sum(l.points) > 0
    order by points desc
    limit ${LEADERBOARD_SIZE}
  `;
  return {
    period: "month",
    entries: rows.map((r, i) => ({ rank: i + 1, ...r })),
  };
}
