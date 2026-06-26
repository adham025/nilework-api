import { getDb } from "@/core/db";
import { getPublicConfig } from "@/modules/config/config.service";
import { freelancerTier, tierCommissionBps } from "@/modules/levels/levels.service";
import { notify } from "@/modules/notifications/notifications.service";
import { getOrder, insertOrder } from "@/modules/orders/orders.service";
import type { Offer, OfferCreateInput, OrderDetail } from "@nilework/schemas";
import type { TransactionSql } from "postgres";

/** Typed error so routes can map offer failures to HTTP codes. */
export class OfferError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "OfferError";
  }
}

const OFFER_COLUMNS = `
  id, conversation_id, freelancer_id, client_id, gig_id, title, description,
  price_usd_minor, delivery_days, status, order_id, expires_at, created_at, updated_at
`;

/** Freelancer sends a custom offer in a conversation they're the freelancer of. */
export async function createOffer(
  conversationId: string,
  callerId: string,
  input: OfferCreateInput,
): Promise<Offer> {
  const sql = getDb();
  const convos = await sql<{ client_id: string; freelancer_id: string; gig_id: string | null }[]>`
    select client_id, freelancer_id, gig_id from public.conversations where id = ${conversationId} limit 1
  `;
  const convo = convos[0];
  if (!convo) throw new OfferError("not_found", "Conversation not found");
  if (convo.freelancer_id !== callerId) {
    throw new OfferError("forbidden", "Only the freelancer can send an offer");
  }

  const expiresAt = input.expires_in_days
    ? new Date(Date.now() + input.expires_in_days * 86_400_000).toISOString()
    : null;

  const rows = await sql<Offer[]>`
    insert into public.offers
      (conversation_id, freelancer_id, client_id, gig_id, title, description,
       price_usd_minor, delivery_days, expires_at)
    values
      (${conversationId}, ${convo.freelancer_id}, ${convo.client_id}, ${convo.gig_id},
       ${input.title}, ${input.description}, ${input.price_usd_minor}, ${input.delivery_days},
       ${expiresAt})
    returning ${sql.unsafe(OFFER_COLUMNS)}
  `;
  // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
  const offer = rows[0]!;
  await notify(offer.client_id, "offer_received", {
    conversation_id: conversationId,
    offer_id: offer.id,
  });
  return offer;
}

/** List a conversation's offers (participant only), newest first. */
export async function listOffers(conversationId: string, userId: string): Promise<Offer[]> {
  const sql = getDb();
  const rows = await sql<Offer[]>`
    select ${sql.unsafe(OFFER_COLUMNS)}
    from public.offers
    where conversation_id = ${conversationId}
      and (client_id = ${userId} or freelancer_id = ${userId})
    order by created_at desc
  `;
  return rows;
}

/**
 * Client accepts an offer → it becomes an order via the shared insertOrder path,
 * atomically with marking the offer accepted. Returns the new order.
 */
export async function acceptOffer(offerId: string, clientId: string): Promise<OrderDetail> {
  const sql = getDb();
  const created = await sql.begin(async (tx) => {
    const offer = await lockOffer(tx, offerId);
    if (offer.client_id !== clientId) throw new OfferError("forbidden", "Not your offer");
    if (offer.status !== "pending") {
      throw new OfferError("conflict", `Offer is ${offer.status}, cannot accept`);
    }
    if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now()) {
      await tx`update public.offers set status = 'expired' where id = ${offerId}`;
      throw new OfferError("conflict", "Offer has expired");
    }

    // Apply the freelancer's Pro Path commission tier (§5.3) to the order.
    const baseBps = (await getPublicConfig()).commission_bps;
    const tierBps = tierCommissionBps(await freelancerTier(offer.freelancer_id), baseBps);
    const order = await insertOrder(tx, {
      clientId: offer.client_id,
      freelancerId: offer.freelancer_id,
      gigId: offer.gig_id,
      title: offer.title,
      grossUsdMinor: offer.price_usd_minor,
      deliveryDays: offer.delivery_days,
      ...(tierBps !== baseBps ? { commissionBpsOverride: tierBps } : {}),
    });
    await tx`update public.offers set status = 'accepted', order_id = ${order.id} where id = ${offerId}`;
    return { orderId: order.id, freelancerId: order.freelancer_id };
  });

  await notify(created.freelancerId, "offer_accepted", { order_id: created.orderId });
  return getOrder(created.orderId, clientId);
}

/** Client declines a pending offer. */
export async function declineOffer(offerId: string, clientId: string): Promise<Offer> {
  return transition(offerId, "declined", (offer) => {
    if (offer.client_id !== clientId) throw new OfferError("forbidden", "Not your offer");
  });
}

/** Freelancer withdraws a pending offer they sent. */
export async function withdrawOffer(offerId: string, freelancerId: string): Promise<Offer> {
  return transition(offerId, "withdrawn", (offer) => {
    if (offer.freelancer_id !== freelancerId) throw new OfferError("forbidden", "Not your offer");
  });
}

// --- internals -------------------------------------------------------------

type Tx = TransactionSql;

async function lockOffer(tx: Tx, offerId: string): Promise<Offer> {
  const rows = await tx<Offer[]>`
    select ${tx.unsafe(OFFER_COLUMNS)} from public.offers where id = ${offerId} for update
  `;
  const offer = rows[0];
  if (!offer) throw new OfferError("not_found", "Offer not found");
  return offer;
}

async function transition(
  offerId: string,
  to: "declined" | "withdrawn",
  authorize: (offer: Offer) => void,
): Promise<Offer> {
  const sql = getDb();
  return sql.begin(async (tx) => {
    const offer = await lockOffer(tx, offerId);
    authorize(offer);
    if (offer.status !== "pending") {
      throw new OfferError("conflict", `Offer is ${offer.status}, cannot ${to.replace("ed", "")}`);
    }
    const rows = await tx<Offer[]>`
      update public.offers set status = ${to} where id = ${offerId}
      returning ${tx.unsafe(OFFER_COLUMNS)}
    `;
    // biome-ignore lint/style/noNonNullAssertion: update...returning yields the row.
    return rows[0]!;
  });
}
