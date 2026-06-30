/**
 * ICS (iCalendar) Generator
 * Generates RFC 5545 compliant ICS calendar feeds
 * 
 * Security: Implements mitigations for threat model findings:
 * - Finding #3 (HIGH): PRIVATE booking time disclosure
 * - Finding #6 (MEDIUM): ICS injection via booking content
 * - Finding #7 (LOW): DoS via recursive RRULE
 */

import { Booking, Team, User } from "@prisma/client";
import { GenerateCalendarOptions } from "./ics-types";
import {
  escapeICS,
  formatICSDate,
  getICSClass,
  validateRRule,
  foldLines,
} from "./ics-utils";

type BookingWithUser = Booking & {
  user: Pick<User, "name" | "email">;
};

/**
 * Generates a complete ICS calendar feed from bookings
 * Implements privacy filtering per AR-9 (Finding #3)
 * 
 * @param bookings - Array of bookings with user information
 * @param team - Team information for calendar metadata
 * @param options - Generation options including userId for privacy filtering
 * @returns RFC 5545 compliant ICS string
 * @throws {TypeError} If input validation fails
 * @throws {RangeError} If team name exceeds maximum length
 */
export function generateCalendar(
  bookings: BookingWithUser[],
  team: { id: string; name: string; slug: string },
  options: GenerateCalendarOptions
): string {
  // Validate inputs
  if (!Array.isArray(bookings)) {
    throw new TypeError("bookings must be an array");
  }
  
  if (!team?.name || typeof team.name !== "string") {
    throw new TypeError("team.name is required and must be a string");
  }
  
  if (team.name.length > 200) {
    throw new RangeError("team.name exceeds maximum length of 200 characters");
  }
  
  if (!options?.userId || typeof options.userId !== "string") {
    throw new TypeError("options.userId is required and must be a string");
  }
  
  // Validate each booking has required user information
  for (const booking of bookings) {
    if (!booking.user?.name || !booking.user?.email) {
      throw new TypeError(
        `Booking ${booking.id} missing required user information (name, email)`
      );
    }
  }

  const lines: string[] = [];

  // VCALENDAR header (RFC 5545 Section 3.6)
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//BookWise//Team Calendar//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push(`X-WR-CALNAME:${escapeICS(team.name)} Team Calendar`);
  lines.push(`X-WR-CALDESC:Bookings for ${escapeICS(team.name)} team`);

  // VEVENT components - one per booking
  for (const booking of bookings) {
    try {
      lines.push(...generateVEvent(booking, options));
    } catch (error) {
      // Log error but continue processing other bookings
      console.error(`Error generating VEVENT for booking ${booking.id}:`, error);
      // Skip this booking and continue with others
    }
  }

  // VCALENDAR footer
  lines.push("END:VCALENDAR");

  // Fold long lines per RFC 5545 Section 3.1
  return foldLines(lines.join("\r\n"));
}

/**
 * Generates a single VEVENT component for a booking
 * Implements privacy filtering (Finding #3 - HIGH)
 * 
 * SECURITY: PRIVATE bookings are shown as "Busy" blocks to non-owners
 * This prevents disclosure of confidential meeting details while
 * still showing time availability.
 * 
 * @param booking - Booking with user information
 * @param options - Generation options with userId for privacy check
 * @returns Array of ICS lines for the VEVENT
 * @throws {Error} If booking data is invalid
 */
function generateVEvent(
  booking: BookingWithUser,
  options: GenerateCalendarOptions
): string[] {
  // Validate required fields
  if (!booking.id || !booking.startTime || !booking.endTime) {
    throw new Error("Booking missing required fields (id, startTime, endTime)");
  }
  
  if (!(booking.startTime instanceof Date) || !(booking.endTime instanceof Date)) {
    throw new Error("Booking startTime and endTime must be Date objects");
  }

  const lines: string[] = [];

  // Privacy filtering (AR-9 - Finding #3: PRIVATE booking time disclosure)
  const isPrivate = booking.visibility === "PRIVATE";
  const isOwner = booking.userId === options.userId;

  lines.push("BEGIN:VEVENT");

  // UID: Globally unique identifier (AR-6)
  lines.push(`UID:${booking.id}@bookwise.example.com`);

  // DTSTAMP: Timestamp of when event was created (required by RFC 5545)
  lines.push(`DTSTAMP:${formatICSDate(new Date())}`);

  // DTSTART/DTEND: Event times in UTC (AR-5)
  lines.push(`DTSTART:${formatICSDate(booking.startTime)}`);
  lines.push(`DTEND:${formatICSDate(booking.endTime)}`);

  // CRITICAL SECURITY: Privacy filtering for PRIVATE bookings
  // Non-owners see only "Busy" without any details
  if (isPrivate && !isOwner) {
    lines.push("SUMMARY:Busy");
    lines.push("CLASS:PRIVATE");
    // NO DESCRIPTION or ORGANIZER for private bookings viewed by non-owners
  } else {
    // Show full details for PUBLIC, TEAM_ONLY, or PRIVATE viewed by owner
    const title = booking.title || "Untitled Event";
    lines.push(`SUMMARY:${escapeICS(title)}`);

    if (booking.description) {
      lines.push(`DESCRIPTION:${escapeICS(booking.description)}`);
    }

    lines.push(`CLASS:${getICSClass(booking.visibility)}`);

    // ORGANIZER: Include creator's contact info (Finding #5 consideration)
    lines.push(
      `ORGANIZER;CN=${escapeICS(booking.user.name)}:mailto:${booking.user.email}`
    );
  }

  // RRULE: Recurrence rule for recurring events (FR-5)
  // Validated to prevent DoS attacks (Finding #7)
  if (booking.recurring && booking.recurrenceRule) {
    const validRRule = validateRRule(booking.recurrenceRule);
    if (validRRule) {
      lines.push(`RRULE:${validRRule}`);
    } else {
      // Log warning but don't fail - just omit invalid RRULE
      console.warn(
        `Invalid RRULE for booking ${booking.id}: ${booking.recurrenceRule}`
      );
    }
  }

  // STATUS: Event confirmation status
  lines.push(
    `STATUS:${booking.status === "PENDING" ? "TENTATIVE" : "CONFIRMED"}`
  );

  lines.push("END:VEVENT");

  return lines;
}
