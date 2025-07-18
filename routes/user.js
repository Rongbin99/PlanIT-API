/**
 * User Routes
 * 
 * Handles user authentication and profile management.
 * Provides endpoints for signup, login, profile updates, and user statistics.
 * 
 * @author Rongbin Gu (@rongbin99)
 */

// ========================================
// IMPORTS
// ========================================
const express = require('express');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { 
    createUser, 
    getUserByEmail, 
    getUserById, 
    updateUser, 
    updateUserStats,
    getTrips,
    updateUserPassword
} = require('../services/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

// ========================================
// ROUTER SETUP
// ========================================
const router = express.Router();

// ========================================
// CONSTANTS
// ========================================
const TAG = "[UserRoutes]";
const SALT_ROUNDS = 12;

// ========================================
// MULTER CONFIGURATION
// ========================================

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `profile-${req.userId}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// ========================================
// VALIDATION SCHEMAS
// ========================================

/**
 * User signup validation schema
 */
const signupSchema = Joi.object({
    email: Joi.string().email().required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    password: Joi.string().min(6).required()
        .messages({
            'string.min': 'Password must be at least 6 characters long',
            'any.required': 'Password is required'
        }),
            name: Joi.string().min(1).max(100).required()
        .messages({
            'string.min': 'Name cannot be empty',
            'string.max': 'Name cannot exceed 100 characters',
            'any.required': 'Name is required'
        })
});

/**
 * User login validation schema
 */
const loginSchema = Joi.object({
    email: Joi.string().email().required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),
    password: Joi.string().required()
        .messages({
            'any.required': 'Password is required'
        })
});

/**
 * Profile update validation schema
 */
const profileUpdateSchema = Joi.object({
    name: Joi.string().min(1).max(100).optional()
        .messages({
            'string.min': 'Name cannot be empty',
            'string.max': 'Name cannot exceed 100 characters'
        }),
    email: Joi.string().email().optional()
        .messages({
            'string.email': 'Please provide a valid email address'
        }),
    profileImageUrl: Joi.string().uri().optional().allow(null, '')
        .messages({
            'string.uri': 'Profile image URL must be a valid URL'
        })
});

/**
 * Stats update validation schema
 */
const statsUpdateSchema = Joi.object({
    adventuresCount: Joi.number().integer().min(0).optional(),
    placesVisitedCount: Joi.number().integer().min(0).optional()
});

/**
 * Password change validation schema
 */
const passwordChangeSchema = Joi.object({
    currentPassword: Joi.string().required().messages({
        'any.required': 'Current password is required'
    }),
    newPassword: Joi.string().min(6).required().messages({
        'string.min': 'New password must be at least 6 characters',
        'any.required': 'New password is required'
    })
});

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Logs request details for debugging
 */
const logRequestDetails = (req, action) => {
    console.log(TAG, `${action} - IP: ${req.ip}, User-Agent: ${req.get('User-Agent')}`);
};

/**
 * Formats user response (removes sensitive data)
 */
const formatUserResponse = (user) => {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        profileImageUrl: user.profileImageUrl,
        adventuresCount: user.adventuresCount,
        placesVisitedCount: user.placesVisitedCount,
        memberSince: user.memberSince,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
    };
};

// ========================================
// RATE LIMITERS
// ========================================

// Rate limiter for sensitive endpoints (e.g., password change)
const passwordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many password change attempts from this IP, please try again later.'
    }
});

// Rate limiter for profile endpoint
const profileLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // limit each IP to 30 requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many profile requests from this IP, please try again later.'
    }
});

// Rate limiter for profile update endpoint
const profileUpdateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many profile update attempts from this IP, please try again later.'
    }
});

// Rate limiter for stats update endpoint
const statsUpdateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many stats update attempts from this IP, please try again later.'
    }
});

// Rate limiter for profile image upload endpoint
const profileImageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many profile image upload attempts from this IP, please try again later.'
    }
});

// Rate limiter for status endpoint
const statusLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many status requests from this IP, please try again later.'
    }
});

// Rate limiter for signup endpoint
const signupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 signup attempts per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many signup attempts from this IP, please try again later.'
    }
});

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 login attempts per windowMs
    message: {
        success: false,
        error: 'Too Many Requests',
        message: 'Too many login attempts from this IP, please try again later.'
    }
});

// ========================================
// ROUTES
// ========================================

/**
 * POST /api/user/signup
 * 
 * Creates a new user account
 */
router.post('/signup', signupLimiter, async (req, res) => {
    console.log(TAG, 'POST /api/user/signup - User signup requested');
    
    try {
        logRequestDetails(req, 'User signup');
        
        // Validate request body
        console.log(TAG, 'Validating signup data');
        const { error, value } = signupSchema.validate(req.body);
        
        if (error) {
            console.warn(TAG, 'Signup validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const { email, password, name } = value;
        console.log(TAG, 'Signup data validated for email:', email);

        // Check if user already exists
        console.log(TAG, 'Checking if user already exists');
        const existingUser = await getUserByEmail(email);
        
        if (existingUser) {
            console.warn(TAG, 'User already exists:', email);
            return res.status(409).json({
                success: false,
                error: 'User Already Exists',
                message: 'An account with this email already exists',
                timestamp: new Date().toISOString()
            });
        }

        // Hash password
        console.log(TAG, 'Hashing password');
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        console.log(TAG, 'Creating new user');
        const userId = uuidv4();
        const userData = {
            id: userId,
            email: email.toLowerCase(),
            passwordHash,
            name,
            profileImageUrl: null
        };

        const newUser = await createUser(userData);
        console.log(TAG, 'User created successfully:', newUser.id);

        // Generate JWT token
        console.log(TAG, 'Generating authentication token');
        const token = generateToken(newUser);

        // Prepare response
        const response = {
            success: true,
            message: 'Account created successfully',
            user: formatUserResponse(newUser),
            token,
            timestamp: new Date().toISOString()
        };

        console.log(TAG, 'Signup successful for user:', newUser.email);
        res.status(201).json(response);

    } catch (error) {
        console.error(TAG, 'Signup error:', error.message);
        
        if (error.message === 'Email already exists') {
            return res.status(409).json({
                success: false,
                error: 'User Already Exists',
                message: 'An account with this email already exists',
                timestamp: new Date().toISOString()
            });
        }

        res.status(500).json({
            success: false,
            error: 'Server Error',
            message: 'Failed to create account. Please try again.',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/user/login
 * 
 * Authenticates user and returns token
 */
router.post('/login', loginLimiter, async (req, res) => {
    console.log(TAG, 'POST /api/user/login - User login requested');
    
    try {
        logRequestDetails(req, 'User login');
        
        // Validate request body
        console.log(TAG, 'Validating login data');
        const { error, value } = loginSchema.validate(req.body);
        
        if (error) {
            console.warn(TAG, 'Login validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        const { email, password } = value;
        console.log(TAG, 'Login attempt for email:', email);

        // Get user by email
        console.log(TAG, 'Looking up user by email');
        const user = await getUserByEmail(email.toLowerCase());
        
        if (!user) {
            console.warn(TAG, 'User not found for email:', email);
            return res.status(401).json({
                success: false,
                error: 'Invalid Credentials',
                message: 'Invalid email or password',
                timestamp: new Date().toISOString()
            });
        }

        // Verify password
        console.log(TAG, 'Verifying password');
        const passwordValid = await bcrypt.compare(password, user.password_hash);
        
        if (!passwordValid) {
            console.warn(TAG, 'Invalid password for user:', email);
            return res.status(401).json({
                success: false,
                error: 'Invalid Credentials',
                message: 'Invalid email or password',
                timestamp: new Date().toISOString()
            });
        }

        // Format user data (remove password hash)
        const userData = {
            id: user.id,
            email: user.email,
            name: user.name,
            profileImageUrl: user.profile_image_url,
            adventuresCount: user.adventures_count,
            placesVisitedCount: user.places_visited_count,
            memberSince: user.member_since,
            createdAt: user.created_at,
            updatedAt: user.updated_at
        };

        // Generate JWT token
        console.log(TAG, 'Generating authentication token');
        const token = generateToken(userData);

        // Prepare response
        const response = {
            success: true,
            message: 'Login successful',
            user: formatUserResponse(userData),
            token,
            timestamp: new Date().toISOString()
        };

        console.log(TAG, 'Login successful for user:', userData.email);
        res.status(200).json(response);

    } catch (error) {
        console.error(TAG, 'Login error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Server Error',
            message: 'Failed to login. Please try again.',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/user/profile
 * 
 * Gets current user's profile
 */
router.get('/profile', profileLimiter, authenticateToken, async (req, res) => {
    console.log(TAG, 'GET /api/user/profile - Profile requested');
    
    try {
        console.log(TAG, 'Getting profile for user:', req.user.email);
        
        // Get fresh user data from database
        const user = await getUserById(req.userId);
        
        if (!user) {
            console.warn(TAG, 'User not found:', req.userId);
            return res.status(404).json({
                success: false,
                error: 'User Not Found',
                message: 'User profile not found',
                timestamp: new Date().toISOString()
            });
        }

        // Get user statistics (count of trips)
        const tripsResult = await getTrips({ userId: req.userId, limit: 1000 });
        const totalTrips = tripsResult.pagination.total;

        // Update user object with current trip count
        const userWithStats = {
            ...user,
            adventuresCount: totalTrips
        };

        const response = {
            success: true,
            user: formatUserResponse(userWithStats),
            timestamp: new Date().toISOString()
        };

        console.log(TAG, 'Profile retrieved successfully for user:', user.email);
        res.status(200).json(response);

    } catch (error) {
        console.error(TAG, 'Profile retrieval error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Server Error',
            message: 'Failed to retrieve profile',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PUT /api/user/profile
 * 
 * Updates user profile
 */
router.put('/profile', profileUpdateLimiter, authenticateToken, async (req, res) => {
    console.log(TAG, 'PUT /api/user/profile - Profile update requested');
    
    try {
        logRequestDetails(req, 'Profile update');
        
        // Validate request body
        console.log(TAG, 'Validating profile update data');
        const { error, value } = profileUpdateSchema.validate(req.body);
        
        if (error) {
            console.warn(TAG, 'Profile update validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        console.log(TAG, 'Updating profile for user:', req.user.email);
        
        // Update user
        const updatedUser = await updateUser(req.userId, value);
        
        if (!updatedUser) {
            console.warn(TAG, 'User not found for update:', req.userId);
            return res.status(404).json({
                success: false,
                error: 'User Not Found',
                message: 'User profile not found',
                timestamp: new Date().toISOString()
            });
        }

        const response = {
            success: true,
            message: 'Profile updated successfully',
            user: formatUserResponse(updatedUser),
            timestamp: new Date().toISOString()
        };

        console.log(TAG, 'Profile updated successfully for user:', updatedUser.email);
        res.status(200).json(response);

    } catch (error) {
        console.error(TAG, 'Profile update error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Server Error',
            message: 'Failed to update profile',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PUT /api/user/stats
 * 
 * Updates user statistics
 */
router.put('/stats', statsUpdateLimiter, authenticateToken, async (req, res) => {
    console.log(TAG, 'PUT /api/user/stats - Stats update requested');
    
    try {
        logRequestDetails(req, 'Stats update');
        
        // Validate request body
        console.log(TAG, 'Validating stats update data');
        const { error, value } = statsUpdateSchema.validate(req.body);
        
        if (error) {
            console.warn(TAG, 'Stats update validation failed:', error.details[0].message);
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                message: error.details[0].message,
                timestamp: new Date().toISOString()
            });
        }

        console.log(TAG, 'Updating stats for user:', req.user.email);
        
        // Update user stats
        const updatedUser = await updateUserStats(req.userId, value);
        
        if (!updatedUser) {
            console.warn(TAG, 'User not found for stats update:', req.userId);
            return res.status(404).json({
                success: false,
                error: 'User Not Found',
                message: 'User profile not found',
                timestamp: new Date().toISOString()
            });
        }

        const response = {
            success: true,
            message: 'User statistics updated successfully',
            user: formatUserResponse(updatedUser),
            timestamp: new Date().toISOString()
        };

        console.log(TAG, 'Stats updated successfully for user:', updatedUser.email);
        res.status(200).json(response);

    } catch (error) {
        console.error(TAG, 'Stats update error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Server Error',
            message: 'Failed to update statistics',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PUT /api/user/password
 *
 * Changes the authenticated user's password
 */
router.put('/password', passwordChangeLimiter, authenticateToken, async (req, res) => {
    console.log(TAG, 'PUT /api/user/password - Password change requested');
    try {
        // Validate request body
        const { error, value } = passwordChangeSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }
        const { currentPassword, newPassword } = value;
        if (currentPassword === newPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password must be different from current password.'
            });
        }
        // Get user from DB
        const user = await getUserById(req.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }
        // Get full user (with password hash)
        const userWithHash = await getUserByEmail(user.email);
        // Check current password
        const passwordValid = await bcrypt.compare(currentPassword, userWithHash.password_hash);
        if (!passwordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect.'
            });
        }
        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        // Update password
        const updated = await updateUserPassword(user.id, newPasswordHash);
        if (!updated) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update password.'
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Password changed successfully.'
        });
    } catch (error) {
        console.error(TAG, 'Password change error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to change password. Please try again.'
        });
    }
});

/**
 * POST /api/user/profile-image
 *
 * Uploads a profile image for the authenticated user
 */
router.post('/profile-image', profileImageLimiter, authenticateToken, upload.single('image'), async (req, res) => {
    console.log(TAG, 'POST /api/user/profile-image - Profile image upload requested');
    
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        // Generate the URL for the uploaded image
        const imageUrl = `/uploads/${req.file.filename}`;
        
        // Update user's profile_image_url in database
        const updatedUser = await updateUser(req.userId, {
            profileImageUrl: imageUrl
        });

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log(TAG, 'Profile image uploaded successfully for user:', req.userId);
        
        res.status(200).json({
            success: true,
            message: 'Profile image uploaded successfully',
            imageUrl: imageUrl,
            user: formatUserResponse(updatedUser)
        });

    } catch (error) {
        console.error(TAG, 'Profile image upload error:', error.message);
        
        // Clean up uploaded file if there was an error
        if (req.file) {
            // Sanitize and validate the file path before deleting
            const uploadsRoot = path.resolve(__dirname, '../uploads');
            const filePath = path.resolve(uploadsRoot, path.basename(req.file.path));
            if (filePath.startsWith(uploadsRoot)) {
                fs.unlink(filePath, (err) => {
                    if (err) console.error(TAG, 'Error deleting uploaded file:', err);
                });
            } else {
                console.error(TAG, 'Attempted to delete file outside uploads directory:', filePath);
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to upload profile image. Please try again.'
        });
    }
});

/**
 * GET /api/user/status
 * 
 * Returns the status of the user service
 */
router.get('/status', statusLimiter, async (req, res) => {
    console.log(TAG, 'GET /api/user/status - Status check requested');
    
    try {
        res.status(200).json({
            service: 'User API',
            status: 'operational',
            version: '1.0.0',
            endpoints: {
                signup: 'POST /api/user/signup',
                login: 'POST /api/user/login',
                profile: 'GET /api/user/profile',
                updateProfile: 'PUT /api/user/profile',
                updateStats: 'PUT /api/user/stats',
                status: 'GET /api/user/status'
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error(TAG, 'Error getting user service status:', error);
        res.status(500).json({
            service: 'User API',
            status: 'error',
            message: 'Service status check failed',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router; 
