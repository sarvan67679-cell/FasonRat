const crypto = require('crypto');
const config = require('../config/config');
const db = require('../database/db');
const { logger } = require('../logs/logs');

// Rate limiting - use config values
const rateLimit = new Map();
const loginAttempts = new Map();

function checkRateLimit(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowMs = config.rateLimit.windowMs;
    const maxRequests = config.rateLimit.maxRequests;

    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, { count: 1, start: now });
    } else {
        const entry = rateLimit.get(ip);
        if (now - entry.start > windowMs) {
            entry.count = 1;
            entry.start = now;
        } else {
            entry.count++;
            if (entry.count > maxRequests) {
                return res.status(429).json({ error: 'Too many requests' });
            }
        }
    }
    next();
}

// Check if IP is locked out
function isLockedOut(ip) {
    const attempts = loginAttempts.get(ip);
    if (!attempts) return false;

    const now = Date.now();
    if (attempts.count >= config.security.loginAttempts) {
        if (now - attempts.lastAttempt < config.security.loginLockout) {
            return true;
        } else {
            // Reset after lockout period
            loginAttempts.delete(ip);
        }
    }
    return false;
}

// Record failed login attempt
function recordFailedAttempt(ip) {
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    loginAttempts.set(ip, attempts);
}

// Clear failed attempts after successful login
function clearFailedAttempts(ip) {
    loginAttempts.delete(ip);
}

// Auth middleware
function auth(req, res, next) {
    try {
        const token = req.cookies?.token;
        const session = db.main.get('sessions').find({ token }).value();

        if (token && session) {
            // Check session expiry
            const now = Date.now();
            if (session.expiresAt > now) {
                // Extend session
                db.main.get('sessions').find({ token }).assign({
                    expiresAt: now + config.security.sessionTimeout
                }).write();
                req.user = { username: session.username };
                next();
            } else {
                // Session expired
                db.main.get('sessions').remove({ token }).write();
                res.clearCookie('token');
                if (req.xhr || req.path.startsWith('/api/')) {
                    return res.status(401).json({ error: 'Session expired' });
                }
                res.redirect('/login?expired=1');
            }
        } else {
            if (req.xhr || req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            res.redirect('/login');
        }
    } catch (e) {
        logger.systemError('Auth middleware failed', e);
        res.redirect('/login');
    }
}

// Setup login/logout/register routes
function setupRoutes(router) {
    // Login page
    router.get('/login', (req, res) => {
        // Redirect to dashboard if already logged in
        const token = req.cookies?.token;
        const session = db.main.get('sessions').find({ token }).value();
        if (token && session && session.expiresAt > Date.now()) {
            return res.redirect('/');
        }

        res.render('login', {
            error: req.query.error,
            locked: req.query.locked,
            expired: req.query.expired
        });
    });

    // Login handler
    router.post('/login', (req, res, next) => {
        try {
            const { user, pass } = req.body;
            const ip = req.ip || req.connection.remoteAddress;

            // Check lockout
            if (isLockedOut(ip)) {
                logger.loginFailed(ip);
                return res.redirect('/login?locked=1');
            }

            // Find user
            const foundUser = db.main.get('users').find({ username: user }).value();

            if (foundUser) {
                const hash = crypto.createHash('md5').update(pass || '').digest('hex');

                if (hash === foundUser.password) {
                    // Successful login
                    const token = crypto.randomBytes(32).toString('hex');
                    const now = Date.now();

                    // Create session
                    db.main.get('sessions').push({
                        token,
                        username: user,
                        createdAt: now,
                        expiresAt: now + config.security.sessionTimeout,
                        ip
                    }).write();

                    // Update user last login
                    db.main.get('users').find({ username: user }).assign({
                        lastLogin: new Date().toISOString()
                    }).write();

                    clearFailedAttempts(ip);
                    logger.loginSuccess(ip);

                    res.cookie('token', token, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: config.security.sessionTimeout
                    }).redirect('/');
                } else {
                    recordFailedAttempt(ip);
                    logger.loginFailed(ip);
                    res.redirect('/login?error=1');
                }
            } else {
                recordFailedAttempt(ip);
                logger.loginFailed(ip);
                res.redirect('/login?error=1');
            }
        } catch (e) {
            logger.systemError('Login failed', e);
            res.redirect('/login?error=1');
        }
    });

    // Register page
    router.get('/register', (req, res) => {
        // Redirect to dashboard if already logged in
        const token = req.cookies?.token;
        const session = db.main.get('sessions').find({ token }).value();
        if (token && session && session.expiresAt > Date.now()) {
            return res.redirect('/');
        }

        res.render('register', { error: req.query.error, success: req.query.success });
    });

    // Register handler
    router.post('/register', (req, res) => {
        try {
            const { user, pass, passConfirm } = req.body;
            const ip = req.ip || req.connection.remoteAddress;

            // Validate username
            if (!user || user.length < 3) {
                return res.redirect('/register?error=3');
            }

            // Validate password
            if (!pass || pass.length < 6) {
                return res.redirect('/register?error=2');
            }

            // Check password confirmation
            if (pass !== passConfirm) {
                return res.redirect('/register?error=4');
            }

            // Check if username already exists
            const existingUser = db.main.get('users').find({ username: user }).value();
            if (existingUser) {
                return res.redirect('/register?error=1');
            }

            // Create user
            const hash = crypto.createHash('md5').update(pass).digest('hex');
            db.main.get('users').push({
                username: user,
                password: hash,
                createdAt: new Date().toISOString(),
                lastLogin: null
            }).write();

            logger.info(`New user registered: ${user} from ${ip}`, 'auth');
            res.redirect('/login?registered=1');
        } catch (e) {
            logger.systemError('Registration failed', e);
            res.redirect('/register?error=5');
        }
    });

    // Logout
    router.get('/logout', (req, res) => {
        try {
            const token = req.cookies?.token;
            const session = db.main.get('sessions').find({ token }).value();
            const ip = req.ip || req.connection.remoteAddress;

            // Remove session
            if (token) {
                db.main.get('sessions').remove({ token }).write();
            }

            logger.logout(ip, session?.username);
            res.clearCookie('token').redirect('/login');
        } catch (e) {
            logger.systemError('Logout failed', e);
            res.clearCookie('token').redirect('/login');
        }
    });
}

// Clean up expired sessions
function cleanupSessions() {
    const now = Date.now();
    db.main.get('sessions').remove(s => s.expiresAt < now).write();
}

// Cleanup rate limit entries periodically
function startCleanup() {
    setInterval(() => {
        const now = Date.now();
        const windowMs = config.rateLimit.windowMs;

        // Cleanup rate limits
        for (const [ip, entry] of rateLimit.entries()) {
            if (now - entry.start > windowMs * 2) {
                rateLimit.delete(ip);
            }
        }

        // Cleanup login attempts
        for (const [ip, attempts] of loginAttempts.entries()) {
            if (now - attempts.lastAttempt > config.security.loginLockout * 2) {
                loginAttempts.delete(ip);
            }
        }

        // Cleanup expired sessions
        cleanupSessions();
    }, 60000);
}

// Initialize default admin if no users exist
function initDefaultUser() {
    const users = db.main.get('users').value();
    if (!users || users.length === 0) {
        const defaultPass = crypto.createHash('md5').update('fason').digest('hex');
        db.main.get('users').push({
            username: 'admin',
            password: defaultPass,
            createdAt: new Date().toISOString(),
            lastLogin: null
        }).write();
        logger.info('Default admin user created (password: fason)', 'auth');
    }
}

module.exports = {
    auth,
    checkRateLimit,
    setupRoutes,
    startCleanup,
    initDefaultUser
};
