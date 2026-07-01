import { featureHandler } from '../api/feature';
import { Request, Response } from 'express';
import { describe, it, expect } from '@jest/globals';

describe('featureHandler', () => {
  it('should return 400 for invalid input', () => {
    const req = { body: {} } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response;
    featureHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith('Invalid input');
  });

  it('should return 403 for unauthorized access', () => {
    const req = { body: { data: 'test', visibility: 'PRIVATE' }, user: {} } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response;
    featureHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Unauthorized');
  });

  it('should redact private data for non-members', () => {
    const req = { body: { data: 'test', visibility: 'PRIVATE' }, user: { isTeamMember: false } } as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as Response;
    featureHandler(req, res);
    expect(res.send).toHaveBeenCalledWith('Redacted');
  });
});