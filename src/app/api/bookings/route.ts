import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createBookingSchema } from "@/lib/validators";

// GET /api/bookings — list bookings for the authenticated user
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookings = await db.booking.findMany({
    where: { userId },
    orderBy: { startTime: "asc" },
    include: { team: { select: { name: true, slug: true } } },
  });

  return NextResponse.json({ bookings });
}

// POST /api/bookings — create a new booking
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createBookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const booking = await db.booking.create({
    data: {
      ...parsed.data,
      userId,
    },
  });

  return NextResponse.json({ booking }, { status: 201 });
}
