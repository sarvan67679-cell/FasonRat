const { logger } = require('../logs/logs');
const db = require('../database/db');
const clients = require('../clients/clients');

// Task Manager class
class TaskManager {
    constructor() {
        this.tasks = {};
        this.intervals = {};
        logger.info('Task manager initialized');
    }

    // Register task
    register(name, interval, fn, opts = {}) {
        if (this.tasks[name]) return;
        this.tasks[name] = {
            interval,
            fn,
            running: false,
            lastRun: null,
            errorCount: 0,
            ...opts
        };
    }

    // Start all tasks
    startAll() {
        Object.keys(this.tasks).forEach(name => this.start(name));
        logger.info('All background tasks started', 'system');
    }

    // Start task
    start(name) {
        const task = this.tasks[name];
        if (!task || this.intervals[name]) return;

        this.run(name);
        this.intervals[name] = setInterval(() => this.run(name), task.interval);
    }

    // Stop task
    stop(name) {
        if (this.intervals[name]) {
            clearInterval(this.intervals[name]);
            delete this.intervals[name];
        }
    }

    // Run task
    async run(name) {
        const task = this.tasks[name];
        if (!task || task.running) return;

        task.running = true;
        task.lastRun = new Date().toISOString();

        try {
            await task.fn();
            task.errorCount = 0;
        } catch (e) {
            task.errorCount++;
            logger.systemError(`Task ${name} failed`, e);
            if (task.errorCount >= 5 && task.stopOnError !== false) {
                this.stop(name);
            }
        }

        task.running = false;
    }

    // Stop all tasks
    stopAll() {
        Object.keys(this.intervals).forEach(name => this.stop(name));
        logger.info('All background tasks stopped', 'system');
    }
}

// Create instance
const taskManager = new TaskManager();

// Format bytes helper
const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Register cleanup task (hourly)
taskManager.register('cleanup', 3600000, async () => {
    logger.info('Running cleanup task...', 'system');
    clients.cleanup(30 * 24 * 60 * 60 * 1000);
    db.cleanupBackups();
    logger.info('Cleanup completed', 'system');
});

// Register heartbeat task (30s)
taskManager.register('heartbeat', 30000, async () => {
    if (!global.io) return;

    try {
        const sockets = await global.io.fetchSockets();
        const connectedIds = new Set(sockets.map(s => s.handshake?.query?.id).filter(Boolean));

        let updated = 0;
        db.getClientIds().forEach(id => {
            const client = clients.get(id);
            const isOnline = connectedIds.has(id);

            if (client && client.online !== isOnline) {
                if (isOnline) {
                    db.main.get('clients').find({ id }).assign({ online: true }).write();
                } else {
                    clients.disconnect(id);
                }
                updated++;
            }
        });

        if (updated > 0) logger.info(`Heartbeat: ${updated} clients updated`, 'system');
    } catch (e) {
        logger.systemError('Heartbeat failed', e);
    }
}, { stopOnError: false });

// Register log rotation task (daily)
taskManager.register('logRotate', 86400000, async () => {
    const stats = db.getStats();
    if (stats.total > 50000) {
        logger.info(`Log rotation: ${stats.total} logs`, 'system');
    }
});

// Register database maintenance task (hourly)
taskManager.register('dbMaintenance', 3600000, async () => {
    db.getClientIds().forEach(id => db.trimClientData(id));
    const stats = db.getStats();
    logger.info(`DB maintenance: ${stats.clientCount} clients, ${formatBytes(stats.totalSize)}`, 'system');
});

// Register transfer cleanup task (5 min)
taskManager.register('transferCleanup', 300000, async () => {
    if (clients.cleanupStaleTransfers) {
        clients.cleanupStaleTransfers(600000);
    }
});

module.exports = taskManager;
