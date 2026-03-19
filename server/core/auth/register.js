// Register Routes Module

import config from '../config/config.js';
import db from '../database/db.js';
import { logger } from '../logs/logs.js';
import { hashPassword, validatePasswordStrength } from './password.js';

const renderRegisterPage = (req, res) => {
    const token = req.cookies?.token;
    const session = db.main.get('sessions').find({ token }).value();
    
    if (token && session && session.expiresAt > Date.now()) {
        return res.redirect('/');
    }
    
    res.render('register', { error: req.query.error, success: req.query.success });
};

const handleRegister = async (req, res) => {
    try {
        const { user, pass, passConfirm } = req.body;
        const ip = req.ip || req.connection.remoteAddress;

        if (!user || user.length < 3) {
            return res.redirect('/register?error=3');
        }
        
        if (user.length > 32) {
            return res.redirect('/register?error=5');
        }

        if (!/^[a-zA-Z0-9_]+$/.test(user)) {
            return res.redirect('/register?error=5');
        }
        
        const passwordValidation = validatePasswordStrength(pass);
        if (!passwordValidation.valid) {
            return res.redirect('/register?error=2');
        }
        
        if (pass !== passConfirm) {
            return res.redirect('/register?error=4');
        }

        const existingUser = db.main.get('users').find({ username: user.toLowerCase() }).value();
        
        if (existingUser) {
            return res.redirect('/register?error=1');
        }

        const hashedPassword = await hashPassword(pass);
        
        db.main.get('users').push({
            username: user,
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            authMethod: 'bcrypt'
        }).write();

        logger.info(`New user registered: ${user} from ${ip}`, 'auth');
        res.redirect('/login?registered=1');
    } catch (e) {
        logger.systemError('Registration failed', e);
        res.redirect('/register?error=5');
    }
};

const initDefaultUser = async () => {
    const users = db.main.get('users').value();
    
    if (!users || users.length === 0) {
        const defaultPassword = 'fason';
        const hashedPassword = await hashPassword(defaultPassword);
        
        db.main.get('users').push({
            username: 'admin',
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            authMethod: 'bcrypt',
            isDefault: true
        }).write();
        
        logger.info('Default admin user created (password: fason)', 'auth');
    }
};

const setupRegisterRoutes = (router) => {
    router.get('/register', renderRegisterPage);
    router.post('/register', handleRegister);
};

export {
    renderRegisterPage,
    handleRegister,
    initDefaultUser,
    setupRegisterRoutes
};
