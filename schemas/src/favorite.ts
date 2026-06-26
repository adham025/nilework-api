import { z } from "zod";
import { GigListItemSchema } from "./gig.js";

export const FavoriteCreateSchema = z.object({ gig_id: z.string().uuid() });
export const FavoriteStatusSchema = z.object({ favorited: z.boolean() });
export const FavoriteListSchema = z.array(GigListItemSchema);
