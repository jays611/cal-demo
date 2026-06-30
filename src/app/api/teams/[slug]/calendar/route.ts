/**
 * Team Calendar ICS Export API Endpoint
 * GET /api/teams/[slug]/calendar
 * 
 * Returns RFC 5545 compliant ICS calendar feed for team bookings
 * 
 * Security: Implements mitigations for threat model findings:
 * - Finding #2 (MEDIUM): Timing attack on team membership validation
 * - Finding #8 (MEDIUM): Rate limiting
 * - Finding #9 (LOW): Team existence disclosure via error messages
 * - Finding #10 (HIGH): XSS via MIME type manipulation
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateCalendar } from "@/lib/ics-generator";

// Simple in-memory rate limiter (Finding #8 mitigation)
// In production, use Redis or similar distributed cache
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(identifier, { count: 1, resetAt: now + 60000 }); // 60 second window
    return true;
  }

  if (record.count >= 10) {
    return false; // Rate limit: 10 requests per minute
  }

  record.count++;
  return true;
}

// Cleanup expired records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // Every 5 minutes

/**
 * GET handler for team calendar export
 * 
 * Authentication: Requires x-user-id header
 * Authorization: User must be member of the team
 * 
 * @returns ICS calendar feed with Content-Type: text/calendar
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  // SECURITY: Input validation - prevent path traversal (Finding #9)
  const slugPattern = /^[a-z0-9-]{3,50}$/;
  if (!slugPattern.test(params.slug)) {
    return NextResponse.json(
      { error: "Invalid team identifier" },
      { status: 400 }
    );
  }

  // SECURITY: Rate limiting (Finding #8 - MEDIUM)
  const userId = request.headers.get("x-user-id");
  const identifier = userId || request.ip || "unknown";

  if (!checkRateLimit(identifier)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": "60" },
      }
    );
  }

  // AUTHENTICATION: Require x-user-id header (AR-1)
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // AUTHORIZATION: Team lookup and membership validation (AR-2)
  // SECURITY: Single query to prevent timing attacks (Finding #2 - MEDIUM)
  const team = await db.team.findUnique({
    where: { slug: params.slug },
    include: {
      members: {
        where: { id: userId },
        select: { id: true },
      },
    },
  });

  // SECURITY: Generic error for both "team not found" and "not a member"
  // Prevents team existence disclosure (Finding #2, #9)
  if (!team || team.members.length === 0) {
    // Add small delay to normalize timing
    await new Promise((resolve) => setTimeout(resolve, 50));
    return NextResponse.json(
      { error: "Not found or access denied" },
      { status: 404 }
    );
  }

  // QUERY BOOKINGS: Apply filters per AR-7, AR-8
  const now = new Date();
  const futureLimit = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

  const bookings = await db.booking.findMany({
    where: {
      teamId: team.id,
      status: { not: "CANCELLED" }, // AR-8: Exclude cancelled bookings
      startTime: {
        gte: now,
        lte: futureLimit, // AR-7: Time window limitation (90 days)
      },
    },
    orderBy: { startTime: "asc" },
    include: {
      user: {
        select: { name: true, email: true },
      },
    },
    take: 1000, // Safety limit to prevent excessive data
  });

  // GENERATE ICS CONTENT (FR-1, FR-5, FR-6)
  const icsContent = generateCalendar(bookings, team, { userId });

  // RETURN WITH SECURITY HEADERS (Finding #10 - HIGH)
  return new NextResponse(icsContent, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8", // AR-4
      "X-Content-Type-Options": "nosniff", // Prevent MIME sniffing (XSS mitigation)
      "Cache-Control": "private, max-age=3600", // 1 hour cache
      "X-Frame-Options": "DENY", // Prevent iframe embedding
      "X-XSS-Protection": "1; mode=block", // Legacy XSS protection
    },
  });
}
