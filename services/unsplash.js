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
 * Location-focused search strategies for iconic city images
 */
const LOCATION_SEARCH_STRATEGIES = [
    {
        keywords: ['skyline', 'cityscape', 'aerial view'],
        priority: 1
    },
    {
        keywords: ['landmark', 'famous', 'iconic'],
        priority: 2
    },
    {
        keywords: ['landscape', 'panoramic', 'scenic'],
        priority: 3
    },
    {
        keywords: ['city', 'downtown', 'urban'],
        priority: 4
    }
];

/**
 * Image cache (in production, use Redis or similar)
 */
const imageCache = new Map();

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Builds optimized search queries for getting iconic location images
 * @param {string} location - Location name  
 * @returns {Array<string>} - Array of search queries ordered by priority
 */
const buildLocationSearchQueries = (location) => {
    const queries = [];
    
    // Build queries for each strategy
    LOCATION_SEARCH_STRATEGIES.forEach(strategy => {
        strategy.keywords.forEach(keyword => {
            queries.push(`${location} ${keyword}`);
        });
    });
    
    // Add a simple location-only query as final fallback
    queries.push(location);
    
    return queries;
};

/**
 * Builds a single optimized search query for the location (primary strategy)
 * @param {string} location - Location name  
 * @returns {string} - Optimized search query for iconic city images
 */
const buildImageSearchQuery = (location) => {
    // Use the primary strategy (skyline/cityscape) for the main search
    const primaryStrategy = LOCATION_SEARCH_STRATEGIES[0];
    return `${location} ${primaryStrategy.keywords.join(' ')}`;
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
 * Fetches iconic landscape/cityscape image for a location from Unsplash API
 * @param {string} locationString - Location string (e.g., "Toronto, Ontario, Canada")
 * @returns {Promise<Object|null>} - Image data or null
 */
const getLocationImageDirect = async (locationString) => {
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
        
        // Try different search strategies to find the best location image
        const searchQueries = buildLocationSearchQueries(cleanedLocation);
        console.log(TAG, 'Trying search strategies for:', cleanedLocation);
        
        let photo = null;
        let usedQuery = '';
        
        // Try each search query until we find a good result
        for (let i = 0; i < searchQueries.length && !photo; i++) {
            const searchQuery = searchQueries[i];
            console.log(TAG, `Search attempt ${i + 1}:`, searchQuery);
            
            try {
                const response = await unsplashApi.search.getPhotos({
                    query: searchQuery,
                    perPage: UNSPLASH_CONFIG.defaultParams.per_page,
                    orientation: UNSPLASH_CONFIG.defaultParams.orientation,
                    contentFilter: UNSPLASH_CONFIG.defaultParams.content_filter
                });
                
                if (response.type === 'success' && response.response.results?.length > 0) {
                    photo = response.response.results[0];
                    usedQuery = searchQuery;
                    console.log(TAG, `Found image with query: "${searchQuery}"`);
                    break;
                }
            } catch (searchError) {
                console.warn(TAG, `Search failed for query "${searchQuery}":`, searchError.message);
                continue;
            }
        }
        
        if (photo) {
            
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
                search_query: usedQuery,
                cached_at: new Date().toISOString()
            };
            
            // Cache the result
            imageCache.set(cacheKey, imageData);
            console.log(TAG, 'Image fetched successfully for:', cleanedLocation);
            return imageData;
        } else {
            console.warn(TAG, 'No images found for location after trying all search strategies:', cleanedLocation);
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
                
                const image = await getLocationImageDirect(trip.location);
                
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
                    remaining: response.originalResponse?.headers ? response.originalResponse.headers.get('x-ratelimit-remaining') : null,
                    limit: response.originalResponse?.headers ? response.originalResponse.headers.get('x-ratelimit-limit') : null
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
