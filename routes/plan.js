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
// CONSTANTS
// ========================================

const TAG = '[PlanRoutes]';

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
    location: Joi.object({
        coords: Joi.object({
            latitude: Joi.number().optional(),
            longitude: Joi.number().optional(),
            accuracy: Joi.number().optional(),
            altitude: Joi.number().optional(),
            altitudeAccuracy: Joi.number().optional(),
            heading: Joi.number().optional(),
            speed: Joi.number().optional()
        }).optional(),
        mocked: Joi.boolean().optional(),
        timestamp: Joi.number().optional()
    }).optional(),
    filters: Joi.object({
        timeOfDay: Joi.array().items(
            Joi.string().valid('morning', 'afternoon', 'evening', 'allDay')
        ).default([]),
        environment: Joi.string().valid('indoor', 'outdoor', 'mixed').default('indoor'),
        planTransit: Joi.boolean().default(false),
        groupSize: Joi.string().valid('solo', 'duo', 'group').default('solo'),
        planFood: Joi.boolean().default(false),
        priceRange: Joi.alternatives().try(
            Joi.number().min(1).max(4),
            Joi.string()
        ).optional(),
        specialOption: Joi.string().valid('adventure', 'casual', 'tourist', 'wander', 'date', 'family').optional()
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
    const searchData = req.body.searchData;
    const logData = {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        searchQuery: searchData?.searchQuery,
        timestamp: new Date().toISOString()
    };
    
    // Add location information if available
    if (searchData?.location?.coords) {
        logData.location = {
            latitude: searchData.location.coords.latitude,
            longitude: searchData.location.coords.longitude,
            accuracy: searchData.location.coords.accuracy,
            mocked: searchData.location.mocked
        };
    }
    
    console.log(TAG, 'Plan request details:', logData);
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
    console.log(TAG, 'POST /api/plan - Request received');
    
    try {
        // Log request details
        logRequestDetails(req);
        
        // Validate request body
        console.log(TAG, 'Validating request body');
        const { error, value } = planRequestSchema.validate(req.body);
        
        if (error) {
            console.warn(TAG, 'Validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const { searchData, userMessage } = value;
        console.log(TAG, 'Request validated successfully');
        
        // Build detailed log data
        const logData = {
            query: searchData.searchQuery,
            filters: {
                ...searchData.filters,
                priceRange: searchData.filters.priceRange || 'not specified'
            }
        };
        
        // Add location information if available
        if (searchData.location?.coords) {
            logData.location = {
                latitude: searchData.location.coords.latitude,
                longitude: searchData.location.coords.longitude,
                accuracy: searchData.location.coords.accuracy,
                mocked: searchData.location.mocked,
                hasCoordinates: !!(searchData.location.coords.latitude && searchData.location.coords.longitude)
            };
        }
        
        console.log(TAG, 'Search data:', logData);

        // Generate unique chat ID
        const chatId = uuidv4();
        console.log(TAG, 'Generated chat ID:', chatId);

        // Generate AI response using OpenAI service
        console.log(TAG, 'Generating AI response via OpenAI');
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
                hasLocation: !!searchData.location,
                locationInfo: searchData.location ? {
                    hasCoords: !!(searchData.location.coords?.latitude && searchData.location.coords?.longitude),
                    accuracy: searchData.location.coords?.accuracy,
                    mocked: searchData.location.mocked,
                    hasCoordinates: !!(searchData.location.coords?.latitude && searchData.location.coords?.longitude)
                } : null,
                aiModel: aiResult.model,
                aiSource: aiResult.source,
                tokenUsage: aiResult.usage,
                timestamp: new Date().toISOString()
            }
        };

        console.log(TAG, 'Response prepared:', {
            chatId: response.chatId,
            responseLength: response.response.length,
            processingTime: response.metadata.processingTime,
            totalTime: response.metadata.totalTime,
            aiSource: response.metadata.aiSource,
            aiModel: response.metadata.aiModel
        });

        // Send response
        res.status(200).json(response);
        console.log(TAG, 'Response sent successfully');

        // TODO: In production, you might want to:
        // 1. Save the chat to a database
        // 2. Integrate with actual AI/ML services
        // 3. Implement rate limiting
        // 4. Add user authentication
        // 5. Log to external monitoring services

    } catch (error) {
        console.error(TAG, 'Error processing plan request:', error);
        
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
    console.log(TAG, 'GET /api/plan/status - Status check requested');
    
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
    console.log(TAG, 'GET /api/plan/test-ai - OpenAI test requested');
    
    try {
        const testResult = await openaiService.testConnection();
        
        res.status(testResult.success ? 200 : 503).json({
            service: 'OpenAI Test',
            ...testResult,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error(TAG, 'OpenAI test failed:', error);
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
        console.warn(TAG, `Unsupported method: ${req.method}`);
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
