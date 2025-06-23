/**
 * Chat Routes
 * 
 * Handles chat history management and retrieval.
 * Provides endpoints for fetching chat conversations and managing chat data.
 * 
 * @author Rongbin Gu (@rongbin99)
 * @version 1.0.0
 */

// ========================================
// IMPORTS
// ========================================
const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');

// ========================================
// ROUTER SETUP
// ========================================
const router = express.Router();

// ========================================
// IN-MEMORY DATA STORE
// ========================================
// TODO: Replace with actual database (MongoDB, PostgreSQL, etc.)

/**
 * In-memory chat storage
 * In production, this would be replaced with a proper database
 */
let chatHistory = [
    {
        id: 'chat_001',
        title: 'Best restaurants in downtown Toronto',
        lastMessage: 'I found some amazing restaurants that match your criteria. Here are my top recommendations perfect for your dining experience...',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        messageCount: 4,
        userId: 'user_demo', // In production, this would be the actual user ID
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
        },
        messages: [
            {
                id: 'msg_001',
                type: 'user',
                content: 'Best restaurants in downtown Toronto',
                timestamp: new Date(Date.now() - 3600000).toISOString()
            },
            {
                id: 'msg_002',
                type: 'ai',
                content: 'I found some amazing restaurants that match your criteria...',
                timestamp: new Date(Date.now() - 3595000).toISOString()
            }
        ],
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        updatedAt: new Date(Date.now() - 3595000).toISOString()
    },
    {
        id: 'chat_002',
        title: 'Weekend activities for couples in Vancouver',
        lastMessage: 'Here are some romantic spots perfect for a weekend getaway. These locations offer beautiful scenery and intimate experiences...',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        messageCount: 6,
        userId: 'user_demo',
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
        },
        messages: [
            {
                id: 'msg_003',
                type: 'user',
                content: 'Weekend activities for couples in Vancouver',
                timestamp: new Date(Date.now() - 86400000).toISOString()
            },
            {
                id: 'msg_004',
                type: 'ai',
                content: 'Here are some romantic spots perfect for a weekend getaway...',
                timestamp: new Date(Date.now() - 86395000).toISOString()
            }
        ],
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 86395000).toISOString()
    },
    {
        id: 'chat_003',
        title: 'Family-friendly activities in Montreal',
        lastMessage: 'These activities are perfect for families with children. Each location offers engaging experiences for all ages...',
        timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        messageCount: 8,
        userId: 'user_demo',
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
        },
        messages: [
            {
                id: 'msg_005',
                type: 'user',
                content: 'Family-friendly activities in Montreal',
                timestamp: new Date(Date.now() - 172800000).toISOString()
            },
            {
                id: 'msg_006',
                type: 'ai',
                content: 'These activities are perfect for families with children...',
                timestamp: new Date(Date.now() - 172795000).toISOString()
            }
        ],
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        updatedAt: new Date(Date.now() - 172795000).toISOString()
    }
];

// ========================================
// VALIDATION SCHEMAS
// ========================================

/**
 * Chat ID validation schema
 */
const chatIdSchema = Joi.string().uuid().required()
    .messages({
        'string.guid': 'Invalid chat ID format',
        'any.required': 'Chat ID is required'
    });

/**
 * Query parameters schema for chat listing
 */
const chatQuerySchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
    sortBy: Joi.string().valid('timestamp', 'title', 'messageCount').default('timestamp'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    search: Joi.string().max(100).optional()
});

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Formats chat data for list view (removes full message content)
 * @param {Object} chat - Full chat object
 * @returns {Object} - Formatted chat list item
 */
const formatChatForList = (chat) => {
    return {
        id: chat.id,
        title: chat.title,
        lastMessage: chat.lastMessage,
        timestamp: chat.timestamp,
        messageCount: chat.messageCount,
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
const sortChats = (chats, sortBy, sortOrder) => {
    return chats.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];
        
        // Handle timestamp sorting
        if (sortBy === 'timestamp') {
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
const filterChats = (chats, searchQuery) => {
    if (!searchQuery) return chats;
    
    const query = searchQuery.toLowerCase();
    return chats.filter(chat => 
        chat.title.toLowerCase().includes(query) ||
        chat.lastMessage.toLowerCase().includes(query) ||
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
 * Retrieves chat history with optional filtering, sorting, and pagination.
 */
router.get('/', async (req, res) => {
    console.log('[ChatRoutes] GET /api/chat - Chat history requested');
    
    try {
        // Log request details
        logRequestDetails(req, 'Chat list');
        
        // Validate query parameters
        console.log('[ChatRoutes] Validating query parameters');
        const { error, value } = chatQuerySchema.validate(req.query);
        
        if (error) {
            console.warn('[ChatRoutes] Query validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const { limit, offset, sortBy, sortOrder, search } = value;
        console.log('[ChatRoutes] Query parameters:', { limit, offset, sortBy, sortOrder, search });

        // TODO: In production, filter by user ID from authentication
        // const userId = req.user.id;
        // let userChats = chatHistory.filter(chat => chat.userId === userId);
        
        let userChats = [...chatHistory]; // Clone the array for processing
        console.log('[ChatRoutes] Initial chat count:', userChats.length);

        // Apply search filter
        if (search) {
            userChats = filterChats(userChats, search);
            console.log('[ChatRoutes] After search filter:', userChats.length, 'chats');
        }

        // Apply sorting
        userChats = sortChats(userChats, sortBy, sortOrder);
        console.log('[ChatRoutes] Applied sorting:', sortBy, sortOrder);

        // Get total count before pagination
        const totalCount = userChats.length;

        // Apply pagination
        const paginatedChats = userChats.slice(offset, offset + limit);
        console.log('[ChatRoutes] Paginated results:', paginatedChats.length, 'chats');

        // Format chats for list view
        const formattedChats = paginatedChats.map(formatChatForList);

        // Prepare response
        const response = {
            success: true,
            chats: formattedChats,
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
                timestamp: new Date().toISOString()
            }
        };

        console.log('[ChatRoutes] Response prepared:', {
            chatCount: response.chats.length,
            total: response.pagination.total,
            hasMore: response.pagination.hasMore
        });

        // Send response
        res.status(200).json(response);
        console.log('[ChatRoutes] Chat history sent successfully');

    } catch (error) {
        console.error('[ChatRoutes] Error retrieving chat history:', error);
        
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to retrieve chat history',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/chat/:chatId
 * 
 * Retrieves a specific chat conversation by ID.
 */
router.get('/:chatId', async (req, res) => {
    console.log('[ChatRoutes] GET /api/chat/:chatId - Specific chat requested');
    
    try {
        // Log request details
        logRequestDetails(req, 'Specific chat');
        
        // Validate chat ID
        console.log('[ChatRoutes] Validating chat ID');
        const { error, value } = chatIdSchema.validate(req.params.chatId);
        
        if (error) {
            console.warn('[ChatRoutes] Chat ID validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const chatId = value;
        console.log('[ChatRoutes] Looking for chat ID:', chatId);

        // Find chat by ID
        // TODO: In production, also verify user ownership
        const chat = chatHistory.find(c => c.id === chatId);
        
        if (!chat) {
            console.warn('[ChatRoutes] Chat not found:', chatId);
            return res.status(404).json({
                success: false,
                error: 'Chat Not Found',
                message: `Chat with ID ${chatId} does not exist`,
                timestamp: new Date().toISOString()
            });
        }

        console.log('[ChatRoutes] Chat found:', {
            id: chat.id,
            title: chat.title,
            messageCount: chat.messageCount
        });

        // Prepare response
        const response = {
            success: true,
            chat: chat,
            timestamp: new Date().toISOString()
        };

        // Send response
        res.status(200).json(response);
        console.log('[ChatRoutes] Chat data sent successfully');

    } catch (error) {
        console.error('[ChatRoutes] Error retrieving specific chat:', error);
        
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
    console.log('[ChatRoutes] DELETE /api/chat/:chatId - Chat deletion requested');
    
    try {
        // Log request details
        logRequestDetails(req, 'Chat deletion');
        
        // Validate chat ID
        console.log('[ChatRoutes] Validating chat ID for deletion');
        const { error, value } = chatIdSchema.validate(req.params.chatId);
        
        if (error) {
            console.warn('[ChatRoutes] Chat ID validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const chatId = value;
        console.log('[ChatRoutes] Attempting to delete chat ID:', chatId);

        // Find chat index
        const chatIndex = chatHistory.findIndex(c => c.id === chatId);
        
        if (chatIndex === -1) {
            console.warn('[ChatRoutes] Chat not found for deletion:', chatId);
            return res.status(404).json({
                success: false,
                error: 'Chat Not Found',
                message: `Chat with ID ${chatId} does not exist`,
                timestamp: new Date().toISOString()
            });
        }

        // TODO: In production, verify user ownership before deletion
        const chatToDelete = chatHistory[chatIndex];
        console.log('[ChatRoutes] Found chat to delete:', {
            id: chatToDelete.id,
            title: chatToDelete.title
        });

        // Remove chat from history
        chatHistory.splice(chatIndex, 1);
        console.log('[ChatRoutes] Chat deleted successfully. Remaining chats:', chatHistory.length);

        // Prepare response
        const response = {
            success: true,
            message: 'Chat deleted successfully',
            deletedChat: {
                id: chatToDelete.id,
                title: chatToDelete.title
            },
            timestamp: new Date().toISOString()
        };

        // Send response
        res.status(200).json(response);
        console.log('[ChatRoutes] Deletion response sent successfully');

        // TODO: In production, you might want to:
        // 1. Soft delete instead of hard delete
        // 2. Log deletion for audit purposes
        // 3. Clean up associated files/data
        // 4. Send deletion confirmation to user

    } catch (error) {
        console.error('[ChatRoutes] Error deleting chat:', error);
        
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
    console.log('[ChatRoutes] GET /api/chat/status - Status check requested');
    
    res.status(200).json({
        service: 'Chat API',
        status: 'operational',
        version: '1.0.0',
        statistics: {
            totalChats: chatHistory.length,
            oldestChat: chatHistory.length > 0 ? 
                Math.min(...chatHistory.map(c => new Date(c.createdAt).getTime())) : null,
            newestChat: chatHistory.length > 0 ? 
                Math.max(...chatHistory.map(c => new Date(c.createdAt).getTime())) : null
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
    
    console.warn(`[ChatRoutes] Unsupported method on base route: ${req.method}`);
    return res.status(405).json({
        success: false,
        error: 'Method Not Allowed',
        message: `${req.method} method is not supported on this endpoint.`,
        allowedMethods: ['GET'],
        timestamp: new Date().toISOString()
    });
});

/**
 * Handle unsupported methods on specific chat routes
 */
router.all('/:chatId', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
        return next(); // Let GET and DELETE requests proceed
    }
    
    console.warn(`[ChatRoutes] Unsupported method on chat route: ${req.method}`);
    return res.status(405).json({
        success: false,
        error: 'Method Not Allowed',
        message: `${req.method} method is not supported on this endpoint.`,
        allowedMethods: ['GET', 'DELETE'],
        timestamp: new Date().toISOString()
    });
});

module.exports = router; 