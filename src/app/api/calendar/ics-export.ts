import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method!== 'GET') {
    return res.status(405).end();
  }

  // Validate user input
  const { bookingId } = req.query;
  if (!bookingId || typeof bookingId!== 'string') {
    return res.status(400).json({ error: 'Invalid booking ID' });
  }

  // Authorization check
  const user = req.headers['x-user-id'];
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Fetch booking data
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // Check if user is authorized to access the booking
  if (booking.privacy === 'PRIVATE' && booking.owner!== user) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Generate ICS export
  const icsContent = generateICSExport(booking);

  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', 'attachment; filename=export.ics');
  res.status(200).send(icsContent);
}

async function getBookingById(id: string) {
  // Mock function to fetch booking data
  return { id, owner: 'user123', privacy: 'PRIVATE' };
}

function generateICSExport(booking) {
  // Mock function to generate ICS export
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//hacksw/handcal//NONSGML v1.0//EN\nBEGIN:VEVENT\nUID:${booking.id}\nDTSTAMP:${new Date().toISOString()}\nSUMMARY:${booking.id}\nEND:VEVENT\nEND:VCALENDAR`;
}