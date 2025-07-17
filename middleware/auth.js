/**
 * Authentication Middleware
 * 
 * Handles JWT token validation and user authentication for protected routes.
 * Provides middleware functions for token verification and user extraction.
 * 
 * @author Rongbin Gu (@rongbin99)
 */

// ========================================
// IMPORTS
// ========================================
const jwt = require('jsonwebtoken');
const { getUserById } = require('../services/database');

// ========================================
// CONSTANTS
// ========================================
const TAG = '[AuthMiddleware]';

// ========================================
// MIDDLEWARE FUNCTIONS
// ========================================

/**
 * Verifies JWT token and extracts user information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            console.warn(TAG, 'No token provided');
            return res.status(401).json({
                success: false,
                error: 'Authentication Required',
                message: 'Access token is required',
                timestamp: new Date().toISOString()
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log(TAG, 'Token verified for user:', decoded.userId);

        // Get user from database to ensure user still exists
        const user = await getUserById(decoded.userId);
        
        if (!user) {
            console.warn(TAG, 'User not found for token:', decoded.userId);
            return res.status(401).json({
                success: false,
                error: 'Invalid Token',
                message: 'User associated with token no longer exists',
                timestamp: new Date().toISOString()
            });
        }

        // Add user to request object
        req.user = user;
        req.userId = user.id;
        
        console.log(TAG, 'Authentication successful for user:', user.email);
        next();

    } catch (error) {
        console.error(TAG, 'Token verification failed:', error.message);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Invalid Token',
                message: 'Token is malformed or invalid',
                timestamp: new Date().toISOString()
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token Expired',
                message: 'Access token has expired',
                timestamp: new Date().toISOString()
            });
        }

        return res.status(500).json({
            success: false,
            error: 'Authentication Error',
            message: 'Failed to authenticate token',
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 * Sets req.user if token is valid, otherwise continues without user
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            console.log(TAG, 'No token provided - continuing without authentication');
            req.user = null;
            req.userId = null;
            return next();
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await getUserById(decoded.userId);
        
        if (user) {
            req.user = user;
            req.userId = user.id;
            console.log(TAG, 'Optional authentication successful for user:', user.email);
        } else {
            console.warn(TAG, 'User not found for token - continuing without authentication');
            req.user = null;
            req.userId = null;
        }

        next();

    } catch (error) {
        console.log(TAG, 'Optional authentication failed - continuing without authentication:', error.message);
        req.user = null;
        req.userId = null;
        next();
    }
};

/**
 * Generates JWT token for user
 * @param {Object} user - User object
 * @returns {string} - JWT token
 */
const generateToken = (user) => {
    const payload = {
        userId: user.id,
        email: user.email,
        name: user.name
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    console.log(TAG, 'Token generated for user:', user.email);
    return token;
};

/**
 * Verifies password reset token
 * @param {string} token - Reset token
 * @returns {Object} - Decoded token data
 */
const verifyResetToken = (token) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded;
    } catch (error) {
        throw new Error('Invalid or expired reset token');
    }
};

// ========================================
// EXPORTS
// ========================================

module.exports = {
    authenticateToken,
    optionalAuth,
    generateToken,
    verifyResetToken
}; 
