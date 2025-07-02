/**
 * Database Service
 * 
 * Handles PostgreSQL database connections and operations for the PlanIT API.
 * Provides trip history management with proper error handling and connection pooling.
 * 
 * @author Rongbin Gu (@rongbin99)
 */

// ========================================
// IMPORTS
// ========================================
const { Pool } = require('pg');

// ========================================
// CONSTANTS
// ========================================
const TAG = '[Database]';

// ========================================
// CONFIGURATION
// ========================================

/**
 * PostgreSQL connection pool
 */
let pool = null;

/**
 * Database configuration
 */
const DB_CONFIG = {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'planit_db',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
};

// ========================================
// DATABASE INITIALIZATION
// ========================================

/**
 * Initializes the database connection pool
 * @returns {Promise<boolean>} - Success status
 */
const initializeDatabase = async () => {
    try {
        console.log(TAG, 'Initializing database connection...');
        
        // Create connection pool
        pool = new Pool(DB_CONFIG);
        
        // Test the connection
        const client = await pool.connect();
        console.log(TAG, 'Database connection established successfully');
        
        // Create tables if they don't exist
        await createTables(client);
        
        client.release();
        console.log(TAG, 'Database initialization complete');
        return true;
        
    } catch (error) {
        console.error(TAG, 'Database initialization failed:', error.message);
        pool = null;
        return false;
    }
};

/**
 * Creates database tables if they don't exist
 * @param {Object} client - Database client
 */
const createTables = async (client) => {
    try {
        console.log(TAG, 'Creating database tables...');
        
        // Create trips table
        await client.query(`
            CREATE TABLE IF NOT EXISTS trips (
                id UUID PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                location VARCHAR(255) NOT NULL,
                last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                search_data JSONB,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        `);
        
        // Create index on last_updated for sorting
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_trips_last_updated 
            ON trips(last_updated DESC);
        `);
        
        // Create index on location for searching
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_trips_location 
            ON trips(location);
        `);
        
        // Create index on title for searching
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_trips_title 
            ON trips(title);
        `);
        
        console.log(TAG, 'Database tables created successfully');
        
    } catch (error) {
        console.error(TAG, 'Error creating tables:', error.message);
        throw error;
    }
};

/**
 * Seeds the database with sample data if empty
 */
const seedDatabase = async () => {
    try {
        console.log(TAG, 'Checking if database needs seeding...');
        
        const result = await pool.query('SELECT COUNT(*) FROM trips');
        const count = parseInt(result.rows[0].count);
        
        if (count === 0) {
            console.log(TAG, 'Database is empty, seeding with sample data...');
            
            const sampleTrips = [
                {
                    id: '550e8400-e29b-41d4-a716-446655440001',
                    title: 'Best restaurants in downtown Toronto',
                    location: 'Toronto, Ontario, Canada',
                    last_updated: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
                    search_data: {
                        searchQuery: 'Best restaurants in downtown Toronto',
                        filters: {
                            timeOfDay: ['evening'],
                            environment: 'indoor',
                            planTransit: false,
                            groupSize: 'duo',
                            planFood: true,
                            priceRange: 3,
                            specialOption: 'date'
                        }
                    }
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440002',
                    title: 'Weekend activities for couples in Vancouver',
                    location: 'Vancouver, British Columbia, Canada',
                    last_updated: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
                    search_data: {
                        searchQuery: 'Weekend activities for couples in Vancouver',
                        filters: {
                            timeOfDay: ['afternoon', 'evening'],
                            environment: 'mixed',
                            planTransit: true,
                            groupSize: 'duo',
                            planFood: true,
                            priceRange: 2,
                            specialOption: 'date'
                        }
                    }
                },
                {
                    id: '550e8400-e29b-41d4-a716-446655440003',
                    title: 'Family-friendly activities in Montreal',
                    location: 'Montreal, Quebec, Canada',
                    last_updated: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
                    search_data: {
                        searchQuery: 'Family-friendly activities in Montreal',
                        filters: {
                            timeOfDay: ['morning', 'afternoon'],
                            environment: 'outdoor',
                            planTransit: true,
                            groupSize: 'group',
                            planFood: true,
                            priceRange: 2,
                            specialOption: 'family'
                        }
                    }
                }
            ];
            
            for (const trip of sampleTrips) {
                await pool.query(
                    `INSERT INTO trips (id, title, location, last_updated, search_data) 
                     VALUES ($1, $2, $3, $4, $5)`,
                    [trip.id, trip.title, trip.location, trip.last_updated, JSON.stringify(trip.search_data)]
                );
            }
            
            console.log(TAG, `Seeded database with ${sampleTrips.length} sample trips`);
        } else {
            console.log(TAG, `Database already has ${count} trips, skipping seeding`);
        }
        
    } catch (error) {
        console.error(TAG, 'Error seeding database:', error.message);
    }
};

// ========================================
// TRIP OPERATIONS
// ========================================

/**
 * Gets all trips with filtering, sorting, and pagination
 * @param {Object} options - Query options
 * @returns {Promise<Object>} - Trips data with pagination info
 */
const getTrips = async (options = {}) => {
    try {
        const {
            limit = 50,
            offset = 0,
            sortBy = 'last_updated',
            sortOrder = 'desc',
            search = null
        } = options;
        
        let query = 'SELECT * FROM trips';
        let countQuery = 'SELECT COUNT(*) FROM trips';
        let params = [];
        let whereClause = '';
        
        // Add search filter
        if (search) {
            whereClause = ` WHERE (
                LOWER(title) LIKE LOWER($1) OR 
                LOWER(location) LIKE LOWER($1) OR 
                LOWER(search_data->>'searchQuery') LIKE LOWER($1)
            )`;
            params.push(`%${search}%`);
        }
        
        // Add WHERE clause to both queries
        query += whereClause;
        countQuery += whereClause;
        
        // Add sorting and pagination
        const validSortColumns = ['last_updated', 'title', 'created_at'];
        const column = validSortColumns.includes(sortBy) ? sortBy : 'last_updated';
        const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY ${column} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        // Execute both queries
        const [tripsResult, countResult] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, search ? [params[0]] : [])
        ]);
        
        const trips = tripsResult.rows.map(formatTripFromDB);
        const total = parseInt(countResult.rows[0].count);
        
        return {
            trips,
            pagination: {
                total,
                limit,
                offset,
                hasMore: offset + limit < total,
                nextOffset: offset + limit < total ? offset + limit : null
            }
        };
        
    } catch (error) {
        console.error(TAG, 'Error getting trips:', error.message);
        throw error;
    }
};

/**
 * Gets a single trip by ID
 * @param {string} tripId - Trip UUID
 * @returns {Promise<Object|null>} - Trip data or null if not found
 */
const getTripById = async (tripId) => {
    try {
        const result = await pool.query(
            'SELECT * FROM trips WHERE id = $1',
            [tripId]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return formatTripFromDB(result.rows[0]);
        
    } catch (error) {
        console.error(TAG, 'Error getting trip by ID:', error.message);
        throw error;
    }
};

/**
 * Creates a new trip
 * @param {Object} tripData - Trip data
 * @returns {Promise<Object>} - Created trip
 */
const createTrip = async (tripData) => {
    try {
        const { id, title, location, searchData } = tripData;
        
        const result = await pool.query(
            `INSERT INTO trips (id, title, location, search_data) 
             VALUES ($1, $2, $3, $4) 
             RETURNING *`,
            [id, title, location, JSON.stringify(searchData)]
        );
        
        console.log(TAG, 'Trip created successfully:', id);
        return formatTripFromDB(result.rows[0]);
        
    } catch (error) {
        console.error(TAG, 'Error creating trip:', error.message);
        throw error;
    }
};

/**
 * Updates an existing trip
 * @param {string} tripId - Trip UUID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object|null>} - Updated trip or null if not found
 */
const updateTrip = async (tripId, updateData) => {
    try {
        const { title, location, searchData } = updateData;
        
        const result = await pool.query(
            `UPDATE trips 
             SET title = COALESCE($2, title),
                 location = COALESCE($3, location),
                 search_data = COALESCE($4, search_data),
                 updated_at = NOW()
             WHERE id = $1 
             RETURNING *`,
            [tripId, title, location, searchData ? JSON.stringify(searchData) : null]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        console.log(TAG, 'Trip updated successfully:', tripId);
        return formatTripFromDB(result.rows[0]);
        
    } catch (error) {
        console.error(TAG, 'Error updating trip:', error.message);
        throw error;
    }
};

/**
 * Deletes a trip by ID
 * @param {string} tripId - Trip UUID
 * @returns {Promise<boolean>} - Success status
 */
const deleteTrip = async (tripId) => {
    try {
        const result = await pool.query(
            'DELETE FROM trips WHERE id = $1 RETURNING id',
            [tripId]
        );
        
        if (result.rows.length === 0) {
            return false;
        }
        
        console.log(TAG, 'Trip deleted successfully:', tripId);
        return true;
        
    } catch (error) {
        console.error(TAG, 'Error deleting trip:', error.message);
        throw error;
    }
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Formats trip data from database format to API format
 * @param {Object} dbTrip - Trip from database
 * @returns {Object} - Formatted trip
 */
const formatTripFromDB = (dbTrip) => {
    return {
        id: dbTrip.id,
        title: dbTrip.title,
        location: dbTrip.location,
        lastUpdated: dbTrip.last_updated,
        searchData: dbTrip.search_data,
        createdAt: dbTrip.created_at,
        updatedAt: dbTrip.updated_at
    };
};

/**
 * Tests database connectivity
 * @returns {Promise<Object>} - Connection test result
 */
const testConnection = async () => {
    try {
        if (!pool) {
            return {
                success: false,
                message: 'Database pool not initialized',
                connected: false
            };
        }
        
        const client = await pool.connect();
        const result = await client.query('SELECT NOW() as current_time, version() as db_version');
        client.release();
        
        return {
            success: true,
            message: 'Database connection successful',
            connected: true,
            currentTime: result.rows[0].current_time,
            version: result.rows[0].db_version,
            poolInfo: {
                totalCount: pool.totalCount,
                idleCount: pool.idleCount,
                waitingCount: pool.waitingCount
            }
        };
        
    } catch (error) {
        console.error(TAG, 'Database connection test failed:', error.message);
        return {
            success: false,
            message: `Connection failed: ${error.message}`,
            connected: false
        };
    }
};

/**
 * Gets database service status
 * @returns {Object} - Service status information
 */
const getServiceStatus = () => {
    return {
        initialized: !!pool,
        poolInfo: pool ? {
            totalCount: pool.totalCount,
            idleCount: pool.idleCount,
            waitingCount: pool.waitingCount
        } : null,
        config: {
            host: DB_CONFIG.host,
            port: DB_CONFIG.port,
            database: DB_CONFIG.database,
            ssl: !!DB_CONFIG.ssl
        },
        timestamp: new Date().toISOString()
    };
};

/**
 * Closes database connections
 */
const closeDatabase = async () => {
    if (pool) {
        console.log(TAG, 'Closing database connections...');
        await pool.end();
        pool = null;
        console.log(TAG, 'Database connections closed');
    }
};

// ========================================
// EXPORTS
// ========================================

module.exports = {
    // Initialization
    initializeDatabase,
    seedDatabase,
    closeDatabase,
    
    // Trip operations
    getTrips,
    getTripById,
    createTrip,
    updateTrip,
    deleteTrip,
    
    // Utility
    testConnection,
    getServiceStatus,
    formatTripFromDB
}; 
