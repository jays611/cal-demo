import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/teams/:slug/bookings — list all bookings for a team
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user belongs to this team
  const team = await db.team.findUnique({
    where: { slug: params.slug },
    include: { members: { select: { id: true } } },
  });

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const isMember = team.members.some((m) => m.id === userId);
  if (!isMember) {
    return NextResponse.json({ error: "Not a team member" }, { status: 403 });
  }

  const bookings = await db.booking.findMany({
    where: { teamId: team.id },
    orderBy: { startTime: "asc" },
    include: { user: { select: { name: true } } },
  });

  return NextResponse.json({ bookings, team: { name: team.name, slug: team.slug } });
}
