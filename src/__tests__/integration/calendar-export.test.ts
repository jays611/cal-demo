import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import crypto from "crypto";

/**
 * Integration tests for Calendar Export API
 * Tests end-to-end flow including authentication, authorization, and ICS generation
 */
describe("Calendar Export API Integration Tests", () => {
  let testTeam: any;
  let testUser: any;
  let testToken: string;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  beforeEach(async () => {
    // Setup: Create test team with token
    testToken = crypto.randomBytes(32).toString("base64url");

    testTeam = await db.team.create({
      data: {
        name: "Test Team",
        slug: "test-team-" + Date.now(),
        calendarToken: testToken,
      },
    });

    testUser = await db.user.create({
      data: {
        name: "Test User",
        email: `test-${Date.now()}@example.com`,
        role: "MEMBER",
        teamId: testTeam.id,
      },
    });
  });

  afterEach(async () => {
    // Cleanup
    await db.booking.deleteMany({ where: { teamId: testTeam.id } });
    await db.user.deleteMany({ where: { teamId: testTeam.id } });
    await db.team.delete({ where: { id: testTeam.id } });
  });

  describe("GET /api/teams/:slug/calendar - Authentication", () => {
    it("should return 401 if token is missing", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar`
      );
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain("Missing token");
    });

    it("should return 403 if token is invalid", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=invalid-token`
      );
      expect(res.status).toBe(403);

      const json = await res.json();
      expect(json.error).toContain("Invalid token");
    });

    it("should return 404 if team does not exist", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/nonexistent-team/calendar?token=${testToken}`
      );
      expect(res.status).toBe(404);
    });

    it("should return 200 with valid token", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(
        "text/calendar; charset=utf-8"
      );
    });
  });

  describe("GET /api/teams/:slug/calendar - Authorization", () => {
    it("should prevent cross-team access", async () => {
      // Create second team with different token
      const otherTeam = await db.team.create({
        data: {
          name: "Other Team",
          slug: "other-team-" + Date.now(),
          calendarToken: "other-token-abc123xyz",
        },
      });

      // Try to access other team's calendar with our token
      const res = await fetch(
        `${baseUrl}/api/teams/${otherTeam.slug}/calendar?token=${testToken}`
      );
      expect(res.status).toBe(403);

      // Cleanup
      await db.team.delete({ where: { id: otherTeam.id } });
    });
  });

  describe("GET /api/teams/:slug/calendar - Content", () => {
    it("should include CONFIRMED bookings in ICS", async () => {
      // Create confirmed booking
      await db.booking.create({
        data: {
          title: "Test Event",
          description: "Test description",
          startTime: new Date("2026-07-01T10:00:00Z"),
          endTime: new Date("2026-07-01T11:00:00Z"),
          status: "CONFIRMED",
          visibility: "PUBLIC",
          recurring: false,
          teamId: testTeam.id,
          userId: testUser.id,
        },
      });

      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      const ics = await res.text();

      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("SUMMARY:Test Event");
      expect(ics).toContain("DESCRIPTION:Test description");
      expect(ics).toContain("BEGIN:VEVENT");
    });

    it("should exclude CANCELLED bookings", async () => {
      await db.booking.create({
        data: {
          title: "Cancelled Event",
          startTime: new Date("2026-07-01T10:00:00Z"),
          endTime: new Date("2026-07-01T11:00:00Z"),
          status: "CANCELLED",
          visibility: "PUBLIC",
          teamId: testTeam.id,
          userId: testUser.id,
        },
      });

      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      const ics = await res.text();

      expect(ics).not.toContain("Cancelled Event");
    });

    it("should exclude PENDING bookings", async () => {
      await db.booking.create({
        data: {
          title: "Pending Event",
          startTime: new Date("2026-07-01T10:00:00Z"),
          endTime: new Date("2026-07-01T11:00:00Z"),
          status: "PENDING",
          visibility: "PUBLIC",
          teamId: testTeam.id,
          userId: testUser.id,
        },
      });

      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      const ics = await res.text();

      expect(ics).not.toContain("Pending Event");
    });
  });

  describe("GET /api/teams/:slug/calendar - Privacy", () => {
    it("should show full details for PUBLIC bookings", async () => {
      await db.booking.create({
        data: {
          title: "Public Meeting",
          description: "Public description",
          startTime: new Date("2026-07-01T10:00:00Z"),
          endTime: new Date("2026-07-01T11:00:00Z"),
          status: "CONFIRMED",
          visibility: "PUBLIC",
          teamId: testTeam.id,
          userId: testUser.id,
        },
      });

      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      const ics = await res.text();

      expect(ics).toContain("SUMMARY:Public Meeting");
      expect(ics).toContain("DESCRIPTION:Public description");
      expect(ics).toContain(`ORGANIZER;CN="Test User":mailto:${testUser.email}`);
    });

    it("should hide details for PRIVATE bookings", async () => {
      await db.booking.create({
        data: {
          title: "Secret Meeting",
          description: "Confidential description",
          startTime: new Date("2026-07-01T10:00:00Z"),
          endTime: new Date("2026-07-01T11:00:00Z"),
          status: "CONFIRMED",
          visibility: "PRIVATE",
          teamId: testTeam.id,
          userId: testUser.id,
        },
      });

      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      const ics = await res.text();

      expect(ics).toContain("SUMMARY:Busy");
      expect(ics).not.toContain("Secret Meeting");
      expect(ics).not.toContain("Confidential description");
      expect(ics).not.toContain("ORGANIZER:");
      expect(ics).toContain("CLASS:PRIVATE");
    });

    it("should show full details for TEAM_ONLY bookings", async () => {
      await db.booking.create({
        data: {
          title: "Team-Only Meeting",
          description: "Team description",
          startTime: new Date("2026-07-01T10:00:00Z"),
          endTime: new Date("2026-07-01T11:00:00Z"),
          status: "CONFIRMED",
          visibility: "TEAM_ONLY",
          teamId: testTeam.id,
          userId: testUser.id,
        },
      });

      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      const ics = await res.text();

      expect(ics).toContain("SUMMARY:Team-Only Meeting");
      expect(ics).toContain("DESCRIPTION:Team description");
      expect(ics).toContain("CLASS:CONFIDENTIAL");
    });
  });

  describe("GET /api/teams/:slug/calendar - Recurring Events", () => {
    it("should include RRULE for recurring bookings", async () => {
      await db.booking.create({
        data: {
          title: "Weekly Standup",
          startTime: new Date("2026-07-01T10:00:00Z"),
          endTime: new Date("2026-07-01T10:30:00Z"),
          status: "CONFIRMED",
          visibility: "PUBLIC",
          recurring: true,
          recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
          teamId: testTeam.id,
          userId: testUser.id,
        },
      });

      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      const ics = await res.text();

      expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    });
  });

  describe("GET /api/teams/:slug/calendar - Headers", () => {
    it("should return correct Content-Type header", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );

      expect(res.headers.get("content-type")).toBe(
        "text/calendar; charset=utf-8"
      );
    });

    it("should return Content-Disposition with filename", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );

      const disposition = res.headers.get("content-disposition");
      expect(disposition).toContain("inline");
      expect(disposition).toContain(
        `filename="team-${testTeam.slug}-calendar.ics"`
      );
    });

    it("should return Cache-Control no-cache header", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );

      const cacheControl = res.headers.get("cache-control");
      expect(cacheControl).toContain("no-cache");
      expect(cacheControl).toContain("no-store");
    });
  });

  describe("POST /api/teams/:slug/calendar/regenerate-token - Token Regeneration", () => {
    it("should require authentication", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar/regenerate-token`,
        { method: "POST" }
      );
      expect(res.status).toBe(401);
    });

    it("should require admin role", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar/regenerate-token`,
        {
          method: "POST",
          headers: { "x-user-id": testUser.id }, // Non-admin user
        }
      );
      expect(res.status).toBe(403);
    });

    it("should regenerate token for admin", async () => {
      // Create admin user
      const admin = await db.user.create({
        data: {
          name: "Admin User",
          email: `admin-${Date.now()}@example.com`,
          role: "ADMIN",
          teamId: testTeam.id,
        },
      });

      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar/regenerate-token`,
        {
          method: "POST",
          headers: { "x-user-id": admin.id },
        }
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.token).toBeDefined();
      expect(json.token).not.toBe(testToken);
      expect(json.warning).toContain("subscriptions will stop working");

      // Verify old token no longer works
      const oldTokenRes = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      expect(oldTokenRes.status).toBe(403);

      // Verify new token works
      const newTokenRes = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${json.token}`
      );
      expect(newTokenRes.status).toBe(200);

      // Cleanup
      await db.user.delete({ where: { id: admin.id } });
    });
  });

  describe("Security - Input Validation", () => {
    it("should reject invalid team slug format", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/INVALID SLUG WITH SPACES/calendar?token=${testToken}`
      );
      expect(res.status).toBe(400);
    });

    it("should reject token with invalid characters", async () => {
      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=invalid!@#$%`
      );
      expect(res.status).toBe(403);
    });
  });

  describe("Security - Time Windowing", () => {
    it("should only return bookings within time window", async () => {
      // Create booking 1 year ago (outside window)
      const oldDate = new Date();
      oldDate.setFullYear(oldDate.getFullYear() - 1);

      await db.booking.create({
        data: {
          title: "Old Event",
          startTime: oldDate,
          endTime: new Date(oldDate.getTime() + 3600000),
          status: "CONFIRMED",
          visibility: "PUBLIC",
          teamId: testTeam.id,
          userId: testUser.id,
        },
      });

      // Create recent booking (within window)
      await db.booking.create({
        data: {
          title: "Recent Event",
          startTime: new Date("2026-07-01T10:00:00Z"),
          endTime: new Date("2026-07-01T11:00:00Z"),
          status: "CONFIRMED",
          visibility: "PUBLIC",
          teamId: testTeam.id,
          userId: testUser.id,
        },
      });

      const res = await fetch(
        `${baseUrl}/api/teams/${testTeam.slug}/calendar?token=${testToken}`
      );
      const ics = await res.text();

      expect(ics).toContain("Recent Event");
      expect(ics).not.toContain("Old Event");
    });
  });
});
