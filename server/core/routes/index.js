// Routes Module Index

import express from 'express';
import { logger } from '../logs/logs.js';
import { checkRateLimit, setupRoutes as setupAuthRoutes, startCleanup } from '../auth/index.js';

import dashboard from './dashboard.js';
import builder from './builder.js';
import logs from './logs.js';
import device from './device.js';
import settings from './settings.js';
import api from './api.js';
import staticFiles from './static.js';

const router = express.Router();

router.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        if (req.path !== '/builder/progress' && !req.path.startsWith('/api/clients')) {
            logger.http(req.method, req.path, res.statusCode, req.ip);
        }
    });
    next();
});

router.use(checkRateLimit);

setupAuthRoutes(router);
startCleanup();

dashboard.setupDashboardRoutes(router);
builder.setupBuilderRoutes(router);
logs.setupLogsRoutes(router);
device.setupDeviceRoutes(router);
settings.setupSettingsRoutes(router);
api.setupApiRoutes(router);
staticFiles.setupStaticRoutes(router);

router.use((err, req, res, next) => {
    logger.systemError('Route error', err);
    res.status(500).json({ error: 'Internal server error' });
});

export default router;
