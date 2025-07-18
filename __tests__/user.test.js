const request = require('supertest');
const express = require('express');

// Mock database and auth services
const mockCreateUser = jest.fn().mockResolvedValue({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  profileImageUrl: null,
  adventuresCount: 0,
  placesVisitedCount: 0,
  memberSince: '2024-01-01',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01'
});
const mockGetUserByEmail = jest.fn();
const mockUpdateUserPassword = jest.fn().mockResolvedValue(true);
const mockGetUserById = jest.fn().mockResolvedValue({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  profileImageUrl: null,
  adventuresCount: 0,
  placesVisitedCount: 0,
  memberSince: '2024-01-01',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01'
});

jest.mock('../services/database', () => ({
  createUser: (...args) => mockCreateUser(...args),
  getUserByEmail: (...args) => mockGetUserByEmail(...args),
  updateUserPassword: (...args) => mockUpdateUserPassword(...args),
  getUserById: (...args) => mockGetUserById(...args)
}));
jest.mock('../middleware/auth', () => ({
  generateToken: jest.fn().mockReturnValue('mocktoken'),
  authenticateToken: (req, res, next) => {
    req.userId = 'user-1';
    next();
  }
}));

const userRouter = require('../routes/user');
const app = express();
app.use(express.json());
app.use('/api/user', userRouter);

describe('User API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/user/signup', () => {
    it('should return 400 for invalid signup body', async () => {
      const res = await request(app)
        .post('/api/user/signup')
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Validation Error');
    });
    it('should return 201 for valid signup', async () => {
      mockGetUserByEmail.mockResolvedValueOnce(null); // Simulate user does not exist
      const res = await request(app)
        .post('/api/user/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User'
        });
      expect([200, 201]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test@example.com');
    });
    it('should return 409 for duplicate signup', async () => {
      mockGetUserByEmail.mockResolvedValueOnce({ id: 'user-1', email: 'test@example.com' });
      const res = await request(app)
        .post('/api/user/signup')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User'
        });
      expect(res.statusCode).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('User Already Exists');
    });
  });

  describe('POST /api/user/login', () => {
    it('should return 400 for invalid login body', async () => {
      const res = await request(app)
        .post('/api/user/login')
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Validation Error');
    });
    it('should return 200 for valid login', async () => {
      mockGetUserByEmail.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password: '$2b$12$saltsaltsaltsaltsaltsaltsaltsaltsaltsaltsaltsalt',
        profileImageUrl: null,
        adventuresCount: 0,
        placesVisitedCount: 0,
        memberSince: '2024-01-01',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      });
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      const res = await request(app)
        .post('/api/user/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBe('mocktoken');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test@example.com');
    });
    it('should return 401 for invalid password', async () => {
      mockGetUserByEmail.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password: '$2b$12$saltsaltsaltsaltsaltsaltsaltsaltsaltsaltsaltsalt',
        profileImageUrl: null,
        adventuresCount: 0,
        placesVisitedCount: 0,
        memberSince: '2024-01-01',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      });
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);
      const res = await request(app)
        .post('/api/user/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });
      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid Credentials');
    });
  });

  describe('GET /api/user/profile', () => {
    it('should return user profile for authenticated user', async () => {
      const res = await request(app)
        .get('/api/user/profile')
        .set('Authorization', 'Bearer mocktoken');
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('test@example.com');
    });
  });

  describe('POST /api/user/change-password', () => {
    it('should return 400 for invalid body', async () => {
      const res = await request(app)
        .post('/api/user/change-password')
        .set('Authorization', 'Bearer mocktoken')
        .send({});
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Validation Error');
    });
    it('should return 200 for valid password change', async () => {
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      const res = await request(app)
        .post('/api/user/change-password')
        .set('Authorization', 'Bearer mocktoken')
        .send({
          currentPassword: 'password123',
          newPassword: 'newpassword123'
        });
      expect([200, 204]).toContain(res.statusCode);
      expect(res.body.success).toBe(true);
    });
  });
});
