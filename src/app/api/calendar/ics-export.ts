import { validateUserInput, enforceAuthorization, redactPrivateBookings } from '../utils';

export async function exportICS(userId: string, calendarId: string, bookingId: string) {
  // Validate user inputs
  validateUserInput(userId, calendarId, bookingId);

  // Enforce authorization checks
  enforceAuthorization(userId, calendarId);

  // Redact private bookings for non-members
  const booking = await getBooking(bookingId);
  if (booking.privacy === 'PRIVATE' || booking.privacy === 'TEAM_ONLY') {
    redactPrivateBookings(booking);
  }

  // Generate ICS file
  const icsContent = generateICS(booking);
  return icsContent;
}