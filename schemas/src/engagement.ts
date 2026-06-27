import { z } from "zod";

export const StreakSchema = z.object({
  current_streak: z.number().int(),
  longest_streak: z.number().int(),
  last_active_date: z.string().nullable(),
});
export type Streak = z.infer<typeof StreakSchema>;

export const LeaderboardEntrySchema = z.object({
  rank: z.number().int(),
  profile_id: z.string().uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  points: z.number().int(),
});

export const LeaderboardSchema = z.object({
  period: z.literal("month"),
  entries: z.array(LeaderboardEntrySchema),
});
export type Leaderboard = z.infer<typeof LeaderboardSchema>;
