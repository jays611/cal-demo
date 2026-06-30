import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateICS } from "@/lib/ics-generator";
import { calendarTokenSchema, teamSlugSchema } from "@/lib/validators";
import crypto from "crypto";

/**
 * GET /api/teams/:slug/calendar
 * Calendar feed endpoint for ICS subscription
 * Implements: FR-4, NFR-1, NFR-2, SR-1, SR-4
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const startTime = Date.now();

  try {
    // 1. Extract parameters
    const slug = params.slug;
    const token = request.nextUrl.searchParams.get("token");

    // 2. Input validation (SR-4: Input Validation)
    const slugValidation = teamSlugSchema.safeParse({ slug });
    if (!slugValidation.success) {
      return NextResponse.json(
        { error: "Invalid team slug format" },
        { status: 400 }
      );
    }

    if (!token) {
      return NextResponse.json(
        { error: "Missing token parameter" },
        { status: 401 }
      );
    }

    const tokenValidation = calendarTokenSchema.safeParse({ token });
    if (!tokenValidation.success) {
      return NextResponse.json(
        { error: "Invalid token format" },
        { status: 403 }
      );
    }

    // 3. Authenticate & Authorize (SR-1: Team Membership Verification)
    const team = await db.team.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        calendarToken: true,
      },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    if (!team.calendarToken) {
      return NextResponse.json(
        { error: "Calendar not enabled for this team" },
        { status: 403 }
      );
    }

    // SECURITY: Constant-time token comparison (prevents timing attacks)
    // Critical: Addresses "Timing Attack on Token Comparison" threat
    const isValidToken = crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(team.calendarToken)
    );

    if (!isValidToken) {
      // Audit log failed attempt (SR-3: Audit Logging)
      console.log("[CALENDAR_AUTH_FAILED]", {
        timestamp: new Date().toISOString(),
        team: slug,
        ip:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip"),
        userAgent: request.headers.get("user-agent"),
      });

      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }

    // 4. Query bookings with security filters
    // Security: Time-windowing prevents mass data exfiltration
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const sixMonthsAhead = new Date();
    sixMonthsAhead.setMonth(sixMonthsAhead.getMonth() + 6);

    const bookings = await db.booking.findMany({
      where: {
        teamId: team.id,
        status: "CONFIRMED", // DR-2: Only confirmed bookings
        startTime: {
          gte: sixMonthsAgo, // Security: Prevent mass exfiltration
          lte: sixMonthsAhead,
        },
      },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
      orderBy: { startTime: "asc" },
      take: 1000, // Security: Limit result set
    });

    // 5. Generate ICS (FR-1: ICS Format Export)
    const icsContent = generateICS(bookings, slug);

    // 6. Audit log successful access
    console.log("[CALENDAR_ACCESS]", {
      timestamp: new Date().toISOString(),
      team: slug,
      bookingCount: bookings.length,
      ip:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip"),
      userAgent: request.headers.get("user-agent"),
      duration: Date.now() - startTime,
    });

    // 7. Return with proper headers (NFR-4, NFR-5)
    return new Response(icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="team-${slug}-calendar.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[CALENDAR_ERROR]", {
      timestamp: new Date().toISOString(),
      team: params.slug,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
