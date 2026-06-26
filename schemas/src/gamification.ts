import { z } from "zod";

/** Dashboard rewards summary: points balance, earned badges, the referral code (§5.3). */
export const RewardsSummarySchema = z.object({
  points: z.number().int(),
  achievements: z.array(z.string()),
  referral_code: z.string(),
});
export type RewardsSummary = z.infer<typeof RewardsSummarySchema>;

/** Apply a referral code (at onboarding or later, before the first completed order). */
export const ReferralApplySchema = z.object({
  code: z.string().min(4).max(32),
});
export type ReferralApplyInput = z.infer<typeof ReferralApplySchema>;

export const ApplyResultSchema = z.object({ ok: z.boolean() });
