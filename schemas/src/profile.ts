import { z } from "zod";
import { LocaleSchema } from "./common.js";

export const IdVerificationStatusSchema = z.enum(["unverified", "pending", "verified", "rejected"]);
export type IdVerificationStatus = z.infer<typeof IdVerificationStatusSchema>;

/** Full profile as returned by the API (snake_case mirrors the DB columns). */
export const ProfileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  locale: LocaleSchema,
  is_client: z.boolean(),
  is_freelancer: z.boolean(),
  headline: z.string().nullable(),
  bio: z.string().nullable(),
  country: z.string().nullable(),
  avatar_url: z.string().nullable(),
  phone: z.string().nullable(),
  phone_verified: z.boolean(),
  id_verification_status: IdVerificationStatusSchema,
  onboarding_completed: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** Fields a user may patch on their own profile (onboarding + edits). */
export const ProfileUpdateSchema = z
  .object({
    display_name: z.string().min(1).max(80),
    locale: LocaleSchema,
    is_client: z.boolean(),
    is_freelancer: z.boolean(),
    headline: z.string().max(120),
    bio: z.string().max(2000),
    country: z.string().max(2),
    avatar_url: z.string().url(),
  })
  .partial();
export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;

/** Onboarding completion requires a display name and at least one chosen role. */
export const OnboardingSchema = z
  .object({
    display_name: z.string().min(1).max(80),
    locale: LocaleSchema,
    is_client: z.boolean(),
    is_freelancer: z.boolean(),
  })
  .refine((v) => v.is_client || v.is_freelancer, {
    message: "Choose at least one role (client and/or freelancer).",
    path: ["is_client"],
  });
export type OnboardingInput = z.infer<typeof OnboardingSchema>;

// --- public freelancer discovery (public-browse-search-phase1) ----------------

/** Public card for freelancer browse — only safe, public fields. */
export const FreelancerCardSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  headline: z.string().nullable(),
  country: z.string().nullable(),
  avatar_url: z.string().nullable(),
  verified: z.boolean(),
  avg_rating: z.number().nullable(),
  review_count: z.number().int().nonnegative(),
  gig_count: z.number().int().nonnegative(),
  created_at: z.string(),
});
export type FreelancerCard = z.infer<typeof FreelancerCardSchema>;

export const FreelancerListResponseSchema = z.object({
  items: z.array(FreelancerCardSchema),
  next_cursor: z.string().nullable(),
});
export type FreelancerListResponse = z.infer<typeof FreelancerListResponseSchema>;

export const FreelancerListQuerySchema = z.object({
  q: z.string().max(120).optional(),
  verified_only: z.enum(["true", "false"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});
export type FreelancerListQuery = z.infer<typeof FreelancerListQuerySchema>;

/** Public profile page payload — card plus bio. */
export const PublicFreelancerSchema = FreelancerCardSchema.extend({
  bio: z.string().nullable(),
});
export type PublicFreelancer = z.infer<typeof PublicFreelancerSchema>;
