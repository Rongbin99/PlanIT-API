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
const { createTrip } = require('../services/database');
const { optionalAuth } = require('../middleware/auth');

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
 * Cleans and validates extracted location string
 * @param {string} location - Raw extracted location string
 * @param {string} originalQuery - Original search query for context
 * @returns {string} Cleaned location string
 */
const cleanLocationString = (location, originalQuery) => {
    if (!location || typeof location !== 'string') {
        return '';
    }

    let cleaned = location.trim();

    // Remove common trailing words that aren't part of location
    const trailingWordsToRemove = [
        'for', 'with', 'and', 'or', 'but', 'so', 'yet', 'because',
        'restaurants', 'food', 'places', 'activities', 'things',
        'coffee', 'dinner', 'lunch', 'breakfast', 'shopping',
        'today', 'tomorrow', 'tonight', 'weekend'
    ];

    const words = cleaned.split(' ');
    let cleanedWords = [...words];

    // Remove trailing non-location words
    while (cleanedWords.length > 0) {
        const lastWord = cleanedWords[cleanedWords.length - 1].toLowerCase();
        if (trailingWordsToRemove.includes(lastWord)) {
            cleanedWords.pop();
        } else {
            break;
        }
    }

    cleaned = cleanedWords.join(' ').trim();

    // Minimum length validation
    if (cleaned.length < 2) {
        return '';
    }

    // Maximum length with intelligent truncation
    if (cleaned.length > 40) {
        // Try to truncate at word boundary
        const truncated = cleaned.substring(0, 40);
        const lastSpaceIndex = truncated.lastIndexOf(' ');
        
        if (lastSpaceIndex > 20) {
            cleaned = truncated.substring(0, lastSpaceIndex) + '...';
        } else {
            cleaned = truncated + '...';
        }
    }

    // Capitalize first letter of each word for display
    cleaned = cleaned.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    return cleaned;
};

/**
 * Extracts location using alternative patterns and heuristics
 * @param {string} query - Lowercase search query
 * @param {string} originalQuery - Original cased search query
 * @returns {string|null} Extracted location or null
 */
const extractAlternativeLocationPatterns = (query, originalQuery) => {
    // Pattern: "restaurants [in] downtown seattle" -> "downtown seattle"
    const restaurantPattern = /(?:restaurants?|food|dining|eat|coffee|bars?)\s+(?:in\s+)?(.+)/i;
    let match = originalQuery.match(restaurantPattern);
    if (match && match[1]) {
        const location = cleanLocationString(match[1], originalQuery);
        if (location.length > 2) return location;
    }

    // Pattern: "things to do [in] paris" -> "paris"
    const activitiesPattern = /(?:things\s+to\s+do|activities|attractions|visit|explore)\s+(?:in\s+)?(.+)/i;
    match = originalQuery.match(activitiesPattern);
    if (match && match[1]) {
        const location = cleanLocationString(match[1], originalQuery);
        if (location.length > 2) return location;
    }

    // Pattern: "show me [places in] tokyo" -> "tokyo"
    const showMePattern = /(?:show\s+me|find\s+me|get\s+me)\s+(?:places\s+(?:in\s+)?|.*?(?:in\s+))(.+)/i;
    match = originalQuery.match(showMePattern);
    if (match && match[1]) {
        const location = cleanLocationString(match[1], originalQuery);
        if (location.length > 2) return location;
    }

    // Pattern: Look for common city/state/country patterns
    const locationWords = [
        'city', 'town', 'village', 'downtown', 'uptown', 'district',
        'beach', 'park', 'center', 'square', 'street', 'avenue',
        'county', 'state', 'province', 'country'
    ];
    
    for (const locWord of locationWords) {
        if (query.includes(locWord)) {
            // Extract context around the location word
            const index = query.indexOf(locWord);
            const start = Math.max(0, index - 20);
            const end = Math.min(query.length, index + locWord.length + 20);
            const context = originalQuery.substring(start, end).trim();
            
            const contextLocation = cleanLocationString(context, originalQuery);
            if (contextLocation.length > 2) {
                return contextLocation;
            }
        }
    }

    return null;
};

/**
 * Extracts location information from search data using comprehensive pattern matching
 * @param {Object} searchData - Search data object
 * @returns {string} - Location string
 */
const extractLocationFromSearchData = (searchData) => {
    // Input validation
    if (!searchData || !searchData.searchQuery) {
        console.warn(TAG, 'Invalid search data provided to extractLocationFromSearchData');
        return 'Unknown Location';
    }

    const originalQuery = searchData.searchQuery.trim();
    
    // Handle empty or very short queries
    if (originalQuery.length === 0) {
        console.warn(TAG, 'Empty search query provided');
        return 'Unknown Location';
    }

    if (originalQuery.length <= 2) {
        console.warn(TAG, 'Search query too short for location extraction');
        return originalQuery;
    }

    const query = originalQuery.toLowerCase();
    console.log(TAG, 'Extracting location from query:', originalQuery);

    // Enhanced location patterns with priority order
    const locationPatterns = [
        // Most specific patterns first
        { pattern: ' near ', description: 'near pattern' },
        { pattern: ' in ', description: 'in pattern' },
        { pattern: ' at ', description: 'at pattern' },
        { pattern: ' around ', description: 'around pattern' },
        { pattern: ' from ', description: 'from pattern' },
        { pattern: ' to ', description: 'to pattern' },
        { pattern: ' by ', description: 'by pattern' },
        { pattern: ' close to ', description: 'close to pattern' },
        { pattern: ' next to ', description: 'next to pattern' },
    ];

    // Try each pattern in order
    for (const { pattern, description } of locationPatterns) {
        if (query.includes(pattern)) {
            const parts = query.split(pattern);
            let location = parts[parts.length - 1].trim();
            
            // Clean up the extracted location
            location = cleanLocationString(location, originalQuery);
            
            if (location && location.length > 0) {
                console.log(TAG, `Found location using ${description}:`, location);
                return location;
            }
        }
    }

    // Try alternative patterns for common queries
    const alternativeLocation = extractAlternativeLocationPatterns(query, originalQuery);
    if (alternativeLocation) {
        console.log(TAG, 'Found location using alternative pattern:', alternativeLocation);
        return alternativeLocation;
    }

    // If coordinates are available, use a generic location
    if (searchData.location?.coords?.latitude && searchData.location?.coords?.longitude) {
        const lat = searchData.location.coords.latitude.toFixed(4);
        const lng = searchData.location.coords.longitude.toFixed(4);
        return `Location (${lat}, ${lng})`;
    }

    // Fallback: use the original query with length limit
    const fallbackLocation = originalQuery.length > 50 
        ? `${originalQuery.substring(0, 50).trim()}...`
        : originalQuery;
        
    console.log(TAG, 'No location pattern found, using fallback:', fallbackLocation);
    return fallbackLocation;
};

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
 * Uses optional authentication - associates trip with user if authenticated.
 */
router.post('/', optionalAuth, async (req, res) => {
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

        // Extract title and location from search data
        const title = searchData.searchQuery || 'Untitled Trip';
        const location = extractLocationFromSearchData(searchData) || 'Location not specified';

        // Save trip to database
        console.log(TAG, 'Saving trip to database');
        try {
            const tripData = {
                id: chatId,
                title: title,
                location: location,
                searchData: searchData,
                userId: req.userId // null if not authenticated
            };
            
            await createTrip(tripData);
            console.log(TAG, 'Trip saved to database successfully:', chatId);
        } catch (dbError) {
            console.error(TAG, 'Failed to save trip to database:', dbError);
            // Continue with response even if database save fails
        }

        // Prepare response
        const response = {
            success: true,
            response: aiResult.content,
            chatId: chatId,
            title: title,
            location: location,
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
