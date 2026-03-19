// Client Cleanup Module

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import db from '../database/db.js';
import { logger } from '../logs/logs.js';
import { dbPath, downloadsPath, photosPath, recordingsPath, clientDb } from '../database/path.js';

const forEachEntry = (collection, fn) => {
    if (collection.has && collection.forEach) {
        collection.forEach((value, key) => fn(key, value));
    } else {
        Object.entries(collection).forEach(([key, value]) => fn(key, value));
    }
};

const deleteEntry = (collection, key) => {
    if (collection.has && collection.delete) {
        collection.delete(key);
    } else {
        delete collection[key];
    }
};

const cleanupStaleTransfers = (transfers, maxAge = 600000) => {
    const now = Date.now();
    const toDelete = [];
    
    forEachEntry(transfers, (tid, t) => {
        if (t.startTime && now - t.startTime > maxAge) {
            toDelete.push(tid);
        }
    });
    
    toDelete.forEach(tid => deleteEntry(transfers, tid));
    
    if (toDelete.length > 0) {
        logger.debug(`Cleaned up ${toDelete.length} stale transfers`, 'cleanup');
    }
};

const cleanupAsync = async (maxAge = 2592000000) => {
    const now = Date.now();
    const clients = db.main.get('clients').value() || [];
    let cleaned = 0;
    
    for (const client of clients) {
        if (client.lastSeen && !client.online) {
            const lastSeen = new Date(client.lastSeen).getTime();
            if (now - lastSeen > maxAge) {
                try {
                    db.main.get('clients').remove({ id: client.id }).write();
                    const file = clientDb(client.id);
                    await fs.unlink(file).catch(() => {});
                    await cleanClientFilesAsync(client.id);
                    logger.info(`Cleaned up stale client: ${client.id}`, 'cleanup');
                    cleaned++;
                } catch (e) {
                    logger.systemError(`Failed to cleanup client ${client.id}`, e);
                }
            }
        }
    }
    
    if (cleaned > 0) {
        logger.info(`Cleanup complete: ${cleaned} clients removed`, 'cleanup');
    }
    
    return cleaned;
};

const cleanupClients = (maxAge = 2592000000) => {
    const now = Date.now();
    const clients = db.main.get('clients').value() || [];
    
    clients.forEach(client => {
        if (client.lastSeen && !client.online) {
            const lastSeen = new Date(client.lastSeen).getTime();
            if (now - lastSeen > maxAge) {
                db.main.get('clients').remove({ id: client.id }).write();
                const file = clientDb(client.id);
                if (fsSync.existsSync(file)) fsSync.unlinkSync(file);
                logger.info(`Cleaned up stale client: ${client.id}`, 'cleanup');
            }
        }
    });
};

const cleanClientFilesAsync = async (id) => {
    const dirs = [downloadsPath, photosPath, recordingsPath];
    
    await Promise.all(dirs.map(async (dir) => {
        try {
            const files = await fs.readdir(dir).catch(() => []);
            const clientFiles = files.filter(f => f.startsWith(id));
            await Promise.all(clientFiles.map(f => fs.unlink(path.join(dir, f)).catch(() => {})));
        } catch (e) {}
    }));
};

const cleanupCaches = (clients) => {
    if (clients.clearCache) {
        clients.clearCache();
    }
    db.repository.clearCache();
    logger.info('All caches cleared', 'cleanup');
};

const getCleanupStats = () => {
    const clients = db.main.get('clients').value() || [];
    const now = Date.now();
    const day = 86400000;
    const week = day * 7;
    const month = day * 30;
    
    return {
        total: clients.length,
        online: clients.filter(c => c.online).length,
        offline: clients.filter(c => !c.online).length,
        inactiveDay: clients.filter(c => {
            if (c.online) return false;
            const lastSeen = new Date(c.lastSeen).getTime();
            return now - lastSeen > day;
        }).length,
        inactiveWeek: clients.filter(c => {
            if (c.online) return false;
            const lastSeen = new Date(c.lastSeen).getTime();
            return now - lastSeen > week;
        }).length,
        inactiveMonth: clients.filter(c => {
            if (c.online) return false;
            const lastSeen = new Date(c.lastSeen).getTime();
            return now - lastSeen > month;
        }).length
    };
};

const cleanup = {
    cleanupStaleTransfers,
    cleanupClients,
    cleanupAsync,
    cleanClientFilesAsync,
    cleanupCaches,
    getCleanupStats
};

export default cleanup;

export {
    cleanupStaleTransfers,
    cleanupClients,
    cleanupAsync,
    cleanClientFilesAsync,
    cleanupCaches,
    getCleanupStats
};
