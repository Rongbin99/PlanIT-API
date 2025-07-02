/**
 * PlanIT Backend Server
 * 
 * Main server file for the PlanIT trip planning application.
 * Handles API routes for trip planning and chat management.
 * 
 * @author Rongbin Gu (@rongbin99)
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

const planRoutes = require('./routes/plan');
const chatRoutes = require('./routes/chat');
const { initializeDatabase, seedDatabase, testConnection, closeDatabase } = require('./services/database');

// ========================================
// CONSTANTS & CONFIGURATION
// ========================================
const PORT = process.env.PORT
const NODE_ENV = process.env.NODE_ENV
const LIMITS = {
    MAX_FILE_SIZE: '10mb',
    MAX_REQUEST_SIZE: '10mb',
}
const TAG = '[Server]';

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
        if (!origin) return callback(null, true);
        
        const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
        
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
app.use(express.json({ limit: LIMITS.MAX_REQUEST_SIZE }));
app.use(express.urlencoded({ extended: true, limit: LIMITS.MAX_REQUEST_SIZE }));

// Logging middleware
if (NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Request logging middleware
app.use((req, res, next) => {
    console.log(TAG, `${new Date().toISOString()} - ${req.method} ${req.path}`);
    console.log(TAG, `Request body:`, req.method !== 'GET' ? req.body : 'N/A');
    next();
});

// ========================================
// ROUTES
// ========================================

// Health check endpoint with comprehensive metrics
app.get('/status', async (req, res) => {
    const startTime = process.hrtime.bigint();
    console.log(TAG, 'Health check requested');
    
    try {
        // System metrics
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const uptime = process.uptime();
        
        // Calculate response latency
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1000000; // Convert nanoseconds to milliseconds
        
        // External service checks
        const serviceChecks = {};
        
        // Check OpenAI API connectivity (if API key is configured)
        if (process.env.OPENAI_API_KEY) {
            try {
                const { testConnection } = require('./services/openai');
                serviceChecks.openai = await testConnection();
            } catch (error) {
                serviceChecks.openai = { status: 'error', message: error.message };
            }
        } else {
            serviceChecks.openai = { status: 'not_configured', message: 'API key not set' };
        }
        
        // Check Unsplash API connectivity (if API key is configured)
        if (process.env.UNSPLASH_API_KEY) {
            try {
                const { testConnection: testUnsplashConnection } = require('./services/unsplash');
                serviceChecks.unsplash = await testUnsplashConnection();
            } catch (error) {
                serviceChecks.unsplash = { status: 'error', message: error.message };
            }
        } else {
            serviceChecks.unsplash = { status: 'not_configured', message: 'API key not set' };
        }
        
        // Check PostgreSQL database connectivity
        try {
            serviceChecks.database = await testConnection();
        } catch (error) {
            serviceChecks.database = { status: 'error', message: error.message };
        }
        
        const healthData = {
            status: 'online',
            timestamp: new Date().toISOString(),
            environment: NODE_ENV,
            server: {
                uptime: {
                    seconds: Math.floor(uptime),
                    formatted: formatUptime(uptime)
                },
                latency: {
                    response_time_ms: parseFloat(latencyMs.toFixed(2)),
                    status: latencyMs < 100 ? 'excellent' : latencyMs < 500 ? 'good' : 'slow'
                },
                memory: {
                    rss_mb: Math.round(memoryUsage.rss / 1024 / 1024),
                    heap_used_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    heap_total_mb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    external_mb: Math.round(memoryUsage.external / 1024 / 1024),
                    heap_usage_percent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
                },
                cpu: {
                    user_microseconds: cpuUsage.user,
                    system_microseconds: cpuUsage.system
                },
                process: {
                    pid: process.pid,
                    node_version: process.version,
                    platform: process.platform,
                    arch: process.arch
                }
            },
            api: {
                endpoints: {
                    plan: '/api/plan',
                    chat: '/api/chat',
                    status: '/status'
                }
            },
            external_services: serviceChecks,
            cors: {
                allowed_origins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').length : 0,
                configured: !!process.env.ALLOWED_ORIGINS
            }
        };
        
        res.status(200).json(healthData);
        
    } catch (error) {
        console.error(TAG, 'Health check error:', error);
        
        const endTime = process.hrtime.bigint();
        const latencyMs = Number(endTime - startTime) / 1000000;
        
        res.status(500).json({
            status: 'offline',
            timestamp: new Date().toISOString(),
            environment: NODE_ENV,
            error: error.message,
            latency: {
                response_time_ms: parseFloat(latencyMs.toFixed(2))
            }
        });
    }
});

// Helper function to format uptime
function formatUptime(uptimeSeconds) {
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

// API routes
app.use('/api/plan', planRoutes);
app.use('/api/chat', chatRoutes);

// Root endpoint
app.get('/', (req, res) => {
    console.log(TAG, 'Root endpoint accessed');
    res.status(200).json({
        message: 'PlanIT Backend API',
        author: 'Rongbin Gu (@rongbin99)',
        endpoints: {
            status: '/status',
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
    console.warn(TAG, `404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        error: 'Route not found',
        message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error(TAG, 'Global error handler:', error);
    
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
const startServer = async () => {
    try {
        console.log('========================================');
        console.log('🔧 PlanIT Backend Initialization');
        console.log('========================================');
        
        // Initialize database connection
        console.log('📊 Initializing database...');
        const dbInitialized = await initializeDatabase();
        
        if (!dbInitialized) {
            console.warn('⚠️  Database initialization failed - server will run without database');
            console.warn('⚠️  Routes will fail until database is properly configured');
        } else {
            console.log('✅ Database initialized successfully');
            
            // Seed database with sample data if needed
            console.log('🌱 Seeding database...');
            await seedDatabase();
            console.log('✅ Database seeding completed');
        }
        
        // Start HTTP server
        console.log('🚀 Starting HTTP server...');
        const server = app.listen(PORT, () => {
            console.log('========================================');
            console.log('🚀 PlanIT Backend Server Started');
            console.log('========================================');
            console.log(`Environment: ${NODE_ENV}`);
            console.log(`Port: ${PORT}`);
            console.log(`Database: ${dbInitialized ? '✅ Connected' : '❌ Not Connected'}`);
            console.log(`URL: http://localhost:${PORT}`);
            console.log(`Status Check: http://localhost:${PORT}/status`);
            console.log(`API Endpoints:`);
            console.log(`  - Plan: http://localhost:${PORT}/api/plan`);
            console.log(`  - Chat: http://localhost:${PORT}/api/chat`);
            console.log('========================================');
        });
        
        return server;
        
    } catch (error) {
        console.error('❌ Server startup failed:', error);
        process.exit(1);
    }
};

// Start the server
const server = startServer();

// Graceful shutdown
const gracefulShutdown = async (serverInstance, signal) => {
    console.log(TAG, `${signal} received, shutting down gracefully`);
    
    try {
        // Close database connections
        console.log(TAG, 'Closing database connections...');
        await closeDatabase();
        
        // Close HTTP server
        console.log(TAG, 'Closing HTTP server...');
        serverInstance.close(() => {
            console.log(TAG, 'Server closed successfully');
            process.exit(0);
        });
        
        // Force exit after 30 seconds
        setTimeout(() => {
            console.error(TAG, 'Forceful shutdown after timeout');
            process.exit(1);
        }, 30000);
        
    } catch (error) {
        console.error(TAG, 'Error during shutdown:', error);
        process.exit(1);
    }
};

// Handle process signals for graceful shutdown
process.on('SIGTERM', () => {
    server.then(serverInstance => gracefulShutdown(serverInstance, 'SIGTERM'));
});

process.on('SIGINT', () => {
    server.then(serverInstance => gracefulShutdown(serverInstance, 'SIGINT'));
});

module.exports = app;
