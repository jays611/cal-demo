import { z } from "zod";

export const createBookingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  visibility: z.enum(["PUBLIC", "PRIVATE", "TEAM_ONLY"]).default("PUBLIC"),
  recurring: z.boolean().default(false),
  recurrenceRule: z.string().optional(),
  teamId: z.string().optional(),
});

export const updateBookingSchema = createBookingSchema.partial().extend({
  status: z.enum(["CONFIRMED", "CANCELLED", "PENDING"]).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
