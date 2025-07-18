/**
 * Chat Routes
 * 
 * Handles trip history management and retrieval.
 * Provides endpoints for fetching trip planning conversations and managing trip planning data.
 * 
 * @author Rongbin Gu (@rongbin99)
 */

// ========================================
// IMPORTS
// ========================================
const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { addImagesToTrips } = require('../services/unsplash');
const { 
    getTrips, 
    getTripById, 
    createTrip, 
    updateTrip, 
    deleteTrip,
    pool
} = require('../services/database');
const { optionalAuth, authenticateToken } = require('../middleware/auth');

// ========================================
// ROUTER SETUP
// ========================================
const router = express.Router();

// ========================================
// CONSTANTS
// ========================================
const TAG = "[ChatRoutes]";

// ========================================
// RATE LIMITERS
// ========================================

// Rate limiter for trip listing endpoint
const tripListLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many trip list requests from this IP, please try again later.'
    }
});

// Rate limiter for individual trip retrieval endpoint
const tripGetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many trip retrieval requests from this IP, please try again later.'
    }
});

// Rate limiter for trip deletion endpoint
const tripDeleteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 deletion requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many trip deletion requests from this IP, please try again later.'
    }
});

// Rate limiter for audit logs endpoint
const auditLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 audit requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many audit log requests from this IP, please try again later.'
    }
});

// Rate limiter for status endpoint
const statusLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 status requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many status requests from this IP, please try again later.'
    }
});

// ========================================
// VALIDATION SCHEMAS
// ========================================

/**
 * Chat ID validation schema
 */
const tripIdSchema = Joi.string().uuid().required()
    .messages({
        'string.guid': 'Invalid chat ID format - must be a valid UUID',
        'any.required': 'Chat ID is required'
    });

/**
 * Query parameters schema for chat listing
 */
const tripQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
    sortBy: Joi.string().valid('lastUpdated', 'title').default('lastUpdated'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    search: Joi.string().max(100).optional()
});

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Cleans up associated files and data for a deleted trip
 * @param {string} chatId - Trip ID
 * @param {Object} tripData - Trip data
 */
const cleanupTripData = async (chatId, tripData) => {
    try {
        console.log(TAG, 'Starting cleanup for trip:', chatId);
        
        // Clean up any cached files (if implemented in the future)
        // await cleanupCachedImages(chatId);
        
        // Clean up any temporary data
        // await cleanupTempData(chatId);
        
        // Log cleanup completion
        console.log(TAG, 'Cleanup completed for trip:', chatId);
        
    } catch (error) {
        console.error(TAG, 'Error during cleanup for trip:', chatId, error);
        // Don't throw - cleanup failure shouldn't break deletion
    }
};



/**
 * Formats chat data for list view
 * @param {Object} chat - Full chat object
 * @returns {Object} - Formatted chat list item
 */
const formatTripForList = (chat) => {
    return {
        id: chat.id,
        title: chat.title,
        location: chat.location,
        lastUpdated: chat.lastUpdated,
        searchData: chat.searchData // Include search data for context
    };
};

/**
 * Logs request details for debugging
 * @param {Object} req - Express request object
 * @param {string} action - Action being performed
 */
const logRequestDetails = (req, action) => {
    console.log(`[ChatRoutes] ${action} request details:`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        params: req.params,
        query: req.query,
        timestamp: new Date().toISOString()
    });
};

// ========================================
// ROUTES
// ========================================

/**
 * GET /api/chat
 * 
 * Retrieves trip history with optional filtering, sorting, and pagination.
 * Uses optional authentication - shows user's trips if authenticated, public trips if not.
 */
router.get('/', optionalAuth, tripListLimiter, async (req, res) => {
    console.log(TAG, 'GET /api/chat - Trip history requested');
    
    try {
        // Log request details
        logRequestDetails(req, 'Trip history list');
        
        // Validate query parameters
        console.log(TAG, 'Validating query parameters');
        const { error, value } = tripQuerySchema.validate(req.query);
        
        if (error) {
            console.error(TAG, 'Query validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const { limit, offset, sortBy, sortOrder, search } = value;
        console.log(TAG, 'Query parameters:', { limit, offset, sortBy, sortOrder, search });

        // Get trips from database with filtering, sorting, and pagination
        console.log(TAG, 'Fetching trips from database for user:', req.userId || 'anonymous');
        const dbResult = await getTrips({
            limit,
            offset,
            sortBy,
            sortOrder,
            search,
            userId: req.userId
        });
        
        const { trips: userTrips, pagination } = dbResult;
        console.log(TAG, 'Retrieved from database:', userTrips.length, 'trips');

        // Format chats for list view
        const formattedTrips = userTrips.map(formatTripForList);

        // Add location images from Unsplash API
        console.log(TAG, 'Fetching images for', formattedTrips.length, 'trips');
        const tripsWithImages = await addImagesToTrips(formattedTrips);

        // Prepare response
        const response = {
            success: true,
            trips: tripsWithImages,
            pagination: pagination,
            metadata: {
                sortBy: sortBy,
                sortOrder: sortOrder,
                searchQuery: search || null,
                timestamp: new Date().toISOString(),
                imagesIncluded: true
            }
        };

        console.log(TAG, 'Response prepared:', {
            tripCount: response.trips.length,
            total: response.pagination.total,
            hasMore: response.pagination.hasMore
        });

        // Send response
        res.status(200).json(response);
        console.log(TAG, 'Trip history sent successfully');

    } catch (error) {
        console.error(TAG, 'Error retrieving trip history:', error);
        
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to retrieve trip history',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/chat/audit
 * 
 * Returns audit logs for chat operations (admin access recommended)
 */
router.get('/audit', auditLimiter, authenticateToken, async (req, res) => {
    try {
        console.log(TAG, 'GET /api/chat/audit - Audit logs requested by user:', req.userId);
        
        // TODO: Add admin role check in production
        // if (!req.user.isAdmin) {
        //     return res.status(403).json({
        //         success: false,
        //         error: 'Forbidden',
        //         message: 'Admin access required'
        //     });
        // }
        
        const { 
            limit = 50, 
            offset = 0, 
            entityId, 
            action,
            startDate,
            endDate 
        } = req.query;
        
        // Build query filters
        let whereConditions = ["entity_type = 'trip'"];
        let params = [];
        
        if (entityId) {
            whereConditions.push(`entity_id = $${params.length + 1}`);
            params.push(entityId);
        }
        
        if (action) {
            whereConditions.push(`action = $${params.length + 1}`);
            params.push(action);
        }
        
        if (startDate) {
            whereConditions.push(`timestamp >= $${params.length + 1}`);
            params.push(startDate);
        }
        
        if (endDate) {
            whereConditions.push(`timestamp <= $${params.length + 1}`);
            params.push(endDate);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        // Get audit logs
        const auditQuery = `
            SELECT al.*, u.email as user_email, u.name as user_name
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE ${whereClause}
            ORDER BY al.timestamp DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await pool.query(auditQuery, params);
        
        const auditLogs = result.rows.map(log => ({
            id: log.id,
            entityType: log.entity_type,
            entityId: log.entity_id,
            action: log.action,
            userId: log.user_id,
            userEmail: log.user_email,
            userName: log.user_name,
            oldData: log.old_data,
            newData: log.new_data,
            ipAddress: log.ip_address,
            userAgent: log.user_agent,
            timestamp: log.timestamp
        }));
        
        res.json({
            success: true,
            auditLogs,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: auditLogs.length
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error(TAG, 'Error fetching audit logs:', error);
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to fetch audit logs',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/chat/status
 * 
 * Returns the status of the chat service
 */
router.get('/status', statusLimiter, async (req, res) => {
    console.log(TAG, 'GET /api/chat/status - Status check requested');
    
    try {
        // Get database statistics
        const dbResult = await getTrips({ limit: 1000 }); // Get reasonable count for stats
        const totalTrips = dbResult.pagination.total;
        
        res.status(200).json({
            service: 'Trip API',
            status: 'operational',
            version: '1.0.0',
            statistics: {
                totalTrips: totalTrips,
                dataSource: 'PostgreSQL Database'
            },
            endpoints: {
                list: 'GET /api/chat',
                get: 'GET /api/chat/:chatId',
                delete: 'DELETE /api/chat/:chatId',
                status: 'GET /api/chat/status'
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error(TAG, 'Error getting database statistics:', error);
        res.status(200).json({
            service: 'Trip API',
            status: 'operational',
            version: '1.0.0',
            statistics: {
                totalTrips: 'Unable to fetch',
                dataSource: 'PostgreSQL Database (connection error)'
            },
            endpoints: {
                list: 'GET /api/chat',
                get: 'GET /api/chat/:chatId',
                delete: 'DELETE /api/chat/:chatId',
                status: 'GET /api/chat/status'
            },
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/chat/:chatId
 * 
 * Retrieves a specific trip planning conversation by ID.
 * Uses optional authentication to verify ownership of private trips.
 */
router.get('/:chatId', optionalAuth, tripGetLimiter, async (req, res) => {
    console.log(TAG, 'GET /api/chat/:chatId - Specific chat requested');
    
    try {
        // Log request details
        logRequestDetails(req, 'Specific chat');
        
        // Validate chat ID
        console.log(TAG, 'Validating chat ID');
        const { error, value } = tripIdSchema.validate(req.params.chatId);
        
        if (error) {
            console.error(TAG, 'Chat ID validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const chatId = value;
        console.log(TAG, 'Looking for chat ID:', chatId);

        // Find chat by ID from database
        const trip = await getTripById(chatId);
        
        if (!trip) {
            console.warn(TAG, 'Chat not found:', chatId);
            return res.status(404).json({
                success: false,
                error: 'Chat Not Found',
                message: `Chat with ID ${chatId} does not exist`,
                timestamp: new Date().toISOString()
            });
        }

        // Verify user ownership for access control
        console.log(TAG, 'Verifying user access for trip:', {
            tripId: trip.id,
            tripUserId: trip.userId,
            requestUserId: req.userId
        });

        // Check access based on authentication status
        if (req.userId) {
            // Authenticated user - must own the trip
            if (trip.userId !== req.userId) {
                console.warn(TAG, 'Access denied: User does not own this trip:', {
                    tripId: chatId,
                    tripOwner: trip.userId,
                    requestingUser: req.userId
                });
                return res.status(403).json({
                    success: false,
                    error: 'Access Denied',
                    message: 'You do not have permission to view this trip',
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            // Non-authenticated user - can only view trips with user_id === null
            if (trip.userId !== null) {
                console.warn(TAG, 'Access denied: Non-authenticated user trying to view user trip:', {
                    tripId: chatId,
                    tripOwner: trip.userId
                });
                return res.status(403).json({
                    success: false,
                    error: 'Access Denied',
                    message: 'This trip belongs to a registered user and requires authentication to view',
                    timestamp: new Date().toISOString()
                });
            }
        }

        console.log(TAG, 'Access verification passed. Chat found:', {
            id: trip.id,
            title: trip.title,
            lastUpdated: trip.lastUpdated,
            userAuthorized: true
        });

        // Add location image from Unsplash API
        console.log(TAG, 'Fetching image for individual trip');
        const tripsWithImages = await addImagesToTrips([trip]);
        const tripWithImage = tripsWithImages[0];

        // Prepare response
        const response = {
            success: true,
            trip: tripWithImage,
            timestamp: new Date().toISOString()
        };

        // Send response
        res.status(200).json(response);
        console.log(TAG, 'Chat data sent successfully');

    } catch (error) {
        console.error(TAG, 'Error retrieving specific chat:', error);
        
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to retrieve chat',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * DELETE /api/chat/:chatId
 * 
 * Deletes a specific chat conversation.
 * Uses optional authentication to verify ownership before deletion.
 */
router.delete('/:chatId', optionalAuth, tripDeleteLimiter, async (req, res) => {
    console.log(TAG, 'DELETE /api/chat/:chatId - Chat deletion requested');
    
    try {
        // Log request details
        logRequestDetails(req, 'Trip deletion');
        
        // Validate chat ID
        console.log(TAG, 'Validating chat ID for deletion');
        const { error, value } = tripIdSchema.validate(req.params.chatId);
        
        if (error) {
            console.error(TAG, 'Chat ID validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const chatId = value;
        console.log(TAG, 'Attempting to delete chat ID:', chatId);

        // Get trip details before deletion for response
        const tripToDelete = await getTripById(chatId);
        
        if (!tripToDelete) {
            console.warn(TAG, 'Chat not found for deletion:', chatId);
            return res.status(404).json({
                success: false,
                error: 'Chat Not Found',
                message: `Chat with ID ${chatId} does not exist`,
                timestamp: new Date().toISOString()
            });
        }

        // Verify user ownership before deletion
        console.log(TAG, 'Verifying user ownership for trip:', {
            tripId: tripToDelete.id,
            tripUserId: tripToDelete.userId,
            requestUserId: req.userId
        });

        // Check ownership based on authentication status
        if (req.userId) {
            // Authenticated user - must own the trip
            if (tripToDelete.userId !== req.userId) {
                console.warn(TAG, 'Access denied: User does not own this trip:', {
                    tripId: chatId,
                    tripOwner: tripToDelete.userId,
                    requestingUser: req.userId
                });
                return res.status(403).json({
                    success: false,
                    error: 'Access Denied',
                    message: 'You do not have permission to delete this trip',
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            // Non-authenticated user - can only delete trips with user_id === null
            if (tripToDelete.userId !== null) {
                console.warn(TAG, 'Access denied: Non-authenticated user trying to delete user trip:', {
                    tripId: chatId,
                    tripOwner: tripToDelete.userId
                });
                return res.status(403).json({
                    success: false,
                    error: 'Access Denied',
                    message: 'This trip belongs to a registered user and cannot be deleted without authentication',
                    timestamp: new Date().toISOString()
                });
            }
        }

        console.log(TAG, 'Ownership verification passed. Proceeding with deletion:', {
            id: tripToDelete.id,
            title: tripToDelete.title,
            userAuthorized: true
        });

        // Prepare audit data
        const auditData = {
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        };

        // Soft delete trip from database with audit logging
        const deletedTrip = await deleteTrip(chatId, req.userId, auditData);
        
        if (!deletedTrip) {
            console.error(TAG, 'Failed to delete trip from database:', chatId);
            return res.status(500).json({
                success: false,
                error: 'Database Error',
                message: 'Failed to delete trip from database',
                timestamp: new Date().toISOString()
            });
        }
        
        console.log(TAG, 'Chat soft deleted successfully from database:', chatId);

        // Clean up associated files/data
        await cleanupTripData(chatId, tripToDelete);

        // Prepare detailed response with confirmation
        const response = {
            success: true,
            message: 'Chat deleted successfully',
            deletedTrip: {
                id: deletedTrip.id,
                title: deletedTrip.title,
                location: deletedTrip.location,
                deletedAt: deletedTrip.deletedAt
            },
            audit: {
                action: 'soft_delete',
                userId: req.userId,
                timestamp: new Date().toISOString(),
                ipAddress: auditData.ipAddress
            },
            recovery: {
                message: 'This chat has been moved to trash and can be recovered within 30 days',
                contactSupport: 'Contact support if you need to recover this chat'
            },
            timestamp: new Date().toISOString()
        };

        // Send response
        res.status(200).json(response);
        console.log(TAG, 'Deletion response sent successfully with audit trail');

    } catch (error) {
        console.error(TAG, 'Error deleting chat:', error);
        
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to delete chat',
            timestamp: new Date().toISOString()
        });
    }
});

// ========================================
// ERROR HANDLING
// ========================================

/**
 * Handle unsupported methods on base route
 */
router.all('/', (req, res, next) => {
    if (req.method === 'GET') {
        return next(); // Let GET request proceed
    }
    
    console.warn(TAG, `Unsupported method on base route: ${req.method}`);
    return res.status(405).json({
        success: false,
        error: 'Method Not Allowed',
        message: `${req.method} method is not supported on this endpoint.`,
        allowedMethods: ['GET'],
        timestamp: new Date().toISOString()
    });
});

/**
 * Handle unsupported methods on specific trip routes
 */
router.all('/:chatId', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
        return next(); // Let GET and DELETE requests proceed
    }
    
    console.warn(TAG, `Unsupported method on trip route: ${req.method}`);
    return res.status(405).json({
        success: false,
        error: 'Method Not Allowed',
        message: `${req.method} method is not supported on this endpoint.`,
        allowedMethods: ['GET', 'DELETE'],
        timestamp: new Date().toISOString()
    });
});

module.exports = router; 
