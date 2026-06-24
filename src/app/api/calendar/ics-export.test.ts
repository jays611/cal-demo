import { NextApiRequest, NextApiResponse } from 'next';
import handler from './ics-export';

describe('ICS Export API', () => {
  it('should return 400 for invalid booking ID', async () => {
    const req = { query: { bookingId: '' }, headers: { 'x-user-id': 'user123' } } as NextApiRequest;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as unknown as NextApiResponse;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid booking ID' });
  });

  it('should return 401 for unauthorized user', async () => {
    const req = { query: { bookingId: 'valid-id' }, headers: {} } as NextApiRequest;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as unknown as NextApiResponse;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should return 404 for non-existent booking', async () => {
    const req = { query: { bookingId: 'non-existent-id' }, headers: { 'x-user-id': 'user123' } } as NextApiRequest;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() } as unknown as NextApiResponse;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Booking not found' });
  });

  it('should return 200 and ICS content for valid request', async () => {
    const req = { query: { bookingId: 'valid-id' }, headers: { 'x-user-id': 'user123' } } as NextApiRequest;
    const res = { status: jest.fn().mockReturnThis(), send: jest.fn(), setHeader: jest.fn() } as unknown as NextApiResponse;
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/calendar');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename=export.ics');
  });
});