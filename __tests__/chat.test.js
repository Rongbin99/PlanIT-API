const request = require('supertest');
const express = require('express');

// Mock database and unsplash services
jest.mock('../services/database', () => ({
  getTrips: jest.fn().mockResolvedValue({
    trips: [
      { id: '1', title: 'Trip 1', location: 'Paris', lastUpdated: '2024-01-01', searchData: {} }
    ],
    pagination: { total: 1, hasMore: false }
  }),
}));
jest.mock('../services/unsplash', () => ({
  addImagesToTrips: jest.fn().mockImplementation(trips => trips)
}));
jest.mock('../middleware/auth', () => ({
  optionalAuth: (req, res, next) => next(),
  authenticateToken: (req, res, next) => next()
}));

const chatRouter = require('../routes/chat');
const app = express();
app.use(express.json());
app.use('/api/chat', chatRouter);

describe('Chat API', () => {
  describe('GET /api/chat', () => {
    it('should return trip history', async () => {
      const res = await request(app).get('/api/chat');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.trips)).toBe(true);
      expect(res.body.trips.length).toBeGreaterThanOrEqual(1);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.metadata).toBeDefined();
    });

    it('should return 400 for invalid query params', async () => {
      const res = await request(app).get('/api/chat?limit=abc');
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Validation Error');
    });
  });
}); 
