import { NextApiRequest, NextApiResponse } from 'next';
import { exportToICS } from '../../lib/ics-export';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { teamId } = req.query;
    const events = await exportToICS(teamId as string);
    // Convert events to ICS format and handle recurring events
    // Respect booking privacy settings
    res.status(200).send('ICS export logic placeholder');
  } catch (error) {
    res.status(500).send('Error exporting calendar');
  }
}