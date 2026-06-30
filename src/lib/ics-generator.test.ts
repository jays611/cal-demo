import { describe, it, expect } from "vitest";
import {
  generateICS,
  buildVEvent,
  escapeICSText,
  formatICSDateTime,
  applyPrivacyFilter,
  foldLines,
  type BookingWithRelations,
} from "./ics-generator";

// Mock data factory
function mockBooking(overrides: Partial<BookingWithRelations> = {}): BookingWithRelations {
  return {
    id: "booking-123",
    title: "Team Meeting",
    description: "Discuss Q3 goals",
    startTime: new Date("2026-07-01T14:00:00Z"),
    endTime: new Date("2026-07-01T15:00:00Z"),
    recurring: false,
    recurrenceRule: null,
    visibility: "PUBLIC",
    status: "CONFIRMED",
    userId: "user-123",
    teamId: "team-123",
    createdAt: new Date(),
    user: {
      name: "Alice Smith",
      email: "alice@example.com",
    },
    ...overrides,
  } as BookingWithRelations;
}

describe("ICS Generator", () => {
  describe("generateICS", () => {
    it("should generate valid VCALENDAR structure", () => {
      const bookings = [mockBooking()];
      const ics = generateICS(bookings, "engineering");

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).toContain("VERSION:2.0");
      expect(ics).toContain("PRODID:-//BookWise//Team Calendar engineering//EN");
      expect(ics).toContain("CALSCALE:GREGORIAN");
      expect(ics).toContain("METHOD:PUBLISH");
    });

    it("should handle multiple bookings", () => {
      const bookings = [
        mockBooking({ id: "1", title: "Meeting 1" }),
        mockBooking({ id: "2", title: "Meeting 2" }),
      ];
      const ics = generateICS(bookings, "engineering");

      const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
      expect(eventCount).toBe(2);
    });

    it("should handle empty booking list", () => {
      const ics = generateICS([], "engineering");

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).not.toContain("BEGIN:VEVENT");
    });

    it("should escape team slug in PRODID", () => {
      const bookings = [mockBooking()];
      const ics = generateICS(bookings, "team;with;semicolons");

      expect(ics).toContain("team\\;with\\;semicolons");
    });
  });

  describe("buildVEvent", () => {
    it("should include all required properties", () => {
      const booking = mockBooking();
      const event = buildVEvent(booking);

      expect(event).toContain("BEGIN:VEVENT");
      expect(event).toContain("END:VEVENT");
      expect(event).toContain("UID:booking-booking-123@bookwise.example.com");
      expect(event).toContain("DTSTAMP:");
      expect(event).toContain("DTSTART:20260701T140000Z");
      expect(event).toContain("DTEND:20260701T150000Z");
      expect(event).toContain("SUMMARY:Team Meeting");
    });

    it("should include RRULE for recurring bookings", () => {
      const booking = mockBooking({
        recurring: true,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      });
      const event = buildVEvent(booking);

      expect(event).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    });

    it("should omit RRULE for non-recurring bookings", () => {
      const booking = mockBooking({ recurring: false });
      const event = buildVEvent(booking);

      expect(event).not.toContain("RRULE:");
    });

    it("should include description if present", () => {
      const booking = mockBooking({ description: "Test description" });
      const event = buildVEvent(booking);

      expect(event).toContain("DESCRIPTION:Test description");
    });

    it("should omit description if null", () => {
      const booking = mockBooking({ description: null });
      const event = buildVEvent(booking);

      expect(event).not.toContain("DESCRIPTION:");
    });

    it("should include ORGANIZER for PUBLIC bookings", () => {
      const booking = mockBooking({ visibility: "PUBLIC" });
      const event = buildVEvent(booking);

      expect(event).toContain('ORGANIZER;CN="Alice Smith":mailto:alice@example.com');
    });

    it("should omit ORGANIZER for PRIVATE bookings", () => {
      const booking = mockBooking({ visibility: "PRIVATE" });
      const event = buildVEvent(booking);

      expect(event).not.toContain("ORGANIZER:");
    });

    it("should set CLASS to PUBLIC for public bookings", () => {
      const booking = mockBooking({ visibility: "PUBLIC" });
      const event = buildVEvent(booking);

      expect(event).toContain("CLASS:PUBLIC");
    });

    it("should set CLASS to PRIVATE for private bookings", () => {
      const booking = mockBooking({ visibility: "PRIVATE" });
      const event = buildVEvent(booking);

      expect(event).toContain("CLASS:PRIVATE");
    });

    it("should set CLASS to CONFIDENTIAL for team-only bookings", () => {
      const booking = mockBooking({ visibility: "TEAM_ONLY" });
      const event = buildVEvent(booking);

      expect(event).toContain("CLASS:CONFIDENTIAL");
    });
  });

  describe("applyPrivacyFilter - PUBLIC", () => {
    it("should show full details for PUBLIC bookings", () => {
      const booking = mockBooking({
        visibility: "PUBLIC",
        title: "Public Meeting",
        description: "Public description",
      });
      const filtered = applyPrivacyFilter(booking);

      expect(filtered).not.toBeNull();
      expect(filtered?.title).toBe("Public Meeting");
      expect(filtered?.description).toBe("Public description");
    });
  });

  describe("applyPrivacyFilter - PRIVATE", () => {
    it("should replace title with 'Busy' for PRIVATE bookings", () => {
      const booking = mockBooking({
        visibility: "PRIVATE",
        title: "Secret Meeting",
        description: "Confidential",
      });
      const filtered = applyPrivacyFilter(booking);

      expect(filtered).not.toBeNull();
      expect(filtered?.title).toBe("Busy");
      expect(filtered?.description).toBeNull();
    });

    it("should preserve start and end times for PRIVATE bookings", () => {
      const booking = mockBooking({ visibility: "PRIVATE" });
      const filtered = applyPrivacyFilter(booking);

      expect(filtered?.startTime).toEqual(booking.startTime);
      expect(filtered?.endTime).toEqual(booking.endTime);
    });

    it("should not expose original title in PRIVATE bookings", () => {
      const booking = mockBooking({
        visibility: "PRIVATE",
        title: "Confidential Board Meeting",
      });
      const filtered = applyPrivacyFilter(booking);

      expect(filtered?.title).not.toContain("Board");
      expect(filtered?.title).not.toContain("Confidential");
    });
  });

  describe("applyPrivacyFilter - TEAM_ONLY", () => {
    it("should show full details for TEAM_ONLY bookings", () => {
      const booking = mockBooking({
        visibility: "TEAM_ONLY",
        title: "Team-Only Meeting",
        description: "Internal discussion",
      });
      const filtered = applyPrivacyFilter(booking);

      expect(filtered).not.toBeNull();
      expect(filtered?.title).toBe("Team-Only Meeting");
      expect(filtered?.description).toBe("Internal discussion");
    });
  });

  describe("escapeICSText", () => {
    it("should escape semicolons", () => {
      expect(escapeICSText("Hello; World")).toBe("Hello\\; World");
    });

    it("should escape commas", () => {
      expect(escapeICSText("Smith, John")).toBe("Smith\\, John");
    });

    it("should escape backslashes", () => {
      expect(escapeICSText("Path\\to\\file")).toBe("Path\\\\to\\\\file");
    });

    it("should escape newlines", () => {
      expect(escapeICSText("Line1\nLine2")).toBe("Line1\\nLine2");
    });

    it("should strip carriage returns", () => {
      expect(escapeICSText("Line1\rLine2")).toBe("Line1Line2");
    });

    it("should prevent CRLF injection", () => {
      const malicious = "Meeting\r\nEND:VEVENT\r\nBEGIN:VEVENT";
      const escaped = escapeICSText(malicious);

      expect(escaped).not.toContain("\r\n");
      expect(escaped).not.toContain("END:VEVENT");
      expect(escaped).toContain("\\n");
    });

    it("should handle empty string", () => {
      expect(escapeICSText("")).toBe("");
    });

    it("should handle Unicode characters", () => {
      expect(escapeICSText("Café ☕")).toBe("Café ☕");
    });

    it("should escape multiple special characters", () => {
      const input = "Title; with, special\\chars\nand newline";
      const escaped = escapeICSText(input);

      expect(escaped).toBe("Title\\; with\\, special\\\\chars\\nand newline");
    });
  });

  describe("formatICSDateTime", () => {
    it("should format date in UTC", () => {
      const date = new Date("2026-06-30T14:30:45Z");
      expect(formatICSDateTime(date)).toBe("20260630T143045Z");
    });

    it("should pad single-digit values", () => {
      const date = new Date("2026-01-05T09:08:07Z");
      expect(formatICSDateTime(date)).toBe("20260105T090807Z");
    });

    it("should handle midnight", () => {
      const date = new Date("2026-07-01T00:00:00Z");
      expect(formatICSDateTime(date)).toBe("20260701T000000Z");
    });

    it("should handle end of year", () => {
      const date = new Date("2026-12-31T23:59:59Z");
      expect(formatICSDateTime(date)).toBe("20261231T235959Z");
    });
  });

  describe("foldLines", () => {
    it("should not fold short lines", () => {
      const short = "SUMMARY:Meeting";
      expect(foldLines(short)).toBe(short);
    });

    it("should fold lines longer than 75 characters", () => {
      const long = "SUMMARY:" + "A".repeat(100);
      const folded = foldLines(long);

      const lines = folded.split("\r\n");
      expect(lines[0]).toHaveLength(75);
      expect(lines[1][0]).toBe(" "); // Continuation starts with space
    });

    it("should handle multiple long lines", () => {
      const content =
        "SUMMARY:" +
        "A".repeat(100) +
        "\r\n" +
        "DESCRIPTION:" +
        "B".repeat(100);
      const folded = foldLines(content);

      expect(folded).toContain("\r\n "); // Continuation marker
    });

    it("should handle exactly 75 character lines", () => {
      const exact = "A".repeat(75);
      const folded = foldLines(exact);

      expect(folded).toBe(exact); // Should not fold
    });
  });

  describe("RRULE validation (security)", () => {
    it("should reject invalid FREQ values", () => {
      const booking = mockBooking({
        recurring: true,
        recurrenceRule: "FREQ=SECONDLY;COUNT=10",
      });
      const event = buildVEvent(booking);

      expect(event).not.toContain("RRULE:"); // Invalid FREQ rejected
    });

    it("should reject COUNT > 365", () => {
      const booking = mockBooking({
        recurring: true,
        recurrenceRule: "FREQ=DAILY;COUNT=999999",
      });
      const event = buildVEvent(booking);

      expect(event).not.toContain("RRULE:"); // Excessive COUNT rejected
    });

    it("should reject RRULE with CRLF injection", () => {
      const booking = mockBooking({
        recurring: true,
        recurrenceRule: "FREQ=DAILY\r\nEND:VEVENT",
      });
      const event = buildVEvent(booking);

      expect(event).not.toContain("RRULE:"); // Injection rejected
    });

    it("should accept valid daily RRULE", () => {
      const booking = mockBooking({
        recurring: true,
        recurrenceRule: "FREQ=DAILY;COUNT=30",
      });
      const event = buildVEvent(booking);

      expect(event).toContain("RRULE:FREQ=DAILY;COUNT=30");
    });

    it("should accept valid weekly RRULE", () => {
      const booking = mockBooking({
        recurring: true,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=20",
      });
      const event = buildVEvent(booking);

      expect(event).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=20");
    });

    it("should accept valid monthly RRULE", () => {
      const booking = mockBooking({
        recurring: true,
        recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=1;COUNT=12",
      });
      const event = buildVEvent(booking);

      expect(event).toContain("RRULE:FREQ=MONTHLY;BYMONTHDAY=1;COUNT=12");
    });

    it("should accept valid yearly RRULE", () => {
      const booking = mockBooking({
        recurring: true,
        recurrenceRule: "FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=4",
      });
      const event = buildVEvent(booking);

      expect(event).toContain("RRULE:FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=4");
    });
  });

  describe("Integration - Full ICS generation", () => {
    it("should generate complete ICS with mixed visibility bookings", () => {
      const bookings = [
        mockBooking({
          id: "1",
          title: "Public Event",
          visibility: "PUBLIC",
        }),
        mockBooking({
          id: "2",
          title: "Secret Event",
          visibility: "PRIVATE",
        }),
        mockBooking({
          id: "3",
          title: "Team Event",
          visibility: "TEAM_ONLY",
        }),
      ];

      const ics = generateICS(bookings, "engineering");

      // Public event shows original title
      expect(ics).toContain("SUMMARY:Public Event");

      // Private event shows "Busy"
      expect(ics).toContain("SUMMARY:Busy");
      expect(ics).not.toContain("Secret Event");

      // Team-only shows original title
      expect(ics).toContain("SUMMARY:Team Event");

      // All events included
      expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(3);
    });

    it("should generate valid ICS with recurring event", () => {
      const bookings = [
        mockBooking({
          recurring: true,
          recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
        }),
      ];

      const ics = generateICS(bookings, "engineering");

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("BEGIN:VEVENT");
      expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
      expect(ics).toContain("END:VEVENT");
      expect(ics).toContain("END:VCALENDAR");
    });
  });
});
