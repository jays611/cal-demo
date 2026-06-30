import { Booking, User, Visibility } from "@prisma/client";

/**
 * Type for booking with user relations
 */
export type BookingWithRelations = Booking & {
  user: Pick<User, "name" | "email">;
};

/**
 * Generate RFC 5545 compliant ICS calendar from bookings
 * Implements: FR-1, NFR-3
 *
 * @param bookings - Array of bookings with user relations
 * @param teamSlug - Team slug for PRODID
 * @returns ICS calendar string
 */
export function generateICS(
  bookings: BookingWithRelations[],
  teamSlug: string
): string {
  const events = bookings
    .map((booking) => buildVEvent(booking))
    .filter(Boolean) // Remove null results from privacy filtering
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//BookWise//Team Calendar ${escapeICSText(teamSlug)}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Build single VEVENT component
 * Implements: FR-5, FR-6, DR-1, DR-3, DR-4
 *
 * @param booking - Booking with user relations
 * @returns VEVENT string or null if filtered out
 */
export function buildVEvent(
  booking: BookingWithRelations
): string | null {
  // Apply privacy filter (FR-7, FR-8, FR-9, FR-10)
  const filtered = applyPrivacyFilter(booking);
  if (!filtered) return null;

  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:booking-${booking.id}@bookwise.example.com`, // DR-4: Unique ID
    `DTSTAMP:${formatICSDateTime(new Date())}`, // Current timestamp
    `DTSTART:${formatICSDateTime(booking.startTime)}`, // DR-1: Start time
    `DTEND:${formatICSDateTime(booking.endTime)}`, // DR-1: End time
    `SUMMARY:${escapeICSText(filtered.title)}`, // DR-1: Title (privacy-aware)
  ];

  // Description (optional, privacy-aware)
  if (filtered.description) {
    lines.push(`DESCRIPTION:${escapeICSText(filtered.description)}`);
  }

  // Organizer (DR-3, omitted for PRIVATE)
  if (filtered.visibility !== "PRIVATE" && booking.user) {
    lines.push(
      `ORGANIZER;CN="${escapeICSText(booking.user.name)}":mailto:${booking.user.email}`
    );
  }

  // CLASS property (DR-1.6)
  const classValue =
    filtered.visibility === "PRIVATE"
      ? "PRIVATE"
      : filtered.visibility === "TEAM_ONLY"
        ? "CONFIDENTIAL"
        : "PUBLIC";
  lines.push(`CLASS:${classValue}`);

  // Recurring events (FR-5, FR-6)
  if (booking.recurring && booking.recurrenceRule) {
    // Validate RRULE before including (security)
    if (isValidRRule(booking.recurrenceRule)) {
      lines.push(`RRULE:${booking.recurrenceRule}`);
    } else {
      console.warn(
        `[ICS_GENERATOR] Invalid RRULE for booking ${booking.id}: ${booking.recurrenceRule}`
      );
    }
  }

  lines.push("END:VEVENT");

  return foldLines(lines.join("\r\n")); // NFR-3: Line folding
}

/**
 * Apply privacy transformation based on visibility
 * Implements: FR-7, FR-8, FR-9, FR-10
 *
 * @param booking - Original booking
 * @returns Transformed booking or null if excluded
 */
export function applyPrivacyFilter(
  booking: BookingWithRelations
): BookingWithRelations | null {
  switch (booking.visibility) {
    case "PUBLIC":
      // FR-8: Show all details
      return booking;

    case "PRIVATE":
      // FR-9: Show as "Busy" (Option A - recommended)
      return {
        ...booking,
        title: "Busy",
        description: null,
      };

    case "TEAM_ONLY":
      // FR-10: Show full details to team members (Option A - recommended)
      // Note: Authorization already checked in route handler
      return booking;

    default:
      return booking;
  }
}

/**
 * Escape special characters per RFC 5545
 * Implements: NFR-3: AC-NFR3.6
 * Security: Prevents ICS injection attacks
 *
 * @param text - Text to escape
 * @returns Escaped text safe for ICS
 */
export function escapeICSText(text: string): string {
  if (!text) return "";

  return (
    text
      .replace(/\r\n/g, "\\n") // CRLF → escaped newline (security: prevent injection)
      .replace(/\r/g, "") // Remove standalone CR
      .replace(/\n/g, "\\n") // LF → escaped newline
      .replace(/\\/g, "\\\\") // Backslash
      .replace(/;/g, "\\;") // Semicolon
      .replace(/,/g, "\\,")
  ); // Comma
}

/**
 * Format Date to ICS format (UTC)
 * Implements: NFR-3: AC-NFR3.3
 *
 * @param date - Date to format
 * @returns ICS datetime string (YYYYMMDDTHHMMSSZ)
 */
export function formatICSDateTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

/**
 * Apply line folding at 75 octets per RFC 5545
 * Implements: NFR-3: AC-NFR3.4
 *
 * @param content - Content to fold
 * @returns Folded content
 */
export function foldLines(content: string): string {
  const lines = content.split("\r\n");
  const folded: string[] = [];

  for (const line of lines) {
    if (line.length <= 75) {
      folded.push(line);
    } else {
      // Split at 75 chars, continue with space
      folded.push(line.substring(0, 75));
      let remaining = line.substring(75);
      while (remaining.length > 0) {
        folded.push(" " + remaining.substring(0, 74));
        remaining = remaining.substring(74);
      }
    }
  }

  return folded.join("\r\n");
}

/**
 * Validate RRULE format (security check)
 * Security: Prevents DoS via malicious recurrence rules
 *
 * @param rrule - RRULE string to validate
 * @returns True if valid
 */
function isValidRRule(rrule: string): boolean {
  // Whitelist FREQ values (security: prevent DoS)
  const validFreqs = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
  const freqMatch = rrule.match(/FREQ=(\w+)/);
  if (!freqMatch || !validFreqs.includes(freqMatch[1])) {
    return false;
  }

  // Limit COUNT to prevent DoS
  const countMatch = rrule.match(/COUNT=(\d+)/);
  if (countMatch && parseInt(countMatch[1]) > 365) {
    return false;
  }

  // No injection characters
  if (/[\r\n]/.test(rrule)) {
    return false;
  }

  return true;
}
