/**
 * PlanIT Backend Server
 * 
 * Main server file for the PlanIT trip planning application.
 * Handles API routes for trip planning and chat management.
 * 
 * @author Rongbin Gu (@rongbin99)
 * @version 1.0.0
 */

// ========================================
// IMPORTS
// ========================================
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

// Route imports
const planRoutes = require('./routes/plan');
const chatRoutes = require('./routes/chat');

// ========================================
// CONSTANTS & CONFIGURATION
// ========================================
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ========================================
// EXPRESS APP SETUP
// ========================================
const app = express();

// ========================================
// MIDDLEWARE
// ========================================

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'"],
            "style-src": ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression());

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        
        // List of allowed origins
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:19006', // Expo development server
            'exp://localhost:19000',  // Expo client
            // Add your production domains here
        ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`[Server] CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With']
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[Server] ${new Date().toISOString()} - ${req.method} ${req.path}`);
    console.log(`[Server] Request body:`, req.method !== 'GET' ? req.body : 'N/A');
    next();
});

// ========================================
// ROUTES
// ========================================

// Health check endpoint
app.get('/health', (req, res) => {
    console.log('[Server] Health check requested');
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: NODE_ENV
    });
});

// API routes
app.use('/api/plan', planRoutes);
app.use('/api/chat', chatRoutes);

// Root endpoint
app.get('/', (req, res) => {
    console.log('[Server] Root endpoint accessed');
    res.status(200).json({
        message: 'PlanIT Backend API',
        version: '1.0.0',
        author: 'Rongbin Gu (@rongbin99)',
        endpoints: {
            health: '/health',
            plan: '/api/plan',
            chat: '/api/chat'
        },
        documentation: 'See README.md for API documentation'
    });
});

// ========================================
// ERROR HANDLING
// ========================================

// 404 handler
app.use('*', (req, res) => {
    console.warn(`[Server] 404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Route not found',
        message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('[Server] Global error handler:', error);
    
    // CORS errors
    if (error.message === 'Not allowed by CORS') {
        return res.status(403).json({
            error: 'CORS Error',
            message: 'Origin not allowed by CORS policy',
            timestamp: new Date().toISOString()
        });
    }
    
    // Validation errors
    if (error.isJoi) {
        return res.status(400).json({
            error: 'Validation Error',
            message: error.details[0].message,
            timestamp: new Date().toISOString()
        });
    }
    
    // Default error response
    res.status(error.status || 500).json({
        error: error.name || 'Internal Server Error',
        message: error.message || 'Something went wrong',
        timestamp: new Date().toISOString(),
        ...(NODE_ENV === 'development' && { stack: error.stack })
    });
});

// ========================================
// SERVER STARTUP
// ========================================
const server = app.listen(PORT, () => {
    console.log('========================================');
    console.log('🚀 PlanIT Backend Server Started');
    console.log('========================================');
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Port: ${PORT}`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`Health Check: http://localhost:${PORT}/health`);
    console.log(`API Endpoints:`);
    console.log(`  - Plan: http://localhost:${PORT}/api/plan`);
    console.log(`  - Chat: http://localhost:${PORT}/api/chat`);
    console.log('========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('[Server] SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
    });
});

module.exports = app;
