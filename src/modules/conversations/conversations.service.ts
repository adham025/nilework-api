import { getDb } from "@/core/db";
import { ensureProfile } from "@/modules/profiles/profiles.service";
import type {
  Conversation,
  ConversationListResponse,
  ConversationWithParties,
  Message,
  MessageListResponse,
  PaginationQuery,
} from "@nilework/schemas";

/** Typed error so routes can map conversation failures to HTTP codes. */
export class ConversationError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "ConversationError";
  }
}

const CONVO_COLUMNS = `
  id, client_id, freelancer_id, gig_id, last_message_at, created_at, updated_at
`;
const PARTY_JSON = (alias: string) =>
  `json_build_object('id', ${alias}.id, 'display_name', ${alias}.display_name, 'avatar_url', ${alias}.avatar_url)`;

/**
 * Start a conversation as the client with a freelancer (optionally about a gig),
 * reusing the existing thread if one already exists for the same triple. The caller
 * is always the client side of the thread (the pre-sale "contact freelancer" flow).
 */
export async function startConversation(
  clientId: string,
  freelancerId: string,
  gigId: string | null,
): Promise<ConversationWithParties> {
  if (clientId === freelancerId) {
    throw new ConversationError("conflict", "You cannot message yourself");
  }
  await ensureProfile(clientId);
  const sql = getDb();

  // Reuse an existing thread for the same (client, freelancer, gig) triple.
  const existing = await sql<Conversation[]>`
    select ${sql.unsafe(CONVO_COLUMNS)} from public.conversations
    where client_id = ${clientId} and freelancer_id = ${freelancerId}
      and gig_id is not distinct from ${gigId}
    limit 1
  `;
  const row =
    existing[0] ??
    (
      await sql<Conversation[]>`
        insert into public.conversations (client_id, freelancer_id, gig_id)
        values (${clientId}, ${freelancerId}, ${gigId})
        returning ${sql.unsafe(CONVO_COLUMNS)}
      `
    )[0];
  // biome-ignore lint/style/noNonNullAssertion: select-or-insert always yields a row.
  return loadConversation(row!.id, clientId);
}

export async function listMyConversations(
  userId: string,
  query: PaginationQuery,
): Promise<ConversationListResponse> {
  const sql = getDb();
  const { limit } = query;
  const rows = await sql<ConversationWithParties[]>`
    select
      ${sql.unsafe(prefixed(CONVO_COLUMNS, "o"))},
      ${sql.unsafe(PARTY_JSON("c"))} as client,
      ${sql.unsafe(PARTY_JSON("f"))} as freelancer
    from public.conversations o
    join public.profiles c on c.id = o.client_id
    join public.profiles f on f.id = o.freelancer_id
    where (o.client_id = ${userId} or o.freelancer_id = ${userId})
      ${query.cursor ? sql`and coalesce(o.last_message_at, o.created_at) < ${query.cursor}` : sql``}
    order by coalesce(o.last_message_at, o.created_at) desc
    limit ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    next_cursor: hasMore && last ? (last.last_message_at ?? last.created_at) : null,
  };
}

/** Participant-scoped conversation fetch. */
export async function getConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationWithParties> {
  return loadConversation(conversationId, userId);
}

export async function listMessages(
  conversationId: string,
  userId: string,
  query: PaginationQuery,
): Promise<MessageListResponse> {
  await assertParticipant(conversationId, userId);
  const sql = getDb();
  const { limit } = query;
  const rows = await sql<Message[]>`
    select id, conversation_id, sender_id, body, created_at
    from public.messages
    where conversation_id = ${conversationId}
      ${query.cursor ? sql`and created_at < ${query.cursor}` : sql``}
    order by created_at desc
    limit ${limit + 1}
  `;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, next_cursor: hasMore ? (items.at(-1)?.created_at ?? null) : null };
}

/** Send a message (participant only) and bump the conversation's last_message_at. */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
): Promise<Message> {
  await assertParticipant(conversationId, senderId);
  const sql = getDb();
  return sql.begin(async (tx) => {
    const rows = await tx<Message[]>`
      insert into public.messages (conversation_id, sender_id, body)
      values (${conversationId}, ${senderId}, ${body})
      returning id, conversation_id, sender_id, body, created_at
    `;
    await tx`update public.conversations set last_message_at = now() where id = ${conversationId}`;
    // biome-ignore lint/style/noNonNullAssertion: insert...returning yields one row.
    return rows[0]!;
  });
}

// --- internals -------------------------------------------------------------

function prefixed(columns: string, alias: string): string {
  return columns
    .split(",")
    .map((c) => `${alias}.${c.trim()}`)
    .join(", ");
}

async function loadConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationWithParties> {
  const sql = getDb();
  const rows = await sql<ConversationWithParties[]>`
    select
      ${sql.unsafe(prefixed(CONVO_COLUMNS, "o"))},
      ${sql.unsafe(PARTY_JSON("c"))} as client,
      ${sql.unsafe(PARTY_JSON("f"))} as freelancer
    from public.conversations o
    join public.profiles c on c.id = o.client_id
    join public.profiles f on f.id = o.freelancer_id
    where o.id = ${conversationId}
    limit 1
  `;
  const convo = rows[0];
  if (!convo) throw new ConversationError("not_found", "Conversation not found");
  if (convo.client_id !== userId && convo.freelancer_id !== userId) {
    throw new ConversationError("not_found", "Conversation not found");
  }
  return convo;
}

async function assertParticipant(conversationId: string, userId: string): Promise<void> {
  const sql = getDb();
  const rows = await sql<{ client_id: string; freelancer_id: string }[]>`
    select client_id, freelancer_id from public.conversations where id = ${conversationId} limit 1
  `;
  const convo = rows[0];
  if (!convo) throw new ConversationError("not_found", "Conversation not found");
  if (convo.client_id !== userId && convo.freelancer_id !== userId) {
    throw new ConversationError("forbidden", "Not a participant");
  }
}
