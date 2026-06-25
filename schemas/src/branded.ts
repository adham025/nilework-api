import { z } from "zod";

/**
 * Branded (nominal) types — MASTER_PLAN §6.10.
 *
 * Every entity ID is a distinct compile-time type, so passing a `FreelancerId`
 * where a `ClientId` is expected is a type error, not a runtime bug that slips
 * through because both are plain strings.
 */
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type UserId = Brand<string, "UserId">;
export type ProfileId = Brand<string, "ProfileId">;
export type GigId = Brand<string, "GigId">;
export type ProjectId = Brand<string, "ProjectId">;
export type ProposalId = Brand<string, "ProposalId">;
export type OrderId = Brand<string, "OrderId">;
export type OfferId = Brand<string, "OfferId">;
export type ConversationId = Brand<string, "ConversationId">;
export type MessageId = Brand<string, "MessageId">;
export type ReviewId = Brand<string, "ReviewId">;
export type WalletId = Brand<string, "WalletId">;
export type LedgerEntryId = Brand<string, "LedgerEntryId">;
export type DisputeId = Brand<string, "DisputeId">;
export type PromoCodeId = Brand<string, "PromoCodeId">;
export type StaffUserId = Brand<string, "StaffUserId">;

/** Build a Zod schema that validates a UUID and brands the output type. */
const brandedUuid = <B>() => z.string().uuid() as unknown as z.ZodType<B>;

export const UserIdSchema = brandedUuid<UserId>();
export const ProfileIdSchema = brandedUuid<ProfileId>();
export const GigIdSchema = brandedUuid<GigId>();
export const ProjectIdSchema = brandedUuid<ProjectId>();
export const ProposalIdSchema = brandedUuid<ProposalId>();
export const OrderIdSchema = brandedUuid<OrderId>();
export const OfferIdSchema = brandedUuid<OfferId>();
export const ConversationIdSchema = brandedUuid<ConversationId>();
export const MessageIdSchema = brandedUuid<MessageId>();
export const ReviewIdSchema = brandedUuid<ReviewId>();
export const WalletIdSchema = brandedUuid<WalletId>();
export const LedgerEntryIdSchema = brandedUuid<LedgerEntryId>();
export const DisputeIdSchema = brandedUuid<DisputeId>();
export const PromoCodeIdSchema = brandedUuid<PromoCodeId>();
export const StaffUserIdSchema = brandedUuid<StaffUserId>();
