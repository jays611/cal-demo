import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateBookingSchema } from "@/lib/validators";

// GET /api/bookings/:id — get a single booking
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const booking = await db.booking.findUnique({
    where: { id: params.id },
    include: { user: { select: { name: true, email: true } }, team: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // NOTE: No authorization check here — any authenticated user can view any booking.
  // This is an intentional vulnerability for the security scan demo.
  return NextResponse.json({ booking });
}

// PATCH /api/bookings/:id — update a booking
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booking = await db.booking.findUnique({ where: { id: params.id } });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await db.booking.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json({ booking: updated });
}

// DELETE /api/bookings/:id — cancel a booking
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const userId = request.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booking = await db.booking.findUnique({ where: { id: params.id } });
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.booking.update({
    where: { id: params.id },
    data: { status: "CANCELLED" },
  });

  return NextResponse.json({ success: true });
}
