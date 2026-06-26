import { getDb } from "@/core/db";
import { awardAchievement } from "@/modules/gamification/gamification.service";
import { notify } from "@/modules/notifications/notifications.service";
import type {
  ProfileReviewsResponse,
  Review,
  ReviewCreateInput,
  ReviewWithReviewer,
} from "@nilework/schemas";

/** Typed error so routes can map review failures to HTTP codes. */
export class ReviewError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

const REVIEW_COLUMNS = `
  id, order_id, reviewer_id, reviewee_id, reviewer_role, rating, comment, created_at
`;
const REVIEWER_JSON =
  "json_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url)";

/**
 * Submit a review on a completed (released) order. The reviewer must be a party;
 * the reviewee is the counterparty. One review per reviewer per order (DB-enforced),
 * so a double-submit is rejected as a conflict.
 */
export async function createReview(
  orderId: string,
  reviewerId: string,
  input: ReviewCreateInput,
): Promise<Review> {
  const sql = getDb();
  const orders = await sql<{ client_id: string; freelancer_id: string; status: string }[]>`
    select client_id, freelancer_id, status from public.orders where id = ${orderId} limit 1
  `;
  const order = orders[0];
  if (!order) throw new ReviewError("not_found", "Order not found");

  const isClient = order.client_id === reviewerId;
  const isFreelancer = order.freelancer_id === reviewerId;
  if (!isClient && !isFreelancer) throw new ReviewError("forbidden", "Not your order");
  if (order.status !== "released") {
    throw new ReviewError("conflict", "You can only review a completed order");
  }

  const revieweeId = isClient ? order.freelancer_id : order.client_id;
  const reviewerRole = isClient ? "client" : "freelancer";

  const existing = await sql<{ id: string }[]>`
    select id from public.reviews where order_id = ${orderId} and reviewer_id = ${reviewerId} limit 1
  `;
  if (existing[0]) throw new ReviewError("conflict", "You already reviewed this order");

  const rows = await sql<Review[]>`
    insert into public.reviews
      (order_id, reviewer_id, reviewee_id, reviewer_role, rating, comment)
    values
      (${orderId}, ${reviewerId}, ${revieweeId}, ${reviewerRole}, ${input.rating},
       ${input.comment ?? null})
    returning ${sql.unsafe(REVIEW_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  const review = rows[0]!;
  await notify(revieweeId, "review_received", { order_id: orderId, rating: input.rating });
  await awardAchievement(reviewerId, "first_review");
  if (input.rating === 5) await awardAchievement(revieweeId, "five_star");
  return review;
}

/** Reviews left on a specific order (party-scoped — used in the order detail view). */
export async function listOrderReviews(
  orderId: string,
  viewerId: string,
): Promise<ReviewWithReviewer[]> {
  const sql = getDb();
  const orders = await sql<{ client_id: string; freelancer_id: string }[]>`
    select client_id, freelancer_id from public.orders where id = ${orderId} limit 1
  `;
  const order = orders[0];
  if (!order) throw new ReviewError("not_found", "Order not found");
  if (order.client_id !== viewerId && order.freelancer_id !== viewerId) {
    throw new ReviewError("forbidden", "Not your order");
  }

  return sql<ReviewWithReviewer[]>`
    select ${sql.unsafe(prefixed(REVIEW_COLUMNS, "r"))}, ${sql.unsafe(REVIEWER_JSON)} as reviewer
    from public.reviews r
    join public.profiles p on p.id = r.reviewer_id
    where r.order_id = ${orderId}
    order by r.created_at
  `;
}

/** Public reputation for a profile: aggregate rating + the reviews they received. */
export async function getProfileReviews(profileId: string): Promise<ProfileReviewsResponse> {
  const sql = getDb();
  const summaryRows = await sql<{ average: number | null; count: number }[]>`
    select avg(rating)::float8 as average, count(*)::int as count
    from public.reviews where reviewee_id = ${profileId}
  `;
  const summary = summaryRows[0] ?? { average: null, count: 0 };

  const items = await sql<ReviewWithReviewer[]>`
    select ${sql.unsafe(prefixed(REVIEW_COLUMNS, "r"))}, ${sql.unsafe(REVIEWER_JSON)} as reviewer
    from public.reviews r
    join public.profiles p on p.id = r.reviewer_id
    where r.reviewee_id = ${profileId}
    order by r.created_at desc
    limit 50
  `;
  return {
    summary: {
      average: summary.average === null ? null : Math.round(summary.average * 100) / 100,
      count: summary.count,
    },
    items,
  };
}

function prefixed(columns: string, alias: string): string {
  return columns
    .split(",")
    .map((c) => `${alias}.${c.trim()}`)
    .join(", ");
}
