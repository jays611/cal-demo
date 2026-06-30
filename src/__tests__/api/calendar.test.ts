/**
 * Integration tests for Calendar API Endpoint
 * Tests authentication, authorization, rate limiting, and security headers
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/teams/[slug]/calendar/route";

// Mock Prisma client
vi.mock("@/lib/db", () => ({
  db: {
    team: {
      findUnique: vi.fn(),
    },
    booking: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from "@/lib/db";

const mockTeam = {
  id: "team-123",
  name: "Engineering Team",
  slug: "eng-team",
  members: [{ id: "user-123" }],
  createdAt: new Date(),
};

const mockBookings = [
  {
    id: "booking-1",
    title: "Team Meeting",
    description: "Weekly sync",
    startTime: new Date("2026-07-01T14:00:00.000Z"),
    endTime: new Date("2026-07-01T15:00:00.000Z"),
    status: "CONFIRMED",
    visibility: "PUBLIC",
    recurring: false,
    recurrenceRule: null,
    userId: "user-123",
    teamId: "team-123",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: {
      name: "Alice Smith",
      email: "alice@example.com",
    },
  },
];

describe("GET /api/teams/[slug]/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication (AR-1)", () => {
    it("returns 401 without x-user-id header", async () => {
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar");
      const response = await GET(request, { params: { slug: "eng-team" } });
      
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe("Unauthorized");
    });
  });

  describe("Authorization (AR-2)", () => {
    it("returns 404 for non-existent team (Finding #9)", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(null);
      
      const request = new NextRequest("http://localhost/api/teams/fake-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      const response = await GET(request, { params: { slug: "fake-team" } });
      
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Not found or access denied");
    });

    it("returns 404 for non-members (Finding #2, #9)", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue({
        ...mockTeam,
        members: [], // No matching member
      });
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "non-member-id" },
      });
      const response = await GET(request, { params: { slug: "eng-team" } });
      
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("Not found or access denied");
    });

    it("returns 200 for team members", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      const response = await GET(request, { params: { slug: "eng-team" } });
      
      expect(response.status).toBe(200);
    });
  });

  describe("Input Validation", () => {
    it("returns 400 for invalid slug format", async () => {
      const request = new NextRequest("http://localhost/api/teams/../../../etc/passwd/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      const response = await GET(request, { params: { slug: "../../../etc/passwd" } });
      
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid team identifier");
    });

    it("accepts valid slug format", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team-123/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      const response = await GET(request, { params: { slug: "eng-team-123" } });
      
      expect(response.status).toBe(200);
    });
  });

  describe("Rate Limiting (Finding #8 - MEDIUM)", () => {
    it("allows up to 10 requests per minute", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "rate-limit-test" },
      });
      
      // First 10 requests should succeed
      for (let i = 0; i < 10; i++) {
        const response = await GET(request, { params: { slug: "eng-team" } });
        expect(response.status).toBe(200);
      }
    });

    it("returns 429 after rate limit exceeded", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "rate-limit-test-2" },
      });
      
      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        await GET(request, { params: { slug: "eng-team" } });
      }
      
      // 11th request should be rate limited
      const response = await GET(request, { params: { slug: "eng-team" } });
      expect(response.status).toBe(429);
      
      const body = await response.json();
      expect(body.error).toContain("Rate limit exceeded");
      expect(response.headers.get("Retry-After")).toBe("60");
    });
  });

  describe("Security Headers (Finding #10 - HIGH)", () => {
    it("includes X-Content-Type-Options: nosniff header", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      const response = await GET(request, { params: { slug: "eng-team" } });
      
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("sets Content-Type to text/calendar (AR-4)", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      const response = await GET(request, { params: { slug: "eng-team" } });
      
      expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    });

    it("includes X-Frame-Options: DENY header", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      const response = await GET(request, { params: { slug: "eng-team" } });
      
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("includes Cache-Control header", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      const response = await GET(request, { params: { slug: "eng-team" } });
      
      expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    });
  });

  describe("Database Queries", () => {
    it("queries bookings with correct filters (AR-7, AR-8)", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      await GET(request, { params: { slug: "eng-team" } });
      
      expect(db.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teamId: "team-123",
            status: { not: "CANCELLED" },
            startTime: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it("includes user information in query", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      await GET(request, { params: { slug: "eng-team" } });
      
      expect(db.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            user: expect.objectContaining({
              select: { name: true, email: true },
            }),
          }),
        })
      );
    });

    it("limits results to 1000 bookings", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      await GET(request, { params: { slug: "eng-team" } });
      
      expect(db.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1000,
        })
      );
    });
  });

  describe("ICS Content (FR-1, FR-2)", () => {
    it("returns valid ICS calendar feed", async () => {
      vi.mocked(db.team.findUnique).mockResolvedValue(mockTeam);
      vi.mocked(db.booking.findMany).mockResolvedValue(mockBookings);
      
      const request = new NextRequest("http://localhost/api/teams/eng-team/calendar", {
        headers: { "x-user-id": "user-123" },
      });
      const response = await GET(request, { params: { slug: "eng-team" } });
      
      const body = await response.text();
      expect(body).toContain("BEGIN:VCALENDAR");
      expect(body).toContain("END:VCALENDAR");
      expect(body).toContain("BEGIN:VEVENT");
      expect(body).toContain("END:VEVENT");
    });
  });
});
