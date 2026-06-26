import { z } from "zod";

export const ReviewSchema = z.object({
  id: z.string().uuid(),
  order_id: z.string().uuid(),
  reviewer_id: z.string().uuid(),
  reviewee_id: z.string().uuid(),
  reviewer_role: z.enum(["client", "freelancer"]),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  created_at: z.string(),
});
export type Review = z.infer<typeof ReviewSchema>;

/** Privacy-filtered reviewer info embedded in public review listings. */
export const ReviewReviewerRefSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export const ReviewWithReviewerSchema = ReviewSchema.extend({
  reviewer: ReviewReviewerRefSchema,
});
export type ReviewWithReviewer = z.infer<typeof ReviewWithReviewerSchema>;

export const ReviewListSchema = z.array(ReviewWithReviewerSchema);

/** Aggregate rating for a profile — the public reputation headline (§3). */
export const ReviewSummarySchema = z.object({
  average: z.number().nullable(),
  // Recency-weighted rating — recent reviews count more (§7). The trust signal.
  weighted_average: z.number().nullable(),
  count: z.number().int().nonnegative(),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

export const ProfileReviewsResponseSchema = z.object({
  summary: ReviewSummarySchema,
  items: ReviewListSchema,
});
export type ProfileReviewsResponse = z.infer<typeof ProfileReviewsResponseSchema>;

/** Submit a review on a completed order. */
export const ReviewCreateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type ReviewCreateInput = z.infer<typeof ReviewCreateSchema>;
