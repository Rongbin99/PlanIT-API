/**
 * Shared helpers for AI provider services.
 * 
 * @author Rongbin Gu (@rongbin99)
 */

/**
 * Parses model output into JSON.
 * Handles fenced markdown JSON and partial surrounding text.
 *
 * @param {string} text
 * @returns {Object|null}
 */
const parseModelJson = (text) => {
    if (!text) return null;

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    try {
        return JSON.parse(cleaned);
    } catch (error) {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const candidate = cleaned.slice(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(candidate);
            } catch (innerError) {
                return null;
            }
        }

        return null;
    }
};

/**
 * Normalizes provider-specific usage metadata to one shape.
 *
 * @param {Object} usageMetadata
 * @returns {{ promptTokens: number, completionTokens: number, totalTokens: number }}
 */
const normalizeUsage = (usageMetadata = {}) => ({
    promptTokens:
        usageMetadata.promptTokens ??
        usageMetadata.promptTokenCount ??
        usageMetadata.prompt_tokens ??
        0,
    completionTokens:
        usageMetadata.completionTokens ??
        usageMetadata.candidatesTokenCount ??
        usageMetadata.completion_tokens ??
        0,
    totalTokens:
        usageMetadata.totalTokens ??
        usageMetadata.totalTokenCount ??
        usageMetadata.total_tokens ??
        0
});

/**
 * Builds a standardized fallback trip-plan response object.
 *
 * @param {Object} params
 * @param {Object} params.mockResponse
 * @param {Object} [params.usage]
 * @param {string} params.model
 * @param {string} params.source
 * @param {number} params.processingTime
 * @param {string} [params.error]
 * @returns {Object}
 */
const buildFallbackTripPlanResponse = ({
    mockResponse,
    usage = normalizeUsage(),
    model,
    source,
    processingTime,
    error
}) => {
    const response = {
        content: mockResponse.summary,
        city: mockResponse.city,
        locations: mockResponse.locations,
        practicalTips: mockResponse.practicalTips,
        usage,
        model,
        processingTime,
        source
    };

    if (error) {
        response.error = error;
    }

    return response;
};

/**
 * Sends a standard 503 response when AI client is unavailable.
 *
 * @param {Object|null} client
 * @param {Object} res
 * @param {string} providerName
 * @param {Object} [responseBody]
 * @param {string} [logTag]
 * @returns {boolean}
 */
const ensureAIClientAvailable = (
    client,
    res,
    providerName,
    responseBody = {},
    logTag = '[AIHelpers]'
) => {
    if (client) {
        return true;
    }

    console.error(logTag, `AI client unavailable for provider "${providerName}"`);
    res.status(503).json({
        ...responseBody,
        message: responseBody.message || 'AI provider is not configured correctly',
        timestamp: new Date().toISOString()
    });

    return false;
};

module.exports = {
    parseModelJson,
    normalizeUsage,
    buildFallbackTripPlanResponse,
    ensureAIClientAvailable
};
