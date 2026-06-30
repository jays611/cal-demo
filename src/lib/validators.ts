import { z } from "zod";

// Booking validation schemas
export const createBookingSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  description: z.string().max(2000, "Description too long").optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  visibility: z.enum(["PUBLIC", "PRIVATE", "TEAM_ONLY"]).optional(),
  recurring: z.boolean().optional(),
  recurrenceRule: z
    .string()
    .regex(
      /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/,
      "Invalid recurrence rule format"
    )
    .max(200, "Recurrence rule too long")
    .refine(
      (rule) => {
        // Security: Validate COUNT is not excessive (prevent DoS)
        const countMatch = rule.match(/COUNT=(\d+)/);
        if (countMatch) {
          const count = parseInt(countMatch[1]);
          return count <= 365;
        }
        return true;
      },
      { message: "COUNT must not exceed 365" }
    )
    .refine(
      (rule) => {
        // Security: No CRLF injection
        return !/[\r\n]/.test(rule);
      },
      { message: "Recurrence rule contains invalid characters" }
    )
    .optional(),
  teamId: z.string().optional(),
});

export const updateBookingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  status: z.enum(["CONFIRMED", "CANCELLED", "PENDING"]).optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE", "TEAM_ONLY"]).optional(),
  recurring: z.boolean().optional(),
  recurrenceRule: z
    .string()
    .regex(
      /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/,
      "Invalid recurrence rule format"
    )
    .max(200)
    .refine(
      (rule) => {
        const countMatch = rule.match(/COUNT=(\d+)/);
        if (countMatch) {
          const count = parseInt(countMatch[1]);
          return count <= 365;
        }
        return true;
      },
      { message: "COUNT must not exceed 365" }
    )
    .refine(
      (rule) => !/[\r\n]/.test(rule),
      { message: "Recurrence rule contains invalid characters" }
    )
    .optional(),
});

// ⭐ NEW: Calendar subscription token validation
export const calendarTokenSchema = z.object({
  token: z
    .string()
    .min(32, "Token too short")
    .max(64, "Token too long")
    .regex(/^[A-Za-z0-9_-]+$/, "Token contains invalid characters"),
});

// ⭐ NEW: Team slug validation
export const teamSlugSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Invalid team slug format"),
});

// Type exports
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
export type CalendarTokenInput = z.infer<typeof calendarTokenSchema>;
export type TeamSlugInput = z.infer<typeof teamSlugSchema>;
