// Task Manager Module

import { logger } from '../logs/logs.js';
import db from '../database/db.js';
import clients from '../clients/index.js';
import { ExtendedMap } from './collections.js';

class TaskManager {
    constructor() {
        this.tasks = new ExtendedMap();
        this.intervals = new ExtendedMap();
        logger.info('Task manager initialized');
    }

    register(name, interval, fn, opts = {}) {
        if (this.tasks.has(name)) {
            logger.warning(`Task "${name}" already registered`, 'tasks');
            return;
        }
        
        this.tasks.set(name, {
            interval,
            fn,
            running: false,
            lastRun: null,
            errorCount: 0,
            ...opts
        });
    }

    startAll() {
        for (const name of this.tasks.keys()) {
            this.start(name);
        }
        logger.info(`All background tasks started (${this.tasks.size} tasks)`, 'system');
    }

    start(name) {
        const task = this.tasks.get(name);
        if (!task) {
            logger.warning(`Task "${name}" not found`, 'tasks');
            return;
        }
        
        if (this.intervals.has(name)) {
            logger.warning(`Task "${name}" already running`, 'tasks');
            return;
        }

        this.run(name);
        
        const intervalId = setInterval(() => this.run(name), task.interval);
        this.intervals.set(name, intervalId);
        
        logger.debug(`Task "${name}" started`, 'tasks');
    }

    stop(name) {
        const intervalId = this.intervals.get(name);
        if (intervalId) {
            clearInterval(intervalId);
            this.intervals.delete(name);
            logger.debug(`Task "${name}" stopped`, 'tasks');
        }
    }

    async run(name) {
        const task = this.tasks.get(name);
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
                logger.error(`Task "${name}" stopped after 5 consecutive errors`, 'tasks');
            }
        }

        task.running = false;
    }

    stopAll() {
        for (const name of this.intervals.keys()) {
            this.stop(name);
        }
        logger.info('All background tasks stopped', 'system');
    }

    getStatus(name) {
        const task = this.tasks.get(name);
        if (!task) return null;
        
        return {
            name,
            interval: task.interval,
            running: task.running,
            lastRun: task.lastRun,
            errorCount: task.errorCount,
            isScheduled: this.intervals.has(name)
        };
    }

    getAllStatuses() {
        const statuses = [];
        for (const name of this.tasks.keys()) {
            statuses.push(this.getStatus(name));
        }
        return statuses;
    }

    has(name) {
        return this.tasks.has(name);
    }

    unregister(name) {
        this.stop(name);
        this.tasks.delete(name);
        logger.debug(`Task "${name}" unregistered`, 'tasks');
    }

    get size() {
        return this.tasks.size;
    }
}

const taskManager = new TaskManager();

const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

taskManager.register('cleanup', 3600000, async () => {
    logger.info('Running cleanup task...', 'system');
    try {
        await clients.cleanup(30 * 24 * 60 * 60 * 1000);
        await db.cleanupBackupsAsync();
        logger.info('Cleanup completed', 'system');
    } catch (e) {
        logger.systemError('Cleanup task failed', e);
    }
});

taskManager.register('heartbeat', 30000, async () => {
    if (!global.io) return;

    try {
        const sockets = await global.io.fetchSockets();
        const connectedIds = new Set(
            sockets.map(s => s.handshake?.query?.id).filter(Boolean)
        );

        const clientIds = db.getClientIds();
        let updated = 0;

        for (const id of clientIds) {
            const client = clients.getSync(id);
            const isOnline = connectedIds.has(id);

            if (client && client.online !== isOnline) {
                if (isOnline) {
                    db.main.get('clients').find({ id }).assign({ online: true }).write();
                } else {
                    await clients.disconnect(id);
                }
                updated++;
            }
        }

        if (updated > 0) {
            logger.info(`Heartbeat: ${updated} clients updated`, 'system');
        }
    } catch (e) {
        logger.systemError('Heartbeat failed', e);
    }
}, { stopOnError: false });

taskManager.register('logRotate', 86400000, async () => {
    try {
        const stats = await db.getStatsAsync();
        if (stats.total > 50000) {
            logger.info(`Log rotation check: ${stats.total} logs`, 'system');
        }
    } catch (e) {
        logger.systemError('Log rotation check failed', e);
    }
});

taskManager.register('dbMaintenance', 3600000, async () => {
    try {
        const clientIds = db.getClientIds();
        for (const id of clientIds) {
            await db.trimClientDataAsync(id);
        }
        
        const stats = await db.getStatsAsync();
        logger.info(`DB maintenance: ${stats.clientCount} clients, ${formatBytes(stats.totalSize)}`, 'system');
    } catch (e) {
        logger.systemError('DB maintenance failed', e);
    }
});

taskManager.register('transferCleanup', 300000, async () => {
    try {
        if (clients.cleanupStaleTransfers) {
            clients.cleanupStaleTransfers(600000);
        }
    } catch (e) {
        logger.systemError('Transfer cleanup failed', e);
    }
}, { stopOnError: false });

taskManager.register('cacheWarm', 600000, async () => {
    try {
        await db.repository.warmCache();
    } catch (e) {}
}, { stopOnError: false });

export default taskManager;
