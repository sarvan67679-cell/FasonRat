const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');

const config = require('./core/config/config');
const routes = require('./core/routes/routes');
const initSocket = require('./core/socket/socket');
const { logger } = require('./core/logs/logs');
const taskManager = require('./core/utils/tasks');
const { initDefaultUser } = require('./core/auth/auth');

console.log('Fason Control Panel - Starting...');
logger.info('Server starting...', 'system');

// Setup directories
config.init();

// Create default admin
initDefaultUser();

// Create Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'web/views'));

// Static files
app.use(express.static(path.join(__dirname, 'web/public')));

// App routes
app.use(routes);

// Global error handler
app.use((err, req, res, next) => {
    logger.systemError('Unhandled error', err);
    res.status(500).render('error', {
        error: config.debug ? err.message : 'Internal server error'
    });
});

// Init Socket.IO
initSocket(server);

// Start background tasks
taskManager.startAll();

// Start HTTP server
server.listen(config.port, () => {
    console.log(`Server started at http://localhost:${config.port}`);
    logger.success(`Server listening on port ${config.port}`, 'system');
});

// Handle uncaught errors
process.on('uncaughtException', (err) => {
    logger.systemError('Uncaught exception', err);
    console.error('Uncaught Exception:', err);
});

// Handle unhandled promises
process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled rejection: ${reason}`, 'error', { reason });
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
const shutdown = (signal) => {
    logger.info(`Server shutting down (${signal})`, 'system');
    taskManager.stopAll();
    server.close(() => {
        logger.info('Server closed', 'system');
        process.exit(0);
    });
};

// Shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));