import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { teamSlugSchema } from "@/lib/validators";
import crypto from "crypto";

/**
 * POST /api/teams/:slug/calendar/regenerate-token
 * Admin endpoint to regenerate calendar subscription tokens
 * Implements: SR-2 (Token Rotation Capability)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    // 1. Authenticate user (using existing x-user-id header)
    const userId = request.headers.get("x-user-id");

    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // 2. Validate slug
    const slugValidation = teamSlugSchema.safeParse({ slug: params.slug });
    if (!slugValidation.success) {
      return NextResponse.json(
        { error: "Invalid team slug" },
        { status: 400 }
      );
    }

    // 3. Verify admin role and team membership
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        team: {
          select: { slug: true, id: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 403 });
    }

    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin role required" },
        { status: 403 }
      );
    }

    if (user.team?.slug !== params.slug) {
      return NextResponse.json(
        { error: "Not authorized for this team" },
        { status: 403 }
      );
    }

    // 4. Generate new token (cryptographically secure)
    // Security: Uses crypto.randomBytes (not Math.random)
    const newToken = crypto.randomBytes(32).toString("base64url");

    // 5. Update database (immediately invalidates old token)
    const updatedTeam = await db.team.update({
      where: { slug: params.slug },
      data: { calendarToken: newToken },
      select: { id: true, name: true, slug: true },
    });

    // 6. Audit log (security requirement)
    console.log("[CALENDAR_TOKEN_REGENERATED]", {
      timestamp: new Date().toISOString(),
      team: params.slug,
      adminUserId: userId,
      ip:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip"),
    });

    // 7. Return new token with warning
    return NextResponse.json({
      token: newToken,
      message: "Calendar subscription token regenerated successfully",
      warning:
        "All existing calendar subscriptions will stop working. Users must resubscribe with the new URL.",
      team: updatedTeam,
    });
  } catch (error) {
    console.error("[CALENDAR_TOKEN_REGEN_ERROR]", {
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
