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
      "coordinates": {
        "latitude": 43.6532,
        "longitude": -79.3832
      },
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
- Add realistic opening hours (e.g., "Monday: 9:00 AM - 6:00 PM", "Tuesday: 9:00 AM - 6:00 PM", "etc...")
- Provide accurate GPS coordinates (latitude and longitude) for each location
- Ensure all data represents actual, real locations with accurate details and coordinates

RESPONSE FORMAT: Return ONLY the JSON object, no additional text or markdown formatting.`;
};

/**
 * Builds the user prompt based on search data
 * @param {Object} searchData - Search criteria and filters
 * @param {string} userMessage - User's message
 * @returns {string} - Formatted user prompt
 */
const buildUserPrompt = (searchData, userMessage) => {
    const { searchQuery, location, filters, regenerationContext } = searchData;
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

    // Add regeneration context if this is a regeneration request
    if (regenerationContext && regenerationContext.excludedLocation) {
        prompt += `\n🔄 REGENERATION CONTEXT:
This is a regeneration request to replace a specific location from a previous plan.
Excluded Location: "${regenerationContext.excludedLocation}"
Original Query: "${regenerationContext.originalQuery || searchQuery}"
Original Chat ID: "${regenerationContext.originalChatId || 'unknown'}"

IMPORTANT: Please provide alternative locations that are similar to the excluded location but different venues. Focus on the same category and style but different specific businesses or attractions.
`;
    }

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
- Provide accurate GPS coordinates (latitude and longitude) for each recommended location
- For transit: Provide actual transit routes, schedules, and timing for the specified time of day. IMPORTANTLY: Space out location start times by AT LEAST 20-30 minutes (local transit) or 45+ minutes (longer distances) to account for realistic travel time including walking, waiting, and transit duration
- For food: Consider meal timing (breakfast: before 11am, lunch: 11am-2pm, dinner: 5pm-10pm, snacks: anytime)
- Factor in current day of week and season for hours and availability
- Prioritize highly-rated, currently open establishments when possible`;

    return prompt;
};

/**
 * Mock AI response generator (fallback when OpenAI is not available)
 * @param {Object} searchData - Search criteria
 * @returns {Object} - Mock response with Vancouver trip data
 */
const generateMockResponse = (searchData) => {
    const { searchQuery, location, filters } = searchData;
    
    console.log(TAG, 'Generating Vancouver mock response for query:', searchQuery);
    
    // Return the specific Vancouver mock response data
    return {
        city: "Vancouver, BC, Canada",
        locations: [
            {
                name: "Queen Elizabeth Park – Quarry Garden",
                address: "4600 Cambie St, Vancouver, BC V5Y 2M4",
                description: "A serene elevated garden offering calm city views, flowering gardens, and peaceful walking paths—perfect for unwinding after work.",
                category: "activity",
                estimatedTime: "45 minutes",
                time: "6:00 PM",
                priceRange: "Free",
                coordinates: {
                    latitude: 49.2416,
                    longitude: -123.1133
                },
                rating: 4.4,
                phone: "Not available",
                website: "https://vancouver.ca/parks-recreation-culture/queen-elizabeth-park.aspx",
                opening_hours: {
                    open_now: true,
                    weekday_text: ["Monday–Sunday: 5:30 AM–10:00 PM"]
                },
                transitToNext: {
                    type: "Bus",
                    duration: "25 minutes",
                    details: "Bus 33 from Cambie St at W 33rd Ave to Cambie St at King Edward Ave, then 5‑min walk"
                }
            },
            {
                name: "Seawall stroll at Coal Harbour / Stanley Park",
                address: "Coal Harbour Waterfront, Vancouver, BC",
                description: "A gentle, atmospheric walk along the water's edge; you'll get reflections of city lights on the water and a peaceful evening breeze.",
                category: "activity",
                estimatedTime: "60 minutes",
                time: "6:45 PM",
                priceRange: "Free",
                coordinates: {
                    latitude: 49.3060,
                    longitude: -123.1420
                },
                rating: 4.8,
                phone: "Not available",
                website: "Not available",
                opening_hours: {
                    open_now: true,
                    weekday_text: ["Monday–Sunday: Open 24 hours"]
                },
                transitToNext: {
                    type: "Metro + Walk",
                    duration: "30 minutes",
                    details: "SkyTrain Canada Line from King Edward to Waterfront (Expo Line transfer), then 10‑min walk to Coal Harbour Seawall"
                }
            },
            {
                name: "Forest‑bathe in a guided session at Lighthouse Park",
                address: "Lighthouse Park, West Vancouver, BC",
                description: "Join a calming forest‑bathing (shinrin‑yoku) session among ancient trees, guided to help release work stress and reconnect with nature.",
                category: "activity",
                estimatedTime: "60 minutes",
                time: "7:30 PM",
                priceRange: "$$ (guided session fees apply)",
                coordinates: {
                    latitude: 49.3394,
                    longitude: -123.4160
                },
                rating: 4.7,
                phone: "Not available (book through Talaysay Tours)",
                website: "Not available",
                opening_hours: {
                    open_now: true,
                    weekday_text: ["Evening sessions – check tour provider"]
                },
                transitToNext: {
                    type: "Bus + Ferry",
                    duration: "45 minutes",
                    details: "SeaBus from Waterfront to Lonsdale Quay (~15 min), then Bus 250 to Lighthouse Park (~20 min), plus walking"
                }
            },
            {
                name: "Dinner at a local favorite: The Dark Table",
                address: "2692 Granville St, Vancouver, BC V6H 3H4",
                description: "A unique sensory-diminished dining experience in semi-darkness—calm, immersive and perfect for gentle reflection over a moderate dinner.",
                category: "restaurant",
                estimatedTime: "75 minutes",
                time: "8:45 PM",
                priceRange: "$$ ($20–$30 per person)",
                coordinates: {
                    latitude: 49.2649,
                    longitude: -123.1381
                },
                rating: 4.3,
                phone: "+1 604‑737‑0440",
                website: "https://thedarktable.ca",
                opening_hours: {
                    open_now: false,
                    weekday_text: ["Tuesday–Saturday: 5:00 PM–9:00 PM"]
                },
                transitToNext: {
                    type: "Bus",
                    duration: "30 minutes",
                    details: "Bus 250 back to Lonsdale Quay, SeaBus to Waterfront, then Bus 22 to Granville St at 2nd Ave"
                }
            },
            {
                name: "Quiet drink at a neighborhood gem – Odd Society Spirits (tasting room)",
                address: "75 West 4th Ave, Vancouver, BC V5Y 1G9",
                description: "An intimate local distillery tasting room in a relaxed, adult‑focused setting—great for a calm nightcap and authentic local flavour.",
                category: "restaurant",
                estimatedTime: "45 minutes",
                time: "10:00 PM",
                priceRange: "$$",
                coordinates: {
                    latitude: 49.2640,
                    longitude: -123.1110
                },
                rating: 4.5,
                phone: "+1 604‑255‑1815",
                website: "https://oddsocietyspirits.com",
                opening_hours: {
                    open_now: true,
                    weekday_text: ["Tuesday–Saturday: 5:00 PM–10:00 PM"]
                },
                transitToNext: null
            }
        ],
        summary: "Here's a calming solo‑evening outing in Vancouver tailored just for you: start with peaceful garden views high above the city, meander along the Seawall with the reflected city lights, immerse in a forest‑bathing session in ancient west‑coast forest, enjoy a unique moderate‑budget dinner in sensory calm, and top it off with a relaxed, local‑flavor nightcap.",
        practicalTips: "Allow 30 minutes buffer between activities for transit and walking. SkyTrain, SeaBus and buses run well into the evening, but check schedules for post‑9 PM services. Book forest‑bathing sessions in advance (via Talaysay Tours). For The Dark Table, reservations are strongly recommended—dining is in semi‑darkness and seating is limited. Dress in layers for changing temperatures, especially near water or forest. Finally, carry a small flashlight or phone light for any walking in dim settings (e.g. Lighthouse Park trail)."
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
