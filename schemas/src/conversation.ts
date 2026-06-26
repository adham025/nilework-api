import { z } from "zod";

/** Privacy-filtered participant info embedded in conversation listings. */
export const ConversationPartyRefSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

export const ConversationSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  freelancer_id: z.string().uuid(),
  gig_id: z.string().uuid().nullable(),
  last_message_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationWithPartiesSchema = ConversationSchema.extend({
  client: ConversationPartyRefSchema,
  freelancer: ConversationPartyRefSchema,
});
export type ConversationWithParties = z.infer<typeof ConversationWithPartiesSchema>;

export const ConversationListResponseSchema = z.object({
  items: z.array(ConversationWithPartiesSchema),
  next_cursor: z.string().nullable(),
});
export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

/** Start (or reuse) a conversation with a freelancer, optionally about a gig. */
export const ConversationStartSchema = z.object({
  freelancer_id: z.string().uuid(),
  gig_id: z.string().uuid().optional(),
});
export type ConversationStartInput = z.infer<typeof ConversationStartSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  body: z.string(),
  created_at: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

export const MessageListResponseSchema = z.object({
  items: z.array(MessageSchema),
  next_cursor: z.string().nullable(),
});
export type MessageListResponse = z.infer<typeof MessageListResponseSchema>;

export const MessageCreateSchema = z.object({
  body: z.string().min(1).max(5000),
});
export type MessageCreateInput = z.infer<typeof MessageCreateSchema>;
