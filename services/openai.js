/**
 * OpenAI Service
 * 
 * Handles AI-powered trip planning recommendations using OpenAI's GPT models.
 * Processes search queries and filters to generate personalized travel suggestions.
 * 
 * @author Rongbin Gu (@rongbin99)
 */

// ========================================
// IMPORTS
// ========================================
const OpenAI = require('openai');
const { buildSystemPrompt, buildUserPrompt, generateMockResponse } = require('./aiPrompts');
const { parseModelJson, normalizeUsage, buildFallbackTripPlanResponse } = require('./aiHelpers');

// ========================================
// CONFIGURATION AND CONSTANTS
// ========================================
const TAG = '[OpenAI]';

/**
 * OpenAI client instance
 */
let openai = null;

/**
 * AI Model configuration
 */
const AI_CONFIG = {
    model: 'gpt-4o-mini', // Better quality/cost balance for structured travel planning
    maxTokens: 1000,
    temperature: 0.7, // Balanced creativity and consistency
    topP: 0.9,
    frequencyPenalty: 0.1,
    presencePenalty: 0.1
};

/**
 * Initialize OpenAI client
 */
const initializeOpenAI = () => {
    if (!process.env.OPENAI_API_KEY) {
        console.warn(TAG, 'No API key found, using mock responses');
        return null;
    }

    try {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        console.log(TAG, 'OpenAI client initialized successfully');
        return openai;
    } catch (error) {
        console.error(TAG, 'Failed to initialize client:', error.message);
        return null;
    }
};

// ========================================
// MAIN SERVICE FUNCTIONS
// ========================================

/**
 * Generates AI-powered trip planning response
 * @param {Object} searchData - Search criteria and filters
 * @param {string} userMessage - User's input message
 * @returns {Promise<Object>} - AI response with metadata
 */
const generateTripPlan = async (searchData, userMessage) => {
    const startTime = Date.now();
    console.log(TAG, 'Generating trip plan for:', {
        query: searchData.searchQuery,
        filters: Object.keys(searchData.filters || {}).length,
        hasApiKey: !!process.env.OPENAI_API_KEY
    });

    try {
        // Check if OpenAI is available
        if (!openai) {
            console.log(TAG, 'Using mock response (no API key or client failed to initialize)');
            const mockResponse = generateMockResponse(searchData);

            return buildFallbackTripPlanResponse({
                mockResponse,
                usage: normalizeUsage(),
                model: 'mock',
                source: 'mock',
                processingTime: Date.now() - startTime
            });
        }

        // Build prompts
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(searchData, userMessage);

        console.log(TAG, 'Sending request to GPT model:', AI_CONFIG.model);
        console.log(TAG, 'User prompt length:', userPrompt.length);
        console.log(TAG, '=== COMPLETE PROMPT SENT TO OPENAI ===');
        console.log(TAG, 'SYSTEM PROMPT:');
        console.log(systemPrompt);
        console.log(TAG, '--- END SYSTEM PROMPT ---');
        console.log(TAG, 'USER PROMPT:');
        console.log(userPrompt);
        console.log(TAG, '--- END USER PROMPT ---');
        console.log(TAG, '=== END COMPLETE PROMPT ===');

        // Make API call to OpenAI
        const completion = await openai.chat.completions.create({
            model: AI_CONFIG.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: AI_CONFIG.maxTokens,
            temperature: AI_CONFIG.temperature,
            top_p: AI_CONFIG.topP,
            frequency_penalty: AI_CONFIG.frequencyPenalty,
            presence_penalty: AI_CONFIG.presencePenalty,
        });

        const responseText = completion.choices[0].message.content || '';
        const usage = normalizeUsage(completion.usage);

        console.log(TAG, 'Raw response received:', {
            responseLength: responseText.length,
            tokensUsed: usage.totalTokens,
            processingTime: Date.now() - startTime
        });

        const parsedResponse = parseModelJson(responseText);
        if (!parsedResponse) {
            console.error(TAG, 'Failed to parse JSON response');
            console.log(TAG, 'Raw response that failed to parse:', responseText);
            
            // Fallback to mock response if JSON parsing fails
            const mockResponse = generateMockResponse(searchData);
            return buildFallbackTripPlanResponse({
                mockResponse,
                usage,
                model: completion.model,
                source: 'openai_fallback',
                processingTime: Date.now() - startTime,
                error: 'JSON parsing failed, used fallback response'
            });
        }

        const locations = parsedResponse.locations || [];

        console.log(TAG, 'Response generated successfully:', {
            city: parsedResponse.city,
            locationCount: locations.length,
            tokensUsed: usage.totalTokens,
            processingTime: Date.now() - startTime
        });

        return {
            content: parsedResponse.summary || 'Here are some great recommendations for you!',
            city: parsedResponse.city || 'Unknown Location',
            locations,
            practicalTips: parsedResponse.practicalTips || '',
            usage,
            model: completion.model,
            processingTime: Date.now() - startTime,
            source: 'openai'
        };

    } catch (error) {
        console.error(TAG, 'Error generating trip plan:', error);

        // Fallback to mock response on error
        console.log(TAG, 'Falling back to mock response due to error');
        const mockResponse = generateMockResponse(searchData);

        return buildFallbackTripPlanResponse({
            mockResponse,
            usage: normalizeUsage(),
            model: 'mock',
            source: 'mock_fallback',
            processingTime: Date.now() - startTime,
            error: error.message
        });
    }
};

/**
 * Tests OpenAI connection
 * @returns {Promise<Object>} - Connection test result
 */
const testConnection = async () => {
    console.log(TAG, 'Testing connection...');

    try {
        if (!openai) {
            return {
                success: false,
                message: 'OpenAI client not initialized (check API key)',
                hasApiKey: !!process.env.OPENAI_API_KEY
            };
        }

        // Simple test request
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Say "Hello from PlanIT!"' }],
            max_tokens: 20
        });

        console.log(TAG, 'Connection test successful');
        return {
            success: true,
            message: 'OpenAI connection successful',
            response: completion.choices[0].message.content,
            model: completion.model
        };

    } catch (error) {
        console.error(TAG, 'Connection test failed:', error.message);
        return {
            success: false,
            message: `Connection failed: ${error.message}`,
            hasApiKey: !!process.env.OPENAI_API_KEY
        };
    }
};

/**
 * Gets service status and configuration
 * @returns {Object} - Service status information
 */
const getServiceStatus = () => {
    return {
        initialized: !!openai,
        hasApiKey: !!process.env.OPENAI_API_KEY,
        model: AI_CONFIG.model,
        configuration: {
            maxTokens: AI_CONFIG.maxTokens,
            temperature: AI_CONFIG.temperature,
            topP: AI_CONFIG.topP
        },
        timestamp: new Date().toISOString()
    };
};

// ========================================
// INITIALIZATION
// ========================================
initializeOpenAI();

// ========================================
// EXPORTS
// ========================================
module.exports = {
    generateTripPlan,
    testConnection,
    getServiceStatus,
    initializeOpenAI
}; 
