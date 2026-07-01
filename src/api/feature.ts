import { Request, Response } from 'express';

export const featureHandler = (req: Request, res: Response) => {
  // Validate user input
  if (!req.body ||!req.body.data) {
    return res.status(400).send('Invalid input');
  }

  // Enforce authorization checks
  const user = req.user;
  if (!user || (req.body.visibility === 'PRIVATE' &&!user.isTeamMember)) {
    return res.status(403).send('Unauthorized');
  }

  // Redact private bookings for non-members
  let data = req.body.data;
  if (req.body.visibility === 'PRIVATE' &&!user.isTeamMember) {
    data = 'Redacted';
  }

  res.status(200).send(data);
};