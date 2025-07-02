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
const { addImagesToTrips } = require('../services/unsplash');

// ========================================
// ROUTER SETUP
// ========================================
const router = express.Router();

// ========================================
// CONSTANTS
// ========================================
const TAG = "[TripRoutes]";

// ========================================
// DATABASE LINKING
// ========================================
// TODO: PostgreSql database

/**
 * In-memory trip planning storage
 */
let tripHistory = [
    {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Best restaurants in downtown Toronto',
        location: 'Toronto, Ontario, Canada',
        lastUpdated: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        searchData: {
            searchQuery: 'Best restaurants in downtown Toronto',
            filters: {
                timeOfDay: ['evening'],
                environment: 'indoor',
                planTransit: false,
                groupSize: 'duo',
                planFood: true,
                priceRange: 3,
                specialOption: 'date'
            }
        }
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Weekend activities for couples in Vancouver',
        location: 'Vancouver, British Columbia, Canada',
        lastUpdated: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        searchData: {
            searchQuery: 'Weekend activities for couples in Vancouver',
            filters: {
                timeOfDay: ['afternoon', 'evening'],
                environment: 'mixed',
                planTransit: true,
                groupSize: 'duo',
                planFood: true,
                priceRange: 2,
                specialOption: 'date'
            }
        }
    },
    {
        id: '550e8400-e29b-41d4-a716-446655440003',
        title: 'Family-friendly activities in Montreal',
        location: 'Montreal, Quebec, Canada',
        lastUpdated: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        searchData: {
            searchQuery: 'Family-friendly activities in Montreal',
            filters: {
                timeOfDay: ['morning', 'afternoon'],
                environment: 'outdoor',
                planTransit: true,
                groupSize: 'group',
                planFood: true,
                priceRange: 2,
                specialOption: 'family'
            }
        }
    }
];

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
 * Sorts chat array based on criteria
 * @param {Array} chats - Array of chat objects
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - Sort order (asc/desc)
 * @returns {Array} - Sorted chat array
 */
const sortTrips = (chats, sortBy, sortOrder) => {
    return chats.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];
        
        // Handle lastUpdated sorting
        if (sortBy === 'lastUpdated') {
            aValue = new Date(aValue).getTime();
            bValue = new Date(bValue).getTime();
        }
        
        // Handle string sorting
        if (typeof aValue === 'string' && typeof bValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }
        
        if (sortOrder === 'desc') {
            return bValue > aValue ? 1 : -1;
        } else {
            return aValue > bValue ? 1 : -1;
        }
    });
};

/**
 * Filters chats based on search query
 * @param {Array} chats - Array of chat objects
 * @param {string} searchQuery - Search query string
 * @returns {Array} - Filtered chat array
 */
const filterTrips = (chats, searchQuery) => {
    if (!searchQuery) return chats;
    
    const query = searchQuery.toLowerCase();
    return chats.filter(chat => 
        chat.title.toLowerCase().includes(query) ||
        chat.location.toLowerCase().includes(query) ||
        chat.searchData?.searchQuery?.toLowerCase().includes(query)
    );
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
 */
router.get('/', async (req, res) => {
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

        // TODO: In production, filter by user ID from authentication
        // const userId = req.user.id;
        // let userChats = chatHistory.filter(chat => chat.userId === userId);
        
        // Clone the array for processing
        let userTrips = [...tripHistory]; 
        console.log(TAG, 'Initial trip count:', userTrips.length);

        // Apply search filter
        if (search) {
            userTrips = filterTrips(userTrips, search);
            console.log(TAG, 'After search filter:', userTrips.length, 'trips');
        }

        // Apply sorting
        userTrips = sortTrips(userTrips, sortBy, sortOrder);
        console.log(TAG, 'Applied sorting:', sortBy, sortOrder);

        // Get total count before pagination
        const totalCount = userTrips.length;

        // Apply pagination
        const paginatedTrips = userTrips.slice(offset, offset + limit);
        console.log(TAG, 'Paginated results:', paginatedTrips.length, 'trips');

        // Format chats for list view
        const formattedTrips = paginatedTrips.map(formatTripForList);

        // Add location images from Unsplash API
        console.log(TAG, 'Fetching images for', formattedTrips.length, 'trips');
        const tripsWithImages = await addImagesToTrips(formattedTrips);

        // Prepare response
        const response = {
            success: true,
            trips: tripsWithImages,
            pagination: {
                total: totalCount,
                limit: limit,
                offset: offset,
                hasMore: offset + limit < totalCount,
                nextOffset: offset + limit < totalCount ? offset + limit : null
            },
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
 * GET /api/chat/:chatId
 * 
 * Retrieves a specific trip planning conversation by ID.
 */
router.get('/:chatId', async (req, res) => {
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

        // Find chat by ID
        // TODO: In production, also verify user ownership
        const trip = tripHistory.find(c => c.id === chatId);
        
        if (!trip) {
            console.warn(TAG, 'Chat not found:', chatId);
            return res.status(404).json({
                success: false,
                error: 'Chat Not Found',
                message: `Chat with ID ${chatId} does not exist`,
                timestamp: new Date().toISOString()
            });
        }

        console.log(TAG, 'Chat found:', {
            id: trip.id,
            title: trip.title,
            messageCount: trip.messageCount
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
 */
router.delete('/:chatId', async (req, res) => {
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

        // Find chat index
        const chatIndex = tripHistory.findIndex(c => c.id === chatId);
        
        if (chatIndex === -1) {
            console.warn(TAG, 'Chat not found for deletion:', chatId);
            return res.status(404).json({
                success: false,
                error: 'Chat Not Found',
                message: `Chat with ID ${chatId} does not exist`,
                timestamp: new Date().toISOString()
            });
        }

        // TODO: In production, verify user ownership before deletion
        const chatToDelete = tripHistory[chatIndex];
        console.log(TAG, 'Found chat to delete:', {
            id: chatToDelete.id,
            title: chatToDelete.title
        });

        // Remove chat from history
        tripHistory.splice(chatIndex, 1);
        console.log(TAG, 'Chat deleted successfully. Remaining chats:', tripHistory.length);

        // Prepare response
        const response = {
            success: true,
            message: 'Chat deleted successfully',
            deletedTrip: {
                id: chatToDelete.id,
                title: chatToDelete.title
            },
            timestamp: new Date().toISOString()
        };

        // Send response
        res.status(200).json(response);
        console.log(TAG, 'Deletion response sent successfully');

        // TODO: In production, you might want to:
        // 1. Soft delete instead of hard delete
        // 2. Log deletion for audit purposes
        // 3. Clean up associated files/data
        // 4. Send deletion confirmation to user

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

/**
 * GET /api/chat/status
 * 
 * Returns the status of the chat service
 */
router.get('/status', (req, res) => {
    console.log(TAG, 'GET /api/chat/status - Status check requested');
    
    res.status(200).json({
        service: 'Trip API',
        status: 'operational',
        version: '1.0.0',
        statistics: {
            totalTrips: tripHistory.length,
            oldestTrip: tripHistory.length > 0 ? 
                Math.min(...tripHistory.map(c => new Date(c.lastUpdated).getTime())) : null,
            newestTrip: tripHistory.length > 0 ? 
                Math.max(...tripHistory.map(c => new Date(c.lastUpdated).getTime())) : null
        },
        endpoints: {
            list: 'GET /api/chat',
            get: 'GET /api/chat/:chatId',
            delete: 'DELETE /api/chat/:chatId',
            status: 'GET /api/chat/status'
        },
        timestamp: new Date().toISOString()
    });
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
