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

// ========================================
// CONFIGURATION
// ========================================

/**
 * OpenAI client instance
 */
let openai = null;

/**
 * Initialize OpenAI client
 */
const initializeOpenAI = () => {
    if (!process.env.OPENAI_API_KEY) {
        console.warn('[OpenAI] No API key found, using mock responses');
        return null;
    }

    try {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        console.log('[OpenAI] Client initialized successfully');
        return openai;
    } catch (error) {
        console.error('[OpenAI] Failed to initialize client:', error.message);
        return null;
    }
};

/**
 * AI Model configuration
 */
const AI_CONFIG = {
    model: 'gpt-3.5-turbo', // Use GPT-3.5-turbo for cost efficiency
    maxTokens: 1000,
    temperature: 0.7, // Balanced creativity and consistency
    topP: 0.9,
    frequencyPenalty: 0.1,
    presencePenalty: 0.1
};

/**
 * Price range mapping for AI context
 */
const PRICE_RANGE_MAP = {
    1: '$ (Budget-friendly, under $20 per person)',
    2: '$$ (Moderate, $20-30 per person)',
    3: '$$$ (Upscale, $30-50 per person)',
    4: '$$$+ (Luxury, $50+ per person)'
};

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Builds the system prompt for the AI
 * @returns {string} - System prompt
 */
const buildSystemPrompt = () => {
    return `You are PlanIT, an expert travel planning assistant. Your role is to provide personalized, detailed travel recommendations based on user preferences.

GUIDELINES:
- Provide specific, actionable recommendations with names and details
- Consider the user's filters (time, environment, group size, budget, etc.)
- Include practical information like addresses, hours, or booking tips when relevant
- Use a friendly, enthusiastic tone while being informative
- Structure responses with clear sections and bullet points
- Always consider local context and seasonal factors
- Prioritize safety and accessibility in recommendations

FORMAT:
- Start with a brief, engaging introduction
- Organize recommendations by category or priority
- Include specific venue/location names
- Add practical details (pricing, timing, booking info)
- End with a helpful tip or call-to-action

Remember: You're helping people create memorable experiences, so be specific and helpful!`;
};

/**
 * Builds the user prompt based on search data
 * @param {Object} searchData - Search criteria and filters
 * @param {string} userMessage - User's message
 * @returns {string} - Formatted user prompt
 */
const buildUserPrompt = (searchData, userMessage) => {
    const { searchQuery, filters } = searchData;
    const {
        timeOfDay,
        environment,
        planTransit,
        groupSize,
        planFood,
        priceRange,
        specialOption
    } = filters;

    let prompt = `TRIP PLANNING REQUEST:

Search Query: "${searchQuery}"
User Message: "${userMessage}"

PREFERENCES:
`;

    // Time preferences
    if (timeOfDay && timeOfDay.length > 0) {
        prompt += `⏰ Time of Day: ${timeOfDay.join(', ')}\n`;
    }

    // Environment preference
    prompt += `🏢 Environment: ${environment} locations\n`;

    // Group size
    prompt += `👥 Group Size: ${groupSize}\n`;

    // Transit planning
    if (planTransit) {
        prompt += `🚌 Include Transportation: Yes - please include transit options and routes\n`;
    }

    // Food planning
    if (planFood && priceRange) {
        const priceDescription = PRICE_RANGE_MAP[priceRange] || 'Not specified';
        prompt += `🍽️ Include Dining: Yes - Budget: ${priceDescription}\n`;
    }

    // Special options
    if (specialOption && specialOption !== 'auto') {
        const specialDescriptions = {
            casual: 'Casual, relaxed atmosphere',
            tourist: 'Popular tourist attractions and must-see spots',
            wander: 'Off-the-beaten-path, hidden gems',
            date: 'Romantic, intimate settings',
            family: 'Family-friendly activities for all ages'
        };
        prompt += `✨ Special Focus: ${specialDescriptions[specialOption]}\n`;
    }

    prompt += `\nPlease provide detailed, specific recommendations that match these preferences. Include venue names, practical details, and helpful tips!`;

    return prompt;
};

/**
 * Mock AI response generator (fallback when OpenAI is not available)
 * @param {Object} searchData - Search criteria
 * @returns {string} - Mock response
 */
const generateMockResponse = (searchData) => {
    const { searchQuery, filters } = searchData;
    
    return `🎯 **${searchQuery}**

I'd love to help you plan this trip! Here are some great recommendations:

**Top Suggestions:**
• **Local Favorites** - Highly rated spots that locals love
• **Must-See Attractions** - Popular destinations perfect for your ${filters.groupSize} group
• **Hidden Gems** - Unique experiences you won't find in typical guides

${filters.planFood ? `**Dining Recommendations:**
• Budget-friendly options that match your preferences
• Local cuisine worth trying
• Convenient locations near your activities` : ''}

${filters.planTransit ? `**Transportation Tips:**
• Best routes to get around
• Public transit options
• Walking distances between locations` : ''}

**Practical Tips:**
• Best times to visit based on your ${filters.timeOfDay.join(' and ')} preference
• What to expect for ${filters.environment} activities
• Booking recommendations and advance planning

*Note: This is a demo response. Enable OpenAI integration for personalized AI recommendations!*

💡 **Next Steps:** Feel free to ask for more specific details about any of these suggestions!`;
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
    console.log('[OpenAI] Generating trip plan for:', {
        query: searchData.searchQuery,
        filters: Object.keys(searchData.filters).length,
        hasApiKey: !!process.env.OPENAI_API_KEY
    });

    try {
        // Check if OpenAI is available
        if (!openai) {
            console.log('[OpenAI] Using mock response (no API key or client failed to initialize)');
            const mockResponse = generateMockResponse(searchData);
            
            return {
                content: mockResponse,
                usage: {
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0
                },
                model: 'mock',
                processingTime: Date.now() - startTime,
                source: 'mock'
            };
        }

        // Build prompts
        const systemPrompt = buildSystemPrompt();
        const userPrompt = buildUserPrompt(searchData, userMessage);

        console.log('[OpenAI] Sending request to GPT model:', AI_CONFIG.model);
        console.log('[OpenAI] User prompt length:', userPrompt.length);

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

        const response = completion.choices[0].message.content;
        const usage = completion.usage;

        console.log('[OpenAI] Response generated successfully:', {
            responseLength: response.length,
            tokensUsed: usage.total_tokens,
            processingTime: Date.now() - startTime
        });

        return {
            content: response,
            usage: usage,
            model: completion.model,
            processingTime: Date.now() - startTime,
            source: 'openai'
        };

    } catch (error) {
        console.error('[OpenAI] Error generating trip plan:', error);

        // Fallback to mock response on error
        console.log('[OpenAI] Falling back to mock response due to error');
        const mockResponse = generateMockResponse(searchData);

        return {
            content: mockResponse,
            usage: {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
            },
            model: 'mock',
            processingTime: Date.now() - startTime,
            source: 'mock_fallback',
            error: error.message
        };
    }
};

/**
 * Tests OpenAI connection
 * @returns {Promise<Object>} - Connection test result
 */
const testConnection = async () => {
    console.log('[OpenAI] Testing connection...');

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
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: 'Say "Hello from PlanIT!"' }],
            max_tokens: 20
        });

        console.log('[OpenAI] Connection test successful');
        return {
            success: true,
            message: 'OpenAI connection successful',
            response: completion.choices[0].message.content,
            model: completion.model
        };

    } catch (error) {
        console.error('[OpenAI] Connection test failed:', error.message);
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

// Initialize OpenAI client on module load
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
