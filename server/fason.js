// Fason Server - Main Entry Point

import express from 'express';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';

import config from './core/config/config.js';
import routes from './core/routes/index.js';
import initSocket from './core/socket/socket.js';
import { logger } from './core/logs/logs.js';
import taskManager from './core/utils/tasks.js';
import { initDefaultUser } from './core/auth/index.js';
import db from './core/database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

logger.info('Server starting...', 'system');

async function initializeApp() {
    try {
        await db.repository.init();
        logger.info('Database repository initialized', 'database');
        await initDefaultUser();
        logger.success('Application initialized successfully', 'system');
    } catch (e) {
        logger.error('Application initialization failed', 'system', e);
    }
}

initializeApp();

const app = express();
const server = http.createServer(app);

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'web/views'));

// Custom EJS engine to properly handle includes
app.engine('ejs', (path, data, cb) => {
    const options = {
        views: Array.isArray(app.get('views')) ? app.get('views') : [app.get('views')],
        ...data.settings?.viewOptions
    };
    ejs.renderFile(path, data, options, cb);
});

app.use(express.static(join(__dirname, 'web/public')));
app.use(routes);

app.use((err, req, res, next) => {
    logger.error('Unhandled error', 'error', {
        message: err.message,
        stack: err.stack,
        path: req.path
    });
    res.status(500).render('error', {
        error: config.debug ? err.message : 'Internal server error'
    });
});

initSocket(server);
taskManager.startAll();

server.listen(config.port, () => {
    logger.success(`Server listening on port ${config.port}`, 'system');
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', 'error', {
        message: err.message,
        stack: err.stack
    });
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled rejection: ${reason}`, 'error', { reason });
});

const shutdown = (signal) => {
    logger.info(`Server shutting down (${signal})`, 'system');
    taskManager.stopAll();
    server.close(() => {
        logger.info('Server closed', 'system');
        process.exit(0);
    });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
