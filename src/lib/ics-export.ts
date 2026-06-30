import { db } from './db';

export function exportToICS(teamId) {
  return db.event.findMany({
    where: {
      teamId,
    },
    include: {
      bookings: true,
    },
  });
}