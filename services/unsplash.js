/**
 * Unsplash Service
 * 
 * Fetches location-based images from Unsplash API for trip planning.
 * Uses direct location strings from trip data for reliable image search.
 * 
 * @author Rongbin Gu (@rongbin99)
 */

// ========================================
// IMPORTS
// ========================================
const { createApi } = require('unsplash-js');

// ========================================
// CONSTANTS
// ========================================
const TAG = '[Unsplash]';

// ========================================
// CONFIGURATION
// ========================================

/**
 * Unsplash API client
 */
let unsplashApi = null;

/**
 * Initialize Unsplash API client
 */
const initializeUnsplash = () => {
    if (!process.env.UNSPLASH_API_KEY) {
        console.warn(TAG, 'No API key found');
        return null;
    }

    try {
        unsplashApi = createApi({
            accessKey: process.env.UNSPLASH_API_KEY,
        });
        console.log(TAG, 'Client initialized successfully');
        return unsplashApi;
    } catch (error) {
        console.error(TAG, 'Failed to initialize client:', error.message);
        return null;
    }
};

/**
 * Unsplash API configuration
 */
const UNSPLASH_CONFIG = {
    defaultParams: {
        per_page: 1,
        orientation: 'landscape',
        content_filter: 'high'
    }
};

/**
 * Context keywords for different activity types
 */
const CONTEXT_KEYWORDS = {
    food: ['architecture', 'street'],
    outdoor: ['landscape', 'nature'],
    tourist: ['landmark', 'architecture'],
    shopping: ['street', 'architecture'],
    nightlife: ['cityscape', 'night'],
    family: ['cityscape', 'park'],
    sports: ['architecture', 'sports'],
    business: ['skyline', 'architecture'],
    default: ['cityscape', 'architecture']
};

/**
 * Image cache (in production, use Redis or similar)
 */
const imageCache = new Map();

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Builds optimized search query for Unsplash based on location and context
 * @param {string} location - Location name  
 * @param {string} context - Optional context from search query
 * @returns {string} - Optimized search query
 */
const buildImageSearchQuery = (location, context = '') => {
    const lowerContext = context.toLowerCase();
    
    // Determine context type
    let contextType = 'default';
    if (lowerContext.includes('restaurant') || lowerContext.includes('food') || lowerContext.includes('dining')) {
        contextType = 'food';
    } else if (lowerContext.includes('outdoor') || lowerContext.includes('park') || lowerContext.includes('nature')) {
        contextType = 'outdoor';
    } else if (lowerContext.includes('tourist') || lowerContext.includes('attraction') || lowerContext.includes('museum')) {
        contextType = 'tourist';
    } else if (lowerContext.includes('shopping') || lowerContext.includes('mall')) {
        contextType = 'shopping';
    } else if (lowerContext.includes('nightlife') || lowerContext.includes('entertainment')) {
        contextType = 'nightlife';
    } else if (lowerContext.includes('family') || lowerContext.includes('kids')) {
        contextType = 'family';
    } else if (lowerContext.includes('sports') || lowerContext.includes('fitness')) {
        contextType = 'sports';
    } else if (lowerContext.includes('business') || lowerContext.includes('work')) {
        contextType = 'business';
    }
    
    // Get keywords for the context
    const keywords = CONTEXT_KEYWORDS[contextType];
    
    // Combine location with context keywords
    return `${location} ${keywords.join(' ')}`.trim();
};

/**
 * Cleans a location string to extract the main city/location
 * @param {string} locationString - Location string (e.g., "Toronto, Ontario, Canada")
 * @returns {string|null} - Cleaned location or null
 */
const cleanLocationString = (locationString) => {
    if (!locationString || typeof locationString !== 'string') {
        return null;
    }
    
    // Split by comma and take the first part (usually the city)
    const parts = locationString.split(',').map(part => part.trim());
    
    if (parts.length === 0) {
        return null;
    }
    
    // Take the first part (usually the main city)
    let mainLocation = parts[0];
    
    // Clean up common prefixes/suffixes
    mainLocation = mainLocation.replace(/\b(city of|town of|municipality of|metro|metropolitan)\b/gi, '').trim();
    
    // If the first part is very short or generic, try the second part
    if (mainLocation.length <= 2 || /^(downtown|central|north|south|east|west)$/i.test(mainLocation)) {
        if (parts.length > 1) {
            mainLocation = parts[1].replace(/\b(city of|town of|municipality of|metro|metropolitan)\b/gi, '').trim();
        }
    }
    
    // Validate the result
    if (mainLocation.length > 2 && /[a-zA-Z]/.test(mainLocation)) {
        return mainLocation;
    }
    
    return null;
};

/**
 * Generates cache key for image data
 * @param {string} location - Location name
 * @returns {string} - Cache key
 */
const getCacheKey = (location) => {
    return `unsplash_${location.toLowerCase().replace(/\s+/g, '_')}`;
};

// ========================================
// MAIN SERVICE FUNCTIONS
// ========================================

/**
 * Fetches image for a location from Unsplash API
 * @param {string} locationString - Location string (e.g., "Toronto, Ontario, Canada")
 * @param {string} context - Optional context for image search
 * @returns {Promise<Object|null>} - Image data or null
 */
const getLocationImageDirect = async (locationString, context = '') => {
    console.log(TAG, 'Getting image for location:', locationString);
    
    try {
        if (!unsplashApi) {
            console.warn(TAG, 'API client not initialized');
            return null;
        }
        
        if (!locationString) {
            console.log(TAG, 'No location provided');
            return null;
        }
        
        // Extract main city/location from formatted string
        const cleanedLocation = cleanLocationString(locationString);
        if (!cleanedLocation) {
            console.log(TAG, 'Could not extract location from:', locationString);
            return null;
        }
        
        // Check cache first
        const cacheKey = getCacheKey(cleanedLocation);
        if (imageCache.has(cacheKey)) {
            console.log(TAG, 'Returning cached image for:', cleanedLocation);
            return imageCache.get(cacheKey);
        }
        
        // Build search query with context
        const searchQuery = buildImageSearchQuery(cleanedLocation, context);
        console.log(TAG, 'Search query:', searchQuery);
        
        // Search for photos
        const response = await unsplashApi.search.getPhotos({
            query: searchQuery,
            perPage: UNSPLASH_CONFIG.defaultParams.per_page,
            orientation: UNSPLASH_CONFIG.defaultParams.orientation,
            contentFilter: UNSPLASH_CONFIG.defaultParams.content_filter
        });
        
        if (response.type === 'success' && response.response.results?.length > 0) {
            const photo = response.response.results[0];
            
            const imageData = {
                id: photo.id,
                url: photo.urls.regular,
                thumbnail: photo.urls.small,
                alt_description: photo.alt_description || `Image of ${cleanedLocation}`,
                photographer: {
                    name: photo.user.name,
                    username: photo.user.username,
                    profile_url: photo.user.links.html
                },
                unsplash_url: photo.links.html,
                location: cleanedLocation,
                original_location: locationString,
                search_query: searchQuery,
                cached_at: new Date().toISOString()
            };
            
            // Cache the result
            imageCache.set(cacheKey, imageData);
            console.log(TAG, 'Image fetched successfully for:', cleanedLocation);
            return imageData;
        } else {
            console.warn(TAG, 'No images found for:', cleanedLocation);
            if (response.type === 'error') {
                console.error(TAG, 'API error:', response.errors);
            }
            return null;
        }
        
    } catch (error) {
        console.error(TAG, 'Error fetching image:', error.message);
        return null;
    }
};

/**
 * Fetches images for multiple trip entries using the location field
 * @param {Array} trips - Array of trip objects with location field
 * @returns {Promise<Array>} - Trip objects with image data added
 */
const addImagesToTrips = async (trips) => {
    console.log(TAG, 'Adding images to', trips.length, 'trips');
    
    try {
        // Process trips in parallel for better performance
        const tripsWithImages = await Promise.all(
            trips.map(async (trip) => {
                if (!trip.location) {
                    console.warn(TAG, 'No location field found for trip:', trip.id);
                    return { ...trip, image: null };
                }
                
                const image = await getLocationImageDirect(
                    trip.location, 
                    trip.searchData?.searchQuery || trip.title
                );
                
                return { ...trip, image };
            })
        );
        
        const successCount = tripsWithImages.filter(trip => trip.image).length;
        console.log(TAG, 'Successfully added images to', successCount, 'out of', trips.length, 'trips');
        
        return tripsWithImages;
        
    } catch (error) {
        console.error(TAG, 'Error adding images to trips:', error);
        return trips.map(trip => ({ ...trip, image: null }));
    }
};

/**
 * Tests Unsplash API connectivity
 * @returns {Promise<Object>} - Connection test result
 */
const testConnection = async () => {
    console.log(TAG, 'Testing connection...');
    
    try {
        if (!unsplashApi) {
            return {
                success: false,
                message: 'Unsplash API client not initialized (check API key)',
                hasApiKey: !!process.env.UNSPLASH_API_KEY
            };
        }
        
        // Test with a simple search
        const response = await unsplashApi.search.getPhotos({
            query: 'toronto',
            perPage: 1
        });
        
        if (response.type === 'success') {
            console.log(TAG, 'Connection test successful');
            return {
                success: true,
                message: 'Unsplash API connection successful',
                resultsFound: response.response.total || 0,
                rateLimit: {
                    remaining: response.response.headers ? response.response.headers.get('x-ratelimit-remaining') : null,
                    limit: response.response.headers ? response.response.headers.get('x-ratelimit-limit') : null
                }
            };
        } else {
            console.error(TAG, 'Connection test failed:', response.errors);
            return {
                success: false,
                message: `Connection failed: ${response.errors?.[0] || 'Unknown error'}`,
                hasApiKey: !!process.env.UNSPLASH_API_KEY
            };
        }
        
    } catch (error) {
        console.error(TAG, 'Connection test failed:', error.message);
        return {
            success: false,
            message: `Connection failed: ${error.message}`,
            hasApiKey: !!process.env.UNSPLASH_API_KEY
        };
    }
};

/**
 * Gets service status
 * @returns {Object} - Service status information
 */
const getServiceStatus = () => {
    return {
        initialized: !!unsplashApi,
        hasApiKey: !!process.env.UNSPLASH_API_KEY,
        cacheSize: imageCache.size,
        defaultParams: UNSPLASH_CONFIG.defaultParams,
        timestamp: new Date().toISOString()
    };
};

/**
 * Clears the image cache
 */
const clearCache = () => {
    const size = imageCache.size;
    imageCache.clear();
    console.log(TAG, 'Cleared', size, 'items from cache');
    return { cleared: size };
};

// ========================================
// INITIALIZATION
// ========================================

// Initialize Unsplash client on module load
initializeUnsplash();

// ========================================
// EXPORTS
// ========================================

module.exports = {
    getLocationImageDirect,
    addImagesToTrips,
    testConnection,
    getServiceStatus,
    clearCache,
    cleanLocationString,
    buildImageSearchQuery,
    initializeUnsplash
};
