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
// CONFIGURATION AND CONSTANTS
// ========================================

const TAG = '[OpenAI]';

/**
 * OpenAI client instance
 */
let openai = null;

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
        console.log(TAG, 'Client initialized successfully');
        return openai;
    } catch (error) {
        console.error(TAG, 'Failed to initialize client:', error.message);
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

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Builds the system prompt for the AI
 * @returns {string} - System prompt
 */
const buildSystemPrompt = () => {
    return `You are PlanIT, an expert travel planning assistant. Your role is to provide personalized, detailed travel recommendations based on user preferences.

CRITICAL: You MUST respond with a valid JSON object in the following format:
{
  "city": "Main city/location name, State, Country",
  "locations": [
    {
      "name": "Location Name",
      "address": "Full address or area description",
      "description": "Brief description of what to do here",
      "category": "restaurant|attraction|activity|shopping|accommodation",
      "estimatedTime": "How long to spend here (e.g., '2 hours', '30 minutes')",
      "time": "Start time for this location (e.g., '9:00 AM', '2:30 PM')",
      "priceRange": "Free|$|$$|$$$|$$$+",
      "imageURL": "https://url_to_image",
      "rating": 4.5,
      "phone": "Phone number or 'Not available'",
      "website": "Website URL or 'Not available'",
      "opening_hours": {
        "open_now": true,
        "weekday_text": ["Monday: 9:00 AM - 6:00 PM", "Tuesday: 9:00 AM - 6:00 PM", "etc..."]
      },
      "transitToNext": {
        "type": "Bus|Subway|Metro|Tram|Light Rail|Ferry|Train|Streetcar|Walk",
        "duration": "25 minutes",
        "details": "Route information or specific instructions"
      }
    }
  ],
  "summary": "A brief engaging introduction to the trip plan",
  "practicalTips": "Helpful tips for the trip"
}

GUIDELINES:
- Provide specific, actionable recommendations with names and details
- Consider the user's filters (time, environment, group size, budget, etc.)
- Include practical information like addresses, hours, or booking tips when relevant
- Always return 1-6 locations in the locations array
- Use a friendly, enthusiastic tone while being informative
- Prioritize safety and accessibility in recommendations
- The city field should be the main location/city name, state, and country (e.g., "Seattle, WA, USA", "Paris, France", "Downtown Portland, OR, USA", "Toronto, ON, Canada")
- Be sure to include the proper accents for the city name (e.g., "Montréal, QC, Canada", "Paris, Île-de-France, France")
- Each location should have a clear name, address, and category
- Estimate realistic time to spend at each location
- Consider local context and seasonal factors
- If the user requests for Transit, please include the transit options and routes to get to the locations. Consider the public transit schedules, time of day, whether it's a weekend, weekday, or holiday, etc.
- If the user requests for Dining, please include the dining options based on their specified budget and routes to get to the locations. Consider the dining hours, time of day, whether it's a weekend, weekday, or holiday, etc.

LOCATION DISCOVERY PREFERENCES:
- UNLESS the special option is "Tourist": Focus on local gems, hidden spots, neighborhood favorites, and authentic experiences that locals would recommend
- Prioritize unique, lesser-known venues over mainstream tourist attractions
- Include independent businesses, local artisans, community spots, and authentic cultural experiences
- Look for places that offer genuine local flavor and aren't overly commercialized
- IF special option is "Tourist": Include popular tourist attractions, well-known landmarks, and mainstream destinations alongside some local spots
- Always ensure venues have good reputations and positive reviews regardless of popularity level

ITINERARY TIMING:
- Create a logical time-based itinerary with realistic start times for each location
- Consider travel time between locations when setting start times
- Account for the user's preferred time of day (morning, afternoon, evening)
- Use practical times that align with venue hours and typical schedules
- Space locations appropriately to allow for transitions and breaks
- Format times clearly (e.g., "9:00 AM", "2:30 PM", "7:00 PM")
- Consider meal times when scheduling restaurant visits
- Account for rush hours and peak times at popular attractions

TRANSIT-SPECIFIC TIMING REQUIREMENTS:
- When Transit is included: ADD SIGNIFICANT BUFFER TIME between locations (minimum 20-30 minutes for local transit, 45+ minutes for longer distances)
- Factor in public transit schedules, frequency, and potential delays
- Consider walking time to/from transit stops (typically 5-10 minutes each way)
- Account for wait times between connections (5-15 minutes depending on system)
- Space attractions further apart in time to accommodate realistic public transit travel
- Prioritize locations along the same transit lines or routes when possible to minimize transfers
- Consider transit operating hours and frequency (rush hour vs off-peak timing)
- Leave extra time during peak transit hours (7-9 AM, 5-7 PM) for crowded conditions

TRANSIT TYPE AND ROUTING:
- ALWAYS include the "transitToNext" field for each location (except the last one) when transit is requested
- Specify exact transit types: "Bus", "Subway", "Metro", "Tram", "Light Rail", "Ferry", "Train", "Streetcar", "Walk"
- Include realistic duration with walking and waiting time (e.g., "25 minutes", "15 minutes") 
- Add route details when available (e.g., "Route 42", "Red Line", "Tram Line 1")
- For the last location in the array, omit the "transitToNext" field or set it to null

FOOD BUDGET REFERENCES:
- Budget ($10-$20 per person): Casual dining, food trucks, fast-casual restaurants
- Moderate ($20-$30 per person): Mid-range restaurants, popular local spots
- Premium ($30-$50 per person): Upscale dining, specialty restaurants, fine casual
- Luxury ($50+ per person): Fine dining, high-end establishments, chef-driven restaurants
COMPREHENSIVE LOCATION DATA:
- For each location, provide complete information as if you were a local travel guide
- Include accurate ratings based on real reputation and quality (1.0-5.0 scale)
- Provide real phone numbers when available, or "Not available" if unknown
- Include official websites or "Not available" if none exists
- Add realistic opening hours with current status (open_now: true/false)
- Use high-quality images from reliable sources (Unsplash, travel sites, official photos)
- Ensure all data represents actual, real locations with accurate details

RESPONSE FORMAT: Return ONLY the JSON object, no additional text or markdown formatting.`;
};

/**
 * Builds the user prompt based on search data
 * @param {Object} searchData - Search criteria and filters
 * @param {string} userMessage - User's message
 * @returns {string} - Formatted user prompt
 */
const buildUserPrompt = (searchData, userMessage) => {
    const { searchQuery, location, filters } = searchData;
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
`;

    // Add location information if provided
    if (location && location.coords) {
        prompt += `\nLOCATION CONTEXT:\n`;
        if (location.coords.latitude && location.coords.longitude) {
            prompt += `🗺️ Coordinates: ${location.coords.latitude}, ${location.coords.longitude}\n`;
        }
        if (location.coords.accuracy) {
            prompt += `📍 Location Accuracy: ${location.coords.accuracy}m\n`;
        }
        if (location.mocked) {
            prompt += `⚠️ Note: This is a simulated location\n`;
        }
    }

    prompt += `\nPREFERENCES:
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
        prompt += `⏱️ CRITICAL: Use extended timing between locations (minimum 20-30 min buffer) to account for public transit travel time, walking to/from stops, waiting, and potential delays\n`;
        prompt += `🚇 TRANSIT DETAILS: Include "transitToNext" field in each location JSON with type, duration, and details for getting to the next location\n`;
    }

    // Food planning - handle priceRange with proper budget descriptions
    if (planFood && priceRange) {
        // Map priceRange numbers to descriptive budget ranges
        const budgetDescriptions = {
            1: 'Budget ($10-$20 per person)',
            2: 'Moderate ($20-$30 per person)', 
            3: 'Premium ($30-$50 per person)',
            4: 'Luxury ($50+ per person)'
        };
        
        const budgetDescription = budgetDescriptions[priceRange] || priceRange;
        prompt += `🍽️ Include Dining: Yes - Budget: ${budgetDescription}\n`;
    } else if (planFood) {
        prompt += `🍽️ Include Dining: Yes\n`;
    }

    // Special options - include discovery preference guidance
    if (specialOption && specialOption !== 'auto') {
        const specialDescriptions = {
            casual: 'Casual, relaxed atmosphere with local favorites',
            tourist: 'Popular tourist attractions and must-see spots - Include well-known landmarks',
            wander: 'Off-the-beaten-path, hidden gems and local secrets',
            date: 'Romantic, intimate settings with local charm',
            family: 'Family-friendly activities for all ages, including local community spots'
        };
        
        if (specialOption.toLowerCase() === 'tourist') {
            prompt += `✨ Special Focus: ${specialDescriptions[specialOption]} - TOURIST MODE: Include mainstream attractions\n`;
        } else {
            prompt += `✨ Special Focus: ${specialDescriptions[specialOption]} - LOCAL MODE: Focus on neighborhood gems\n`;
        }
    } else {
        prompt += `✨ Discovery Mode: LOCAL - Focus on hidden gems, neighborhood favorites, and authentic local experiences\n`;
    }

    prompt += `\nPlease provide detailed, specific recommendations that match these preferences. Include venue names, practical details, and helpful tips!

IMPORTANT SEARCH REQUIREMENTS:
- Use the GPS coordinates provided to find REAL, EXISTING locations and businesses
- Search for current, operational establishments with accurate addresses
- Include real business hours, contact information when relevant
- For transit: Provide actual transit routes, schedules, and timing for the specified time of day. IMPORTANTLY: Space out location start times by AT LEAST 20-30 minutes (local transit) or 45+ minutes (longer distances) to account for realistic travel time including walking, waiting, and transit duration
- For food: Consider meal timing (breakfast: before 11am, lunch: 11am-2pm, dinner: 5pm-10pm, snacks: anytime)
- Factor in current day of week and season for hours and availability
- Prioritize highly-rated, currently open establishments when possible`;

    return prompt;
};

/**
 * Mock AI response generator (fallback when OpenAI is not available)
 * @param {Object} searchData - Search criteria
 * @returns {Object} - Mock response with Toronto trip data
 */
const generateMockResponse = (searchData) => {
    const { searchQuery, location, filters } = searchData;
    
    console.log(TAG, 'Generating Toronto mock response for query:', searchQuery);
    
    // Return the specific Toronto mock response data
    return {
        city: "Toronto, ON, Canada",
        locations: [
            {
                name: "St. Lawrence Market South",
                address: "93 Front St E, Toronto, ON M5E 1C3",
                description: "Iconic downtown public market—grab a peameal bacon sandwich or wander artisan stalls in a historic setting.",
                category: "attraction",
                estimatedTime: "45 minutes",
                time: "5:00 PM",
                priceRange: "$",
                imageURL: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0d/55/de/c5/outside-shot-of-st-lawrence.jpg?w=900&h=500&s=1",
                rating: 4.7,
                phone: "416‑392‑7219",
                website: "https://www.stlawrencemarket.com",
                opening_hours: {
                    open_now: true,
                    weekday_text: [
                        "Monday: Closed",
                        "Tuesday: 8:00 AM - 6:00 PM",
                        "Wednesday: 8:00 AM - 6:00 PM",
                        "Thursday: 8:00 AM - 6:00 PM",
                        "Friday: 8:00 AM - 6:00 PM",
                        "Saturday: 8:00 AM - 6:00 PM",
                        "Sunday: 9:00 AM - 5:00 PM"
                    ]
                },
                transitToNext: {
                    type: "Streetcar",
                    duration: "25 minutes",
                    details: "Walk ~5 min to King St East & Market St; take 504 King streetcar west to Spadina Ave, walk to Queen St West"
                }
            },
            {
                name: "Graffiti Alley & Queen West stroll",
                address: "Queen St W between Spadina Ave and Portland St, Toronto, ON",
                description: "Explore colourful street‑art in Graffiti Alley then wander Queen West's indie shops and cafes—a local creative stretch.",
                category: "activity",
                estimatedTime: "45 minutes",
                time: "5:40 PM",
                priceRange: "Free",
                imageURL: "https://a.travel-assets.com/findyours-php/viewfinder/images/res70/517000/517221-graffiti-alley.jpg",
                rating: 4.6,
                phone: "Not available",
                website: "Not available",
                opening_hours: {
                    open_now: true,
                    weekday_text: [
                        "Everyday: Open 24 hours"
                    ]
                },
                transitToNext: {
                    type: "Walk",
                    duration: "10 minutes",
                    details: "Stroll west along Queen St W toward Spadina Ave to The Cameron House"
                }
            },
            {
                name: "The Cameron House (live music)",
                address: "408 Queen St W, Toronto, ON M5V 2A7",
                description: "Local live‑music bar with an intimate vibe and rotating local acts on early evening sets.",
                category: "activity",
                estimatedTime: "1 hour",
                time: "6:30 PM",
                priceRange: "$$",
                imageURL: "https://www.theglobeandmail.com/resizer/v2/BG33DUNZFNBP7ECEAROYGP3UNI.JPG?auth=2c041d66581c55f49dcafb1a7a5502e629a7b6c57bcf41d4cd0f591905aa7340&width=2200&quality=80",
                rating: 4.5,
                phone: "416‑535‑3345",
                website: "http://www.thecameron.com",
                opening_hours: {
                    open_now: true,
                    weekday_text: [
                        "Monday: 6:00 PM - 2:00 AM",
                        "Tuesday to Saturday: 4:00 PM - 2:00 AM",
                        "Sunday: 5:00 PM - 12:00 AM"
                    ]
                },
                transitToNext: {
                    type: "Bus",
                    duration: "20 minutes",
                    details: "Walk ~5 min to Queen & Spadina Stn; take 121 Fort York‑Esplanade bus east to Gerrard St E & Jarvis, walk to Gallery Arcturus"
                }
            },
            {
                name: "Gallery Arcturus",
                address: "80 Gerrard St E, Toronto, ON M5B 1G6",
                description: "Free contemporary art gallery showing quirky exhibitions by local and Inuit artists.",
                category: "attraction",
                estimatedTime: "30 minutes",
                time: "7:55 PM",
                priceRange: "Free",
                imageURL: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/15/c4/e2/50/80-gerrard-street-east.jpg?w=900&h=500&s=1",
                rating: 4.4,
                phone: "Not available",
                website: "http://www.arcturus.ca",
                opening_hours: {
                    open_now: true,
                    weekday_text: [
                        "Monday: Closed",
                        "Tuesday to Saturday: 12:00 PM - 6:00 PM",
                        "Sunday: 12:00 PM - 5:00 PM"
                    ]
                },
                transitToNext: null
            }
        ],
        summary: "Here's a relaxed, arts‑infused afternoon in downtown Toronto—start with a market bite, wander local street art and boutiques, catch live music and end with a hidden gallery exhibition. All selected as local gems rather than tourist traps.",
        practicalTips: "St. Lawrence Market closes around 6 PM on weekdays—arrive no later than 5 PM. Streetcar lines can be busy at 5–6 PM—allow buffer. The Cameron House often starts music around 7 PM; check their schedule in advance. Gallery Arcturus closes at 6 PM on Saturdays but is open until 6 PM on weekdays—confirm current hours before going."
    };
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
        filters: Object.keys(searchData.filters).length,
        hasApiKey: !!process.env.OPENAI_API_KEY
    });

    try {
        // Check if OpenAI is available
        if (!openai) {
            console.log(TAG, 'Using mock response (no API key or client failed to initialize)');
            const mockResponse = generateMockResponse(searchData);
            
            return {
                content: mockResponse.summary,
                city: mockResponse.city,
                locations: mockResponse.locations,
                practicalTips: mockResponse.practicalTips,
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

        const response = completion.choices[0].message.content;
        const usage = completion.usage;

        console.log(TAG, 'Raw response received:', {
            responseLength: response.length,
            tokensUsed: usage.total_tokens,
            processingTime: Date.now() - startTime
        });

        // Parse JSON response from AI
        let parsedResponse;
        try {
            // Clean the response in case there's any markdown formatting
            const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            parsedResponse = JSON.parse(cleanedResponse);
            console.log(TAG, 'Successfully parsed JSON response:', {
                city: parsedResponse.city,
                locationCount: parsedResponse.locations?.length || 0
            });
        } catch (parseError) {
            console.error(TAG, 'Failed to parse JSON response:', parseError.message);
            console.log(TAG, 'Raw response that failed to parse:', response);
            
            // Fallback to mock response if JSON parsing fails
            const mockResponse = generateMockResponse(searchData);
            return {
                content: mockResponse.summary,
                city: mockResponse.city,
                locations: mockResponse.locations,
                practicalTips: mockResponse.practicalTips,
                usage: usage,
                model: completion.model,
                processingTime: Date.now() - startTime,
                source: 'openai_fallback',
                error: 'JSON parsing failed, used fallback response'
            };
        }

        // Use locations directly from OpenAI response (no Google Maps enhancement needed)
        const enhancedLocations = parsedResponse.locations || [];
        console.log(TAG, 'Using OpenAI-provided location data directly');

        console.log(TAG, 'Response generated successfully:', {
            city: parsedResponse.city,
            locationCount: enhancedLocations.length,
            tokensUsed: usage.total_tokens,
            processingTime: Date.now() - startTime,
            hasEnhancedData: enhancedLocations.some(loc => loc.photos && loc.photos.length > 0)
        });

        return {
            content: parsedResponse.summary || 'Here are some great recommendations for you!',
            city: parsedResponse.city || 'Unknown Location',
            locations: enhancedLocations,
            practicalTips: parsedResponse.practicalTips || '',
            usage: usage,
            model: completion.model,
            processingTime: Date.now() - startTime,
            source: 'openai'
        };

    } catch (error) {
        console.error(TAG, 'Error generating trip plan:', error);

        // Fallback to mock response on error
        console.log(TAG, 'Falling back to mock response due to error');
        const mockResponse = generateMockResponse(searchData);

        return {
            content: mockResponse.summary,
            city: mockResponse.city,
            locations: mockResponse.locations,
            practicalTips: mockResponse.practicalTips,
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
            model: 'gpt-3.5-turbo',
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
