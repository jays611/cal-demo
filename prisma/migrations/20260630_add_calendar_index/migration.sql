-- Migration: Add index for calendar queries
-- CreateIndex for efficient booking queries by team, status, and time

-- This index optimizes the calendar export query:
-- WHERE teamId = ? AND status != 'CANCELLED' AND startTime BETWEEN ? AND ?

CREATE INDEX IF NOT EXISTS "idx_booking_team_status_time" 
ON "Booking" ("teamId", "status", "startTime")
WHERE "status" != 'CANCELLED';

-- This partial index only includes non-cancelled bookings,
-- reducing index size and improving query performance
