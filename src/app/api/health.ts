import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const timestamp = new Date().toISOString();
  const nodeVersion = process.version;
  res.status(200).json({ status: 'ok', timestamp, nodeVersion });
}