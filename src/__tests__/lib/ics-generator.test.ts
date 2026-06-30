/**
 * Unit tests for ICS Generator
 * Tests RFC 5545 compliance, privacy filtering, and security mitigations
 */

import { describe, it, expect } from "vitest";
import { generateCalendar } from "@/lib/ics-generator";
import { escapeICS, validateRRule, formatICSDate } from "@/lib/ics-utils";

// Mock data
const mockTeam = {
  id: "team-123",
  name: "Engineering Team",
  slug: "eng-team",
};

const mockUser = {
  name: "Alice Smith",
  email: "alice@example.com",
};

const mockBooking = {
  id: "booking-123",
  title: "Team Meeting",
  description: "Weekly sync",
  startTime: new Date("2026-07-01T14:00:00.000Z"),
  endTime: new Date("2026-07-01T15:00:00.000Z"),
  status: "CONFIRMED" as const,
  visibility: "PUBLIC" as const,
  recurring: false,
  recurrenceRule: null,
  userId: "user-123",
  teamId: "team-123",
  createdAt: new Date(),
  updatedAt: new Date(),
  user: mockUser,
};

describe("ICS Generator", () => {
  describe("generateCalendar", () => {
    it("generates valid VCALENDAR wrapper (FR-1)", () => {
      const ics = generateCalendar([], mockTeam, { userId: "user-1" });
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("VERSION:2.0");
      expect(ics).toContain("PRODID:-//BookWise//Team Calendar//EN");
      expect(ics).toContain("END:VCALENDAR");
    });

    it("includes team name in calendar metadata (FR-7)", () => {
      const ics = generateCalendar([], mockTeam, { userId: "user-1" });
      expect(ics).toContain("Engineering Team");
    });

    it("includes VEVENT for each booking", () => {
      const bookings = [mockBooking, { ...mockBooking, id: "booking-456" }];
      const ics = generateCalendar(bookings, mockTeam, { userId: "user-1" });
      const eventMatches = ics.match(/BEGIN:VEVENT/g);
      expect(eventMatches).toHaveLength(2);
    });

    it("includes all required VEVENT properties (AR-3)", () => {
      const ics = generateCalendar([mockBooking], mockTeam, { userId: "user-1" });
      expect(ics).toContain("UID:");
      expect(ics).toContain("DTSTAMP:");
      expect(ics).toContain("DTSTART:");
      expect(ics).toContain("DTEND:");
      expect(ics).toContain("SUMMARY:");
      expect(ics).toContain("STATUS:");
    });

    it("uses globally unique UID format (AR-6)", () => {
      const ics = generateCalendar([mockBooking], mockTeam, { userId: "user-1" });
      expect(ics).toContain("UID:booking-123@bookwise.example.com");
    });

    it("formats dates in UTC with Z suffix (AR-5)", () => {
      const ics = generateCalendar([mockBooking], mockTeam, { userId: "user-1" });
      expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
      expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/);
    });
  });

  describe("Privacy Filtering (Finding #3 - HIGH)", () => {
    it("shows full details for PUBLIC bookings", () => {
      const publicBooking = { ...mockBooking, visibility: "PUBLIC" as const };
      const ics = generateCalendar([publicBooking], mockTeam, { userId: "viewer-456" });
      expect(ics).toContain("SUMMARY:Team Meeting");
      expect(ics).toContain("DESCRIPTION:Weekly sync");
      expect(ics).toContain("CLASS:PUBLIC");
    });

    it("hides PRIVATE booking details from non-owners (FR-6, AR-9)", () => {
      const privateBooking = {
        ...mockBooking,
        visibility: "PRIVATE" as const,
        title: "1:1 Performance Review",
        description: "Confidential discussion",
        userId: "owner-123",
      };
      const ics = generateCalendar([privateBooking], mockTeam, { userId: "viewer-456" });
      
      // Should show "Busy" instead of real title
      expect(ics).toContain("SUMMARY:Busy");
      expect(ics).toContain("CLASS:PRIVATE");
      
      // Should NOT contain real details
      expect(ics).not.toContain("Performance Review");
      expect(ics).not.toContain("Confidential discussion");
      expect(ics).not.toContain("ORGANIZER"); // No organizer for private bookings
    });

    it("shows PRIVATE booking details to owner", () => {
      const privateBooking = {
        ...mockBooking,
        visibility: "PRIVATE" as const,
        title: "1:1 Performance Review",
        userId: "owner-123",
      };
      const ics = generateCalendar([privateBooking], mockTeam, { userId: "owner-123" });
      
      expect(ics).toContain("SUMMARY:1:1 Performance Review");
      expect(ics).toContain("CLASS:PRIVATE");
    });

    it("shows TEAM_ONLY bookings with CONFIDENTIAL class", () => {
      const teamBooking = { ...mockBooking, visibility: "TEAM_ONLY" as const };
      const ics = generateCalendar([teamBooking], mockTeam, { userId: "member-123" });
      expect(ics).toContain("SUMMARY:Team Meeting");
      expect(ics).toContain("CLASS:CONFIDENTIAL");
    });
  });

  describe("Recurring Events (FR-5)", () => {
    it("includes RRULE for recurring events", () => {
      const recurringBooking = {
        ...mockBooking,
        recurring: true,
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      };
      const ics = generateCalendar([recurringBooking], mockTeam, { userId: "user-1" });
      expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    });

    it("omits RRULE for non-recurring events", () => {
      const ics = generateCalendar([mockBooking], mockTeam, { userId: "user-1" });
      expect(ics).not.toContain("RRULE:");
    });

    it("validates RRULE before including (Finding #7)", () => {
      const maliciousBooking = {
        ...mockBooking,
        recurring: true,
        recurrenceRule: "FREQ=SECONDLY;COUNT=999999", // Should be rejected
      };
      const ics = generateCalendar([maliciousBooking], mockTeam, { userId: "user-1" });
      expect(ics).not.toContain("COUNT=999999");
    });
  });

  describe("Security - ICS Injection Prevention (Finding #6)", () => {
    it("prevents CRLF injection in booking titles", () => {
      const maliciousBooking = {
        ...mockBooking,
        title: "Meeting\r\nUID:injected@evil.com\r\nBEGIN:VEVENT",
      };
      const ics = generateCalendar([maliciousBooking], mockTeam, { userId: "user-1" });
      
      // Should have only 1 UID (the legitimate one)
      const uidMatches = ics.match(/UID:booking-123@bookwise.example.com/g);
      expect(uidMatches).toHaveLength(1);
      
      // Should not contain injected content
      expect(ics).not.toContain("UID:injected@evil.com");
      
      // Should have only 1 VEVENT
      const eventMatches = ics.match(/BEGIN:VEVENT/g);
      expect(eventMatches).toHaveLength(1);
    });

    it("strips HTML from booking titles", () => {
      const xssBooking = {
        ...mockBooking,
        title: "<script>alert('XSS')</script>Team Meeting",
        description: "<img src=x onerror=alert(1)>",
      };
      const ics = generateCalendar([xssBooking], mockTeam, { userId: "user-1" });
      
      expect(ics).not.toContain("<script>");
      expect(ics).not.toContain("<img");
      expect(ics).toContain("Team Meeting");
    });

    it("escapes ICS special characters", () => {
      const specialCharsBooking = {
        ...mockBooking,
        title: "Meeting; with, special\\characters",
      };
      const ics = generateCalendar([specialCharsBooking], mockTeam, { userId: "user-1" });
      
      expect(ics).toContain("\\;"); // Escaped semicolon
      expect(ics).toContain("\\,"); // Escaped comma
      expect(ics).toContain("\\\\"); // Escaped backslash
    });

    it("limits title length to prevent DoS", () => {
      const longTitle = "A".repeat(2000);
      const longBooking = { ...mockBooking, title: longTitle };
      const ics = generateCalendar([longBooking], mockTeam, { userId: "user-1" });
      
      // Title should be truncated to 1000 characters
      const summaryMatch = ics.match(/SUMMARY:([^\r\n]+)/);
      expect(summaryMatch).toBeDefined();
      const summaryValue = summaryMatch![1];
      expect(summaryValue.length).toBeLessThanOrEqual(1000);
    });
  });

  describe("Line Folding (AR-3)", () => {
    it("folds long lines at 75 characters", () => {
      const longTitle = "A".repeat(100);
      const booking = { ...mockBooking, title: longTitle };
      const ics = generateCalendar([booking], mockTeam, { userId: "user-1" });
      
      const lines = ics.split("\r\n");
      const longLines = lines.filter(line => line.length > 75);
      
      // All lines should be ≤ 75 characters
      expect(longLines.length).toBe(0);
    });

    it("continues folded lines with space", () => {
      const longTitle = "A".repeat(100);
      const booking = { ...mockBooking, title: longTitle };
      const ics = generateCalendar([booking], mockTeam, { userId: "user-1" });
      
      // Folded lines should start with space
      const lines = ics.split("\r\n");
      const foldedLines = lines.filter(line => line.startsWith(" "));
      expect(foldedLines.length).toBeGreaterThan(0);
    });
  });
});

describe("ICS Utils", () => {
  describe("escapeICS", () => {
    it("escapes backslash", () => {
      expect(escapeICS("test\\value")).toBe("test\\\\value");
    });

    it("escapes semicolon", () => {
      expect(escapeICS("test;value")).toBe("test\\;value");
    });

    it("escapes comma", () => {
      expect(escapeICS("test,value")).toBe("test\\,value");
    });

    it("escapes newline", () => {
      expect(escapeICS("test\nvalue")).toBe("test\\nvalue");
    });

    it("removes carriage return", () => {
      expect(escapeICS("test\r\nvalue")).toBe("test\\nvalue");
    });

    it("strips HTML tags", () => {
      expect(escapeICS("<script>alert(1)</script>")).toBe("");
      expect(escapeICS("Test<br>Value")).toBe("TestValue");
    });
  });

  describe("validateRRule (Finding #7 - LOW)", () => {
    it("accepts valid daily recurrence", () => {
      const result = validateRRule("FREQ=DAILY;INTERVAL=1;COUNT=30");
      expect(result).toBe("FREQ=DAILY;INTERVAL=1;COUNT=30");
    });

    it("accepts valid weekly recurrence", () => {
      const result = validateRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=1");
      expect(result).toContain("FREQ=WEEKLY");
      expect(result).toContain("BYDAY=MO,WE,FR");
    });

    it("rejects FREQ=SECONDLY", () => {
      const result = validateRRule("FREQ=SECONDLY;INTERVAL=1");
      expect(result).toBeNull();
    });

    it("rejects COUNT > 1000", () => {
      const result = validateRRule("FREQ=DAILY;COUNT=999999");
      expect(result).toBeNull();
    });

    it("rejects INTERVAL > 365", () => {
      const result = validateRRule("FREQ=DAILY;INTERVAL=999");
      expect(result).toBeNull();
    });

    it("rejects invalid characters", () => {
      const result = validateRRule("FREQ=DAILY;<script>alert(1)</script>");
      expect(result).toBeNull();
    });

    it("returns null for null input", () => {
      const result = validateRRule(null);
      expect(result).toBeNull();
    });
  });

  describe("formatICSDate", () => {
    it("formats date in YYYYMMDDTHHmmssZ format", () => {
      const date = new Date("2026-07-01T14:30:00.000Z");
      const formatted = formatICSDate(date);
      expect(formatted).toBe("20260701T143000Z");
    });

    it("includes Z suffix for UTC", () => {
      const date = new Date();
      const formatted = formatICSDate(date);
      expect(formatted).toMatch(/^\d{8}T\d{6}Z$/);
    });
  });
});
