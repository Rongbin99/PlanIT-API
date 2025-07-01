/**
 * Plan Routes
 * 
 * Handles trip planning requests and AI-powered itinerary generation.
 * Processes search queries with filters and returns personalized travel recommendations.
 * 
 * @author Rongbin Gu (@rongbin99)
 */

// ========================================
// IMPORTS
// ========================================
const express = require('express');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const openaiService = require('../services/openai');

// ========================================
// ROUTER SETUP
// ========================================
const router = express.Router();

// ========================================
// VALIDATION SCHEMAS
// ========================================

/**
 * Price range mapping for validation
 */
const PRICE_RANGE_MAP = {
    1: '$',
    2: '$$',
    3: '$$$',
    4: '$$$+'
};

/**
 * Search data validation schema
 */
const searchDataSchema = Joi.object({
    searchQuery: Joi.string().trim().min(1).max(500).required()
        .messages({
            'string.empty': 'Search query cannot be empty',
            'string.min': 'Search query must be at least 1 character',
            'string.max': 'Search query cannot exceed 500 characters'
        }),
    filters: Joi.object({
        timeOfDay: Joi.array().items(
            Joi.string().valid('morning', 'afternoon', 'evening')
        ).default([]),
        environment: Joi.string().valid('indoor', 'outdoor', 'mixed').default('indoor'),
        planTransit: Joi.boolean().default(false),
        groupSize: Joi.string().valid('solo', 'duo', 'group').default('solo'),
        planFood: Joi.boolean().default(false),
        priceRange: Joi.number().integer().min(1).max(4).when('planFood', {
            is: true,
            then: Joi.required(),
            otherwise: Joi.optional()
        }),
        specialOption: Joi.string().valid('auto', 'casual', 'tourist', 'wander', 'date', 'family').default('auto')
    }).required(),
    timestamp: Joi.string().isoDate().required()
});

/**
 * Plan request validation schema
 */
const planRequestSchema = Joi.object({
    searchData: searchDataSchema.required(),
    userMessage: Joi.string().trim().min(1).max(500).required()
});

// ========================================
// HELPER FUNCTIONS
// ========================================



/**
 * Logs request details for debugging
 * @param {Object} req - Express request object
 */
const logRequestDetails = (req) => {
    console.log('[PlanRoutes] Plan request details:', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        searchQuery: req.body.searchData?.searchQuery,
        timestamp: new Date().toISOString()
    });
};

// ========================================
// ROUTES
// ========================================

/**
 * POST /api/plan
 * 
 * Creates a new trip plan based on user search criteria and filters.
 * Processes the request through AI planning logic and returns recommendations.
 */
router.post('/', async (req, res) => {
    const startTime = Date.now();
    console.log('[PlanRoutes] POST /api/plan - Request received');
    
    try {
        // Log request details
        logRequestDetails(req);
        
        // Validate request body
        console.log('[PlanRoutes] Validating request body');
        const { error, value } = planRequestSchema.validate(req.body);
        
        if (error) {
            console.warn('[PlanRoutes] Validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const { searchData, userMessage } = value;
        console.log('[PlanRoutes] Request validated successfully');
        console.log('[PlanRoutes] Search data:', {
            query: searchData.searchQuery,
            filters: {
                ...searchData.filters,
                priceRange: searchData.filters.priceRange ? 
                    `${searchData.filters.priceRange} (${PRICE_RANGE_MAP[searchData.filters.priceRange]})` : 
                    undefined
            }
        });

        // Generate unique chat ID
        const chatId = uuidv4();
        console.log('[PlanRoutes] Generated chat ID:', chatId);

        // Generate AI response using OpenAI service
        console.log('[PlanRoutes] Generating AI response via OpenAI');
        const aiResult = await openaiService.generateTripPlan(searchData, userMessage);

        // Prepare response
        const response = {
            success: true,
            response: aiResult.content,
            chatId: chatId,
            metadata: {
                processingTime: aiResult.processingTime,
                totalTime: Date.now() - startTime,
                searchQuery: searchData.searchQuery,
                filterCount: Object.keys(searchData.filters).length,
                aiModel: aiResult.model,
                aiSource: aiResult.source,
                tokenUsage: aiResult.usage,
                timestamp: new Date().toISOString()
            }
        };

        console.log('[PlanRoutes] Response prepared:', {
            chatId: response.chatId,
            responseLength: response.response.length,
            processingTime: response.metadata.processingTime,
            totalTime: response.metadata.totalTime,
            aiSource: response.metadata.aiSource,
            aiModel: response.metadata.aiModel
        });

        // Send response
        res.status(200).json(response);
        console.log('[PlanRoutes] Response sent successfully');

        // TODO: In production, you might want to:
        // 1. Save the chat to a database
        // 2. Integrate with actual AI/ML services
        // 3. Implement rate limiting
        // 4. Add user authentication
        // 5. Log to external monitoring services

    } catch (error) {
        console.error('[PlanRoutes] Error processing plan request:', error);
        
        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Failed to process trip planning request',
            timestamp: new Date().toISOString(),
            chatId: null
        });
    }
});

/**
 * GET /api/plan/status
 * 
 * Returns the status of the planning service including OpenAI status
 */
router.get('/status', (req, res) => {
    console.log('[PlanRoutes] GET /api/plan/status - Status check requested');
    
    const openaiStatus = openaiService.getServiceStatus();
    
    res.status(200).json({
        service: 'Plan API',
        status: 'operational',
        version: '1.0.0',
        openai: openaiStatus,
        endpoints: {
            plan: 'POST /api/plan',
            status: 'GET /api/plan/status',
            test: 'GET /api/plan/test-ai'
        },
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /api/plan/test-ai
 * 
 * Tests OpenAI connection and returns result
 */
router.get('/test-ai', async (req, res) => {
    console.log('[PlanRoutes] GET /api/plan/test-ai - OpenAI test requested');
    
    try {
        const testResult = await openaiService.testConnection();
        
        res.status(testResult.success ? 200 : 503).json({
            service: 'OpenAI Test',
            ...testResult,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[PlanRoutes] OpenAI test failed:', error);
        res.status(500).json({
            service: 'OpenAI Test',
            success: false,
            message: 'Test request failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ========================================
// ERROR HANDLING
// ========================================

/**
 * Handle unsupported methods
 */
router.all('/', (req, res) => {
    if (req.method !== 'POST') {
        console.warn(`[PlanRoutes] Unsupported method: ${req.method}`);
        return res.status(405).json({
            success: false,
            error: 'Method Not Allowed',
            message: `${req.method} method is not supported. Use POST to create a plan.`,
            allowedMethods: ['POST'],
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router; 
