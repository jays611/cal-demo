import { NextApiRequest, NextApiResponse } from 'next';
import handler from './route';

describe('Health Check', () => {
  it('should return healthy status', async () => {
    const req: NextApiRequest = {} as NextApiRequest;
    const res: NextApiResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as NextApiResponse;

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'healthy' });
  });
});