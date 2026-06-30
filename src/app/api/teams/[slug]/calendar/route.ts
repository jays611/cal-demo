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

// Configuration constants
const RATE_LIMIT = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 60_000, // 1 minute
  CLEANUP_INTERVAL_MS: 5 * 60_000, // 5 minutes
} as const;

const CALENDAR = {
  TIME_WINDOW_DAYS: 90,
  MAX_BOOKINGS: 1000,
  CACHE_MAX_AGE_SECONDS: 3600,
} as const;

const SECURITY = {
  TIMING_DELAY_MS: 50,
} as const;

// Simple in-memory rate limiter (Finding #8 mitigation)
// NOTE: In production, use Redis or similar distributed cache
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const rateLimitLocks = new Map<string, boolean>();

/**
 * Thread-safe rate limit check
 * @param identifier - User ID or IP address
 * @returns true if request is allowed, false if rate limited
 */
function checkRateLimit(identifier: string): boolean {
  // Prevent race conditions with simple lock
  if (rateLimitLocks.get(identifier)) {
    return false; // Already processing for this identifier
  }
  
  rateLimitLocks.set(identifier, true);
  
  try {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record || now > record.resetAt) {
      rateLimitStore.set(identifier, { 
        count: 1, 
        resetAt: now + RATE_LIMIT.WINDOW_MS 
      });
      return true;
    }

    if (record.count >= RATE_LIMIT.MAX_REQUESTS) {
      return false; // Rate limit exceeded
    }

    record.count++;
    return true;
  } finally {
    rateLimitLocks.delete(identifier);
  }
}

// Cleanup expired records periodically
let cleanupIntervalId: NodeJS.Timeout | null = null;

if (typeof window === 'undefined' && !cleanupIntervalId) {
  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, RATE_LIMIT.CLEANUP_INTERVAL_MS);
}

// Cleanup on process exit
if (typeof process !== 'undefined') {
  process.on('SIGTERM', () => {
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = null;
    }
  });
}

/**
 * Validates slug format to prevent path traversal and injection
 */
function validateSlug(slug: string): boolean {
  const slugPattern = /^[a-z0-9-]{3,50}$/;
  return slugPattern.test(slug);
}

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
  try {
    // SECURITY: Input validation - prevent path traversal (Finding #9)
    if (!validateSlug(params.slug)) {
      return NextResponse.json(
        { error: "Invalid team identifier" },
        { status: 400 }
      );
    }

    // SECURITY: Rate limiting (Finding #8 - MEDIUM)
    const userId = request.headers.get("x-user-id");
    const identifier = userId || request.ip || "unknown";

    if (!checkRateLimit(identifier)) {
      // TODO: Add logging for security monitoring
      console.warn(`Rate limit exceeded for identifier: ${identifier}`);
      
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
      return NextResponse.json(
        { error: "Unauthorized" }, 
        { status: 401 }
      );
    }

    // AUTHORIZATION: Team lookup and membership validation (AR-2)
    // SECURITY: Single query to prevent timing attacks (Finding #2 - MEDIUM)
    // IMPORTANT: Do NOT split this into separate queries as it would leak
    // information about team existence via response timing differences
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
      await new Promise((resolve) => setTimeout(resolve, SECURITY.TIMING_DELAY_MS));
      
      // TODO: Add logging for security monitoring
      console.warn(`Unauthorized calendar access attempt: userId=${userId}, slug=${params.slug}, teamExists=${!!team}`);
      
      return NextResponse.json(
        { error: "Not found or access denied" },
        { status: 404 }
      );
    }

    // QUERY BOOKINGS: Apply filters per AR-7, AR-8
    const now = new Date();
    const futureLimit = new Date(
      now.getTime() + CALENDAR.TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    // IMPORTANT: This query includes the user relation to prevent N+1 queries.
    // Do NOT remove the include clause without refactoring the ICS generator.
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
      take: CALENDAR.MAX_BOOKINGS, // Safety limit to prevent excessive data
    });

    // Validate that all bookings have user information
    for (const booking of bookings) {
      if (!booking.user?.name || !booking.user?.email) {
        console.error(`Booking ${booking.id} missing user information`);
        throw new Error("Invalid booking data");
      }
    }

    // GENERATE ICS CONTENT (FR-1, FR-5, FR-6)
    const icsContent = generateCalendar(bookings, team, { userId });

    // RETURN WITH SECURITY HEADERS (Finding #10 - HIGH)
    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8", // AR-4
        "X-Content-Type-Options": "nosniff", // Prevent MIME sniffing (XSS mitigation)
        "Cache-Control": `private, max-age=${CALENDAR.CACHE_MAX_AGE_SECONDS}`,
        "X-Frame-Options": "DENY", // Prevent iframe embedding
        "X-XSS-Protection": "1; mode=block", // Legacy XSS protection
      },
    });
  } catch (error) {
    // Log error details for debugging (but don't expose to client)
    console.error("Calendar export error:", error);
    
    // Return generic error to client
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
