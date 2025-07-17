const request = require('supertest');
const express = require('express');

// Mock openaiService and createTrip before requiring the router
jest.mock('../services/openai', () => ({
  generateTripPlan: jest.fn().mockResolvedValue({
    content: 'AI trip plan',
    processingTime: 123,
    model: 'gpt-4',
    source: 'mock',
    usage: { prompt_tokens: 10, completion_tokens: 20 }
  }),
  getServiceStatus: jest.fn().mockReturnValue({ status: 'ok', model: 'mock' }),
  testConnection: jest.fn().mockResolvedValue({ success: true, message: 'ok', model: 'mock' })
}));
jest.mock('../services/database', () => ({
  createTrip: jest.fn().mockResolvedValue(true)
}));

const planRouter = require('../routes/plan');
const app = express();
app.use(express.json());
app.use('/api/plan', planRouter);

describe('Plan API', () => {
  describe('POST /api/plan', () => {
    it('should return 400 for invalid request body', async () => {
      const res = await request(app)
        .post('/api/plan')
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 200 and a response for valid request', async () => {
      const validBody = {
        searchData: {
          searchQuery: 'Things to do in Paris',
          filters: {
            timeOfDay: ['morning'],
            environment: 'outdoor',
            planTransit: false,
            groupSize: 'solo',
            planFood: false
          },
          timestamp: new Date().toISOString()
        },
        userMessage: 'I want a fun day outdoors'
      };
      const res = await request(app)
        .post('/api/plan')
        .send(validBody);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.response).toBe('AI trip plan');
      expect(res.body.chatId).toBeDefined();
      expect(res.body.title).toBe('Things to do in Paris');
      expect(res.body.location).toBeDefined();
      expect(res.body.metadata).toBeDefined();
    });
  });

  describe('GET /api/plan/status', () => {
    it('should return service status', async () => {
      const res = await request(app).get('/api/plan/status');
      expect(res.statusCode).toBe(200);
      expect(res.body.service).toBe('Plan API');
      expect(res.body.status).toBe('operational');
      expect(res.body.openai).toBeDefined();
    });
  });

  describe('GET /api/plan/test-ai', () => {
    it('should return OpenAI test result', async () => {
      const res = await request(app).get('/api/plan/test-ai');
      expect([200, 503]).toContain(res.statusCode);
      expect(res.body.service).toBe('OpenAI Test');
      expect(res.body.success).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });
  });
}); 
