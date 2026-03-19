// Login Routes Module

import crypto from 'crypto';
import config from '../config/config.js';
import db from '../database/db.js';
import { logger } from '../logs/logs.js';
import { isLockedOut, recordFailedAttempt, clearFailedAttempts } from './middleware.js';
import { verifyPassword } from './password.js';

const renderLoginPage = (req, res) => {
    const token = req.cookies?.token;
    const session = db.main.get('sessions').find({ token }).value();
    
    if (token && session && session.expiresAt > Date.now()) {
        return res.redirect('/');
    }
    
    res.render('login', {
        error: req.query.error,
        locked: req.query.locked,
        expired: req.query.expired,
        registered: req.query.registered
    });
};

const handleLogin = async (req, res) => {
    try {
        const { user, pass } = req.body;
        const ip = req.ip || req.connection.remoteAddress;

        if (isLockedOut(ip)) {
            logger.loginFailed(ip);
            return res.redirect('/login?locked=1');
        }

        const foundUser = db.main.get('users').find({ username: user }).value();

        if (foundUser) {
            const valid = await verifyPassword(pass || '', foundUser.password);

            if (valid) {
                const token = crypto.randomBytes(32).toString('hex');
                const now = Date.now();

                db.main.get('sessions').push({
                    token,
                    username: user,
                    createdAt: now,
                    expiresAt: now + config.security.sessionTimeout,
                    ip
                }).write();

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
};

const handleLogout = (req, res) => {
    try {
        const token = req.cookies?.token;
        const session = db.main.get('sessions').find({ token }).value();
        
        if (token) {
            db.main.get('sessions').remove({ token }).write();
        }
        
        logger.logout(req.ip, session?.username);
        res.clearCookie('token').redirect('/login');
    } catch (e) {
        logger.systemError('Logout failed', e);
        res.clearCookie('token').redirect('/login');
    }
};

const setupLoginRoutes = (router) => {
    router.get('/login', renderLoginPage);
    router.post('/login', handleLogin);
    router.get('/logout', handleLogout);
};

export {
    renderLoginPage,
    handleLogin,
    handleLogout,
    setupLoginRoutes
};
