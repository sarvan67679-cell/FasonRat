// Authentication Middleware Module

import config from '../config/config.js';
import db from '../database/db.js';
import { logger } from '../logs/logs.js';

const rateLimit = new Map();
const loginAttempts = new Map();

const checkRateLimit = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const { windowMs, maxRequests } = config.rateLimit;

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
};

const isLockedOut = (ip) => {
    const attempts = loginAttempts.get(ip);
    if (!attempts) return false;

    const now = Date.now();
    if (attempts.count >= config.security.loginAttempts) {
        if (now - attempts.lastAttempt < config.security.loginLockout) {
            return true;
        }
        loginAttempts.delete(ip);
    }
    return false;
};

const recordFailedAttempt = (ip) => {
    const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    loginAttempts.set(ip, attempts);
};

const clearFailedAttempts = (ip) => {
    loginAttempts.delete(ip);
};

const auth = (req, res, next) => {
    try {
        const token = req.cookies?.token;
        const session = db.main.get('sessions').find({ token }).value();

        if (token && session) {
            const now = Date.now();
            if (session.expiresAt > now) {
                db.main.get('sessions').find({ token }).assign({
                    expiresAt: now + config.security.sessionTimeout
                }).write();
                req.user = { username: session.username };
                next();
            } else {
                db.main.get('sessions').remove({ token }).write();
                res.clearCookie('token');
                return req.xhr || req.path.startsWith('/api/')
                    ? res.status(401).json({ error: 'Session expired' })
                    : res.redirect('/login?expired=1');
            }
        } else {
            return req.xhr || req.path.startsWith('/api/')
                ? res.status(401).json({ error: 'Unauthorized' })
                : res.redirect('/login');
        }
    } catch (e) {
        logger.systemError('Auth middleware failed', e);
        res.redirect('/login');
    }
};

const cleanupSessions = () => {
    const now = Date.now();
    db.main.get('sessions').remove(s => s.expiresAt < now).write();
};

const startCleanup = () => {
    setInterval(() => {
        const now = Date.now();
        const { windowMs } = config.rateLimit;

        for (const [ip, entry] of rateLimit.entries()) {
            if (now - entry.start > windowMs * 2) rateLimit.delete(ip);
        }

        for (const [ip, attempts] of loginAttempts.entries()) {
            if (now - attempts.lastAttempt > config.security.loginLockout * 2) {
                loginAttempts.delete(ip);
            }
        }

        cleanupSessions();
    }, 60000);
};

export {
    auth,
    checkRateLimit,
    isLockedOut,
    recordFailedAttempt,
    clearFailedAttempts,
    cleanupSessions,
    startCleanup
};
