import { NextApiRequest, NextApiResponse } from 'next';
import { icsGenerator } from '../../utils/icsGenerator';
import { validateUser } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = validateUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const icsFile = await icsGenerator(user);
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', 'attachment; filename=calendar.ics');
    res.status(200).send(icsFile);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}