/**
 * Gemini Service
 * 
 * Handles AI-powered trip planning recommendations using Google's Gemini API.
 * Processes search queries and filters to generate personalized travel suggestions.
 * 
 * @author Rongbin Gu (@rongbin99)
 */

// ========================================
// IMPORTS
// ========================================
const { GoogleGenAI } = require('@google/genai');
const { buildSystemPrompt, buildUserPrompt, generateMockResponse } = require('./aiPrompts');
const { parseModelJson, normalizeUsage, buildFallbackTripPlanResponse } = require('./aiHelpers');

// ========================================
// CONFIGURATION AND CONSTANTS
// ========================================
const TAG = '[Gemini]';

/**
 * Gemini client instance
 */
let gemini = null;

/**
 * AI model configuration
 */
const AI_CONFIG = {
    model: 'gemini-2.5-flash',
    maxTokens: 1000,
    temperature: 0.7,
    topP: 0.9
};

/**
 * Initialize Gemini client
 */
const initializeGemini = () => {
    if (!process.env.GEMINI_API_KEY) {
        console.warn(TAG, 'No API key found, using mock responses');
        return null;
    }

    try {
        gemini = new GoogleGenAI({ 
            apiKey: process.env.GEMINI_API_KEY,
        });
        console.log(TAG, 'Gemini client initialized successfully');
        return gemini;
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
 * @param {Object} searchData
 * @param {string} userMessage
 * @returns {Promise<Object>}
 */
const generateTripPlan = async (searchData, userMessage) => {
    const startTime = Date.now();
    console.log(TAG, 'Generating trip plan for:', {
        query: searchData.searchQuery,
        filters: Object.keys(searchData.filters || {}).length,
        hasApiKey: !!process.env.GEMINI_API_KEY
    });

    try {
        if (!gemini) {
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

        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(searchData, userMessage);
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

        console.log(TAG, 'Sending request to Gemini model:', AI_CONFIG.model);
        console.log(TAG, '=== COMPLETE PROMPT SENT TO GEMINI ===');
        console.log(TAG, 'SYSTEM PROMPT:');
        console.log(systemPrompt);
        console.log(TAG, '--- END SYSTEM PROMPT ---');
        console.log(TAG, 'USER PROMPT:');
        console.log(userPrompt);
        console.log(TAG, '--- END USER PROMPT ---');
        console.log(TAG, '=== END COMPLETE PROMPT ===');

        const result = await gemini.models.generateContent({
            model: AI_CONFIG.model,
            contents: fullPrompt,
            config: {
                responseMimeType: 'application/json',
                temperature: AI_CONFIG.temperature,
                topP: AI_CONFIG.topP,
                maxOutputTokens: AI_CONFIG.maxTokens
            }
        });

        const responseText = result.text || '';
        const usage = normalizeUsage(result.usageMetadata);

        console.log(TAG, 'Raw response received:', {
            responseLength: responseText.length,
            tokensUsed: usage.totalTokens,
            processingTime: Date.now() - startTime
        });

        const parsedResponse = parseModelJson(responseText);

        if (!parsedResponse) {
            console.error(TAG, 'Failed to parse JSON response');
            console.log(TAG, 'Raw response that failed to parse:', responseText);
            const mockResponse = generateMockResponse(searchData);
            return buildFallbackTripPlanResponse({
                mockResponse,
                usage,
                model: AI_CONFIG.model,
                source: 'gemini_fallback',
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
            model: AI_CONFIG.model,
            processingTime: Date.now() - startTime,
            source: 'gemini'
        };
    } catch (error) {
        console.error(TAG, 'Error generating trip plan:', error.message);
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
 * Tests Gemini connection
 * @returns {Promise<Object>}
 */
const testConnection = async () => {
    console.log(TAG, 'Testing connection...');

    try {
        if (!gemini) {
            return {
                success: false,
                message: 'Gemini client not initialized (check API key)',
                hasApiKey: !!process.env.GEMINI_API_KEY
            };
        }

        const result = await gemini.models.generateContent({
            model: AI_CONFIG.model,
            contents: 'Say "Hello from PlanIT!"',
            config: {
                maxOutputTokens: 20
            }
        });

        return {
            success: true,
            message: 'Gemini connection successful',
            response: result.text || '',
            model: AI_CONFIG.model
        };
    } catch (error) {
        console.error(TAG, 'Connection test failed:', error.message);
        return {
            success: false,
            message: `Connection failed: ${error.message}`,
            hasApiKey: !!process.env.GEMINI_API_KEY
        };
    }
};

/**
 * Gets service status and configuration
 * @returns {Object}
 */
const getServiceStatus = () => ({
    initialized: !!gemini,
    hasApiKey: !!process.env.GEMINI_API_KEY,
    model: AI_CONFIG.model,
    configuration: {
        maxTokens: AI_CONFIG.maxTokens,
        temperature: AI_CONFIG.temperature,
        topP: AI_CONFIG.topP
    },
    timestamp: new Date().toISOString()
});

// ========================================
// INITIALIZATION
// ========================================
initializeGemini();

// ========================================
// EXPORTS
// ========================================
module.exports = {
    generateTripPlan,
    testConnection,
    getServiceStatus,
    initializeGemini
};
