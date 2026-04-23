const request = require('supertest');
const express = require('express');

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

const setupPlanApp = ({ aiService } = {}) => {
  jest.resetModules();

  if (typeof aiService === 'undefined') {
    delete process.env.AI_SERVICE;
  } else {
    process.env.AI_SERVICE = aiService;
  }

  const openaiMock = {
    generateTripPlan: jest.fn().mockResolvedValue({
      content: 'OpenAI trip plan',
      processingTime: 123,
      model: 'gpt-4',
      source: 'openai',
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    }),
    getServiceStatus: jest.fn().mockReturnValue({ status: 'ok', model: 'openai-mock' }),
    testConnection: jest.fn().mockResolvedValue({ success: true, message: 'ok', model: 'openai-mock' })
  };

  const geminiMock = {
    generateTripPlan: jest.fn().mockResolvedValue({
      content: 'Gemini trip plan',
      processingTime: 111,
      model: 'gemini-2.5-flash',
      source: 'gemini',
      usage: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 }
    }),
    getServiceStatus: jest.fn().mockReturnValue({ status: 'ok', model: 'gemini-mock' }),
    testConnection: jest.fn().mockResolvedValue({ success: true, message: 'ok', model: 'gemini-mock' })
  };

  const createTripMock = jest.fn().mockResolvedValue(true);

  jest.doMock('../services/openai', () => openaiMock);
  jest.doMock('../services/gemini', () => geminiMock);
  jest.doMock('../services/database', () => ({
    createTrip: (...args) => createTripMock(...args)
  }));

  const planRouter = require('../routes/plan');
  const app = express();
  app.use(express.json());
  app.use('/api/plan', planRouter);

  return { app, openaiMock, geminiMock, createTripMock };
};

describe('Plan API', () => {
  afterEach(() => {
    delete process.env.AI_SERVICE;
    jest.clearAllMocks();
  });

  describe('POST /api/plan', () => {
    it('should return 400 for invalid request body', async () => {
      const { app } = setupPlanApp();
      const res = await request(app).post('/api/plan').send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should use OpenAI by default when AI_SERVICE is missing', async () => {
      const { app, openaiMock, geminiMock } = setupPlanApp();
      const res = await request(app).post('/api/plan').send(validBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.response).toBe('OpenAI trip plan');
      expect(openaiMock.generateTripPlan).toHaveBeenCalledTimes(1);
      expect(geminiMock.generateTripPlan).not.toHaveBeenCalled();
    });

    it('should use Gemini when AI_SERVICE=gemini', async () => {
      const { app, openaiMock, geminiMock } = setupPlanApp({ aiService: 'gemini' });
      const res = await request(app).post('/api/plan').send(validBody);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.response).toBe('Gemini trip plan');
      expect(geminiMock.generateTripPlan).toHaveBeenCalledTimes(1);
      expect(openaiMock.generateTripPlan).not.toHaveBeenCalled();
    });

    it('should return 500 when AI_SERVICE is invalid', async () => {
      const { app } = setupPlanApp({ aiService: 'invalid-provider' });
      const res = await request(app).post('/api/plan').send(validBody);

      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Internal Server Error');
    });
  });

  describe('GET /api/plan/status', () => {
    it('should return openai status when AI_SERVICE is missing', async () => {
      const { app } = setupPlanApp();
      const res = await request(app).get('/api/plan/status');

      expect(res.statusCode).toBe(200);
      expect(res.body.service).toBe('Plan API');
      expect(res.body.status).toBe('operational');
      expect(res.body.aiClient).toBe('openai');
      expect(res.body.openai).toBeDefined();
    });

    it('should return gemini status when AI_SERVICE=gemini', async () => {
      const { app } = setupPlanApp({ aiService: 'gemini' });
      const res = await request(app).get('/api/plan/status');

      expect(res.statusCode).toBe(200);
      expect(res.body.service).toBe('Plan API');
      expect(res.body.status).toBe('operational');
      expect(res.body.aiClient).toBe('gemini');
      expect(res.body.ai).toBeDefined();
      expect(res.body.openai).toBeUndefined();
    });

    it('should return 500 when AI_SERVICE is invalid', async () => {
      const { app } = setupPlanApp({ aiService: 'invalid-provider' });
      const res = await request(app).get('/api/plan/status');

      expect(res.statusCode).toBe(500);
      expect(res.body.service).toBe('Plan API');
      expect(res.body.status).toBe('error');
      expect(res.body.message).toBeDefined();
    });
  });

  describe('GET /api/plan/test-ai', () => {
    it('should return OpenAI test result by default', async () => {
      const { app } = setupPlanApp();
      const res = await request(app).get('/api/plan/test-ai');

      expect([200, 503]).toContain(res.statusCode);
      expect(res.body.service).toBe('OpenAI Test');
      expect(res.body.success).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    it('should return Gemini test result when AI_SERVICE=gemini', async () => {
      const { app } = setupPlanApp({ aiService: 'gemini' });
      const res = await request(app).get('/api/plan/test-ai');

      expect([200, 503]).toContain(res.statusCode);
      expect(res.body.service).toBe('Gemini Test');
      expect(res.body.success).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });

    it('should return 500 when AI_SERVICE is invalid', async () => {
      const { app } = setupPlanApp({ aiService: 'invalid-provider' });
      const res = await request(app).get('/api/plan/test-ai');

      expect(res.statusCode).toBe(500);
      expect(res.body.service).toBe('AI Test');
      expect(res.body.success).toBe(false);
      expect(res.body.timestamp).toBeDefined();
    });
  });
});
