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
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
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
        
        // Create users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                profile_image_url TEXT,
                adventures_count INTEGER DEFAULT 0,
                places_visited_count INTEGER DEFAULT 0,
                member_since TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        `);
        
        // Create index on email for login
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email 
            ON users(email);
        `);
        
        // Create trips table with user_id reference
        await client.query(`
            CREATE TABLE IF NOT EXISTS trips (
                id UUID PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                location VARCHAR(255) NOT NULL,
                last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                search_data JSONB,
                deleted_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        `);
        
        // Add deleted_at column if it doesn't exist (for existing databases)
        await client.query(`
            ALTER TABLE trips 
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
        `);
        
        // Create audit_logs table for tracking deletions and other events
        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                entity_type VARCHAR(50) NOT NULL,
                entity_id UUID NOT NULL,
                action VARCHAR(50) NOT NULL,
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                old_data JSONB,
                new_data JSONB,
                ip_address INET,
                user_agent TEXT,
                timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
        `);
        
        // Create index on user_id for user's trips
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_trips_user_id 
            ON trips(user_id);
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
        
        // Create index on deleted_at for soft delete filtering
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_trips_deleted_at 
            ON trips(deleted_at);
        `);
        
        // Create indexes on audit_logs for efficient querying
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_logs_entity 
            ON audit_logs(entity_type, entity_id);
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
            ON audit_logs(user_id);
        `);
        
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp 
            ON audit_logs(timestamp DESC);
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
// USER OPERATIONS
// ========================================

/**
 * Creates a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} - Created user (without password)
 */
const createUser = async (userData) => {
    try {
        const { id, email, passwordHash, name, profileImageUrl } = userData;
        
        const result = await pool.query(
            `INSERT INTO users (id, email, password_hash, name, profile_image_url) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id, email, name, profile_image_url, adventures_count, places_visited_count, member_since, created_at, updated_at`,
            [id, email, passwordHash, name, profileImageUrl]
        );
        
        console.log(TAG, 'User created successfully:', email);
        return formatUserFromDB(result.rows[0]);
        
    } catch (error) {
        if (error.code === '23505') { // Unique violation
            throw new Error('Email already exists');
        }
        console.error(TAG, 'Error creating user:', error.message);
        throw error;
    }
};

/**
 * Gets a user by email (for login)
 * @param {string} email - User email
 * @returns {Promise<Object|null>} - User data with password hash or null if not found
 */
const getUserByEmail = async (email) => {
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return result.rows[0];
        
    } catch (error) {
        console.error(TAG, 'Error getting user by email:', error.message);
        throw error;
    }
};

/**
 * Gets a user by ID
 * @param {string} userId - User UUID
 * @returns {Promise<Object|null>} - User data (without password) or null if not found
 */
const getUserById = async (userId) => {
    try {
        const result = await pool.query(
            `SELECT id, email, name, profile_image_url, adventures_count, places_visited_count, member_since, created_at, updated_at 
             FROM users WHERE id = $1`,
            [userId]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return formatUserFromDB(result.rows[0]);
        
    } catch (error) {
        console.error(TAG, 'Error getting user by ID:', error.message);
        throw error;
    }
};

/**
 * Updates user profile
 * @param {string} userId - User UUID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object|null>} - Updated user or null if not found
 */
const updateUser = async (userId, updateData) => {
    try {
        const { name, email, profileImageUrl } = updateData;
        
        const result = await pool.query(
            `UPDATE users 
             SET name = COALESCE($2, name),
                 email = COALESCE($3, email),
                 profile_image_url = COALESCE($4, profile_image_url),
                 updated_at = NOW()
             WHERE id = $1 
             RETURNING id, email, name, profile_image_url, adventures_count, places_visited_count, member_since, created_at, updated_at`,
            [userId, name, email, profileImageUrl]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        console.log(TAG, 'User updated successfully:', userId);
        return formatUserFromDB(result.rows[0]);
        
    } catch (error) {
        console.error(TAG, 'Error updating user:', error.message);
        throw error;
    }
};

/**
 * Updates user statistics (adventures count, places visited)
 * @param {string} userId - User UUID
 * @param {Object} stats - Statistics to update
 * @returns {Promise<Object|null>} - Updated user or null if not found
 */
const updateUserStats = async (userId, stats) => {
    try {
        const { adventuresCount, placesVisitedCount } = stats;
        
        const result = await pool.query(
            `UPDATE users 
             SET adventures_count = COALESCE($2, adventures_count),
                 places_visited_count = COALESCE($3, places_visited_count),
                 updated_at = NOW()
             WHERE id = $1 
             RETURNING id, email, name, profile_image_url, adventures_count, places_visited_count, member_since, created_at, updated_at`,
            [userId, adventuresCount, placesVisitedCount]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        console.log(TAG, 'User stats updated successfully:', userId);
        return formatUserFromDB(result.rows[0]);
        
    } catch (error) {
        console.error(TAG, 'Error updating user stats:', error.message);
        throw error;
    }
};

/**
 * Updates a user's password
 * @param {string} userId - User UUID
 * @param {string} newPasswordHash - New hashed password
 * @returns {Promise<boolean>} - True if updated, false if not
 */
const updateUserPassword = async (userId, newPasswordHash) => {
    try {
        const result = await pool.query(
            `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
            [userId, newPasswordHash]
        );
        return result.rowCount > 0;
    } catch (error) {
        console.error(TAG, 'Error updating user password:', error.message);
        throw error;
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
            search = null,
            userId = null
        } = options;
        
        let query = 'SELECT * FROM trips';
        let countQuery = 'SELECT COUNT(*) FROM trips';
        let params = [];
        let whereConditions = [];
        
        // Filter out soft-deleted trips
        whereConditions.push('deleted_at IS NULL');
        
        // Add user filter
        if (userId) {
            whereConditions.push(`user_id = $${params.length + 1}`);
            params.push(userId);
        } else {
            // For non-authenticated users, only get trips without user_id (legacy trips)
            whereConditions.push('user_id IS NULL');
        }
        
        // Add search filter
        if (search) {
            whereConditions.push(`(
                LOWER(title) LIKE LOWER($${params.length + 1}) OR 
                LOWER(location) LIKE LOWER($${params.length + 1}) OR 
                LOWER(search_data->>'searchQuery') LIKE LOWER($${params.length + 1})
            )`);
            params.push(`%${search}%`);
        }
        
        // Build WHERE clause
        const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : '';
        
        // Add WHERE clause to both queries
        query += whereClause;
        countQuery += whereClause;
        
        // Add sorting and pagination
        const validSortColumns = ['last_updated', 'title', 'created_at'];
        const column = validSortColumns.includes(sortBy) ? sortBy : 'last_updated';
        const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        
        query += ` ORDER BY ${column} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        
        // Parameters for count query (exclude limit and offset)
        const countParams = params.slice(0, params.length);
        
        // Add limit and offset for main query
        params.push(limit, offset);
        
        // Execute both queries
        const [tripsResult, countResult] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, countParams)
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
        const { id, title, location, searchData, userId } = tripData;
        
        const result = await pool.query(
            `INSERT INTO trips (id, user_id, title, location, search_data) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [id, userId, title, location, JSON.stringify(searchData)]
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
 * Soft deletes a trip by ID (marks as deleted instead of removing)
 * @param {string} tripId - Trip UUID
 * @param {string} userId - User ID performing the deletion (optional)
 * @param {Object} auditData - Additional audit data (ip, user agent, etc.)
 * @returns {Promise<Object|null>} - Deleted trip data or null if not found
 */
const deleteTrip = async (tripId, userId = null, auditData = {}) => {
    try {
        // First, get the trip data for audit logging
        const tripResult = await pool.query(
            'SELECT * FROM trips WHERE id = $1 AND deleted_at IS NULL',
            [tripId]
        );
        
        if (tripResult.rows.length === 0) {
            return null;
        }
        
        const tripData = tripResult.rows[0];
        
        // Soft delete the trip
        const deleteResult = await pool.query(
            `UPDATE trips 
             SET deleted_at = NOW(), updated_at = NOW() 
             WHERE id = $1 AND deleted_at IS NULL 
             RETURNING id, title, location, deleted_at`,
            [tripId]
        );
        
        if (deleteResult.rows.length === 0) {
            return null;
        }
        
        const deletedTrip = deleteResult.rows[0];
        
        // Log the deletion for audit purposes
        await logAuditEvent({
            entityType: 'trip',
            entityId: tripId,
            action: 'soft_delete',
            userId: userId,
            oldData: tripData,
            newData: { deleted_at: deletedTrip.deleted_at },
            ipAddress: auditData.ipAddress,
            userAgent: auditData.userAgent
        });
        
        console.log(TAG, 'Trip soft deleted successfully:', tripId);
        return formatTripFromDB(deletedTrip);
        
    } catch (error) {
        console.error(TAG, 'Error soft deleting trip:', error.message);
        throw error;
    }
};

/**
 * Permanently deletes a trip (hard delete - use with caution)
 * @param {string} tripId - Trip UUID
 * @param {string} userId - User ID performing the deletion
 * @param {Object} auditData - Additional audit data
 * @returns {Promise<boolean>} - Success status
 */
const hardDeleteTrip = async (tripId, userId = null, auditData = {}) => {
    try {
        // Get the trip data for audit logging
        const tripResult = await pool.query(
            'SELECT * FROM trips WHERE id = $1',
            [tripId]
        );
        
        if (tripResult.rows.length === 0) {
            return false;
        }
        
        const tripData = tripResult.rows[0];
        
        // Hard delete the trip
        const result = await pool.query(
            'DELETE FROM trips WHERE id = $1 RETURNING id',
            [tripId]
        );
        
        if (result.rows.length === 0) {
            return false;
        }
        
        // Log the hard deletion for audit purposes
        await logAuditEvent({
            entityType: 'trip',
            entityId: tripId,
            action: 'hard_delete',
            userId: userId,
            oldData: tripData,
            newData: null,
            ipAddress: auditData.ipAddress,
            userAgent: auditData.userAgent
        });
        
        console.log(TAG, 'Trip hard deleted successfully:', tripId);
        return true;
        
    } catch (error) {
        console.error(TAG, 'Error hard deleting trip:', error.message);
        throw error;
    }
};

/**
 * Logs an audit event to the audit_logs table
 * @param {Object} eventData - Event data to log
 * @returns {Promise<void>}
 */
const logAuditEvent = async (eventData) => {
    try {
        const {
            entityType,
            entityId,
            action,
            userId,
            oldData,
            newData,
            ipAddress,
            userAgent
        } = eventData;
        
        await pool.query(
            `INSERT INTO audit_logs 
             (entity_type, entity_id, action, user_id, old_data, new_data, ip_address, user_agent) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                entityType,
                entityId,
                action,
                userId,
                oldData ? JSON.stringify(oldData) : null,
                newData ? JSON.stringify(newData) : null,
                ipAddress || null,
                userAgent || null
            ]
        );
        
        console.log(TAG, 'Audit event logged:', {
            entityType,
            entityId,
            action,
            userId
        });
        
    } catch (error) {
        console.error(TAG, 'Error logging audit event:', error.message);
        // Don't throw error - audit logging failure shouldn't break main operation
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
        userId: dbTrip.user_id,
        title: dbTrip.title,
        location: dbTrip.location,
        lastUpdated: dbTrip.last_updated,
        searchData: dbTrip.search_data,
        deletedAt: dbTrip.deleted_at,
        createdAt: dbTrip.created_at,
        updatedAt: dbTrip.updated_at
    };
};

/**
 * Formats user data from database format to API format
 * @param {Object} dbUser - User from database
 * @returns {Object} - Formatted user (without password)
 */
const formatUserFromDB = (dbUser) => {
    return {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        profileImageUrl: dbUser.profile_image_url,
        adventuresCount: dbUser.adventures_count,
        placesVisitedCount: dbUser.places_visited_count,
        memberSince: dbUser.member_since,
        createdAt: dbUser.created_at,
        updatedAt: dbUser.updated_at
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
    
    // User operations
    createUser,
    getUserByEmail,
    getUserById,
    updateUser,
    updateUserStats,
    updateUserPassword,
    
    // Trip operations
    getTrips,
    getTripById,
    createTrip,
    updateTrip,
    deleteTrip,
    hardDeleteTrip,
    
    // Audit operations
    logAuditEvent,
    
    // Utility
    testConnection,
    getServiceStatus,
    formatTripFromDB,
    formatUserFromDB,
    pool
}; 
