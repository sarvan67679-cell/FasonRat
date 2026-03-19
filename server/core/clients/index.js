// Client Manager Module

import connection from './connection.js';
import commands from './commands.js';
import gps from './gps.js';
import pages from './pages.js';
import storage from './storage.js';
import cleanup from './cleanup.js';
import handlers from './handlers/index.js';
import { logger } from '../logs/logs.js';
import db from '../database/db.js';
import { ExtendedMap, ExtendedSet } from '../utils/collections.js';

class ClientManager {
    constructor() {
        this.sockets = new ExtendedMap();
        this.dbs = new ExtendedMap();
        this.gpsTimers = new ExtendedMap();
        this.transfers = new ExtendedMap();
        this._clientCache = new ExtendedMap();
        this._onlineSet = new ExtendedSet();
        logger.info('Client manager initialized');
    }

    async connect(socket, id, data) {
        await connection.connect(this.sockets, id, { socket, ...data });
        this._onlineSet.add(id);
        this.setupHandlers(id);
        commands.runQueue(this.sockets, this.getDb.bind(this), id);
        gps.restoreGpsPolling(this.sockets, this.gpsTimers, this.getDb.bind(this), this.send.bind(this), id);
    }

    async disconnect(id) {
        await connection.disconnect(this.sockets, this.gpsTimers, this.transfers, id);
        this._clientCache.delete(id);
        this._onlineSet.delete(id);
    }

    getDb(id) {
        return pages.getDb(this.dbs, id);
    }

    async get(id) {
        if (this._clientCache.has(id)) {
            return this._clientCache.get(id);
        }
        const client = await connection.get(id);
        if (client) {
            this._clientCache.set(id, client);
        }
        return client;
    }

    getSync(id) {
        return connection.getSync(id);
    }

    isOnline(id) {
        return this._onlineSet.has(id);
    }

    getOnlineIds() {
        return Array.from(this._onlineSet);
    }

    async online() {
        return connection.online();
    }

    async offline() {
        return connection.offline();
    }

    async all() {
        return connection.all();
    }

    async send(id, cmd, params = {}, cb = null) {
        const result = await commands.sendAsync(this.sockets, this.getDb.bind(this), id, cmd, params);
        if (cb) {
            cb(result.error, result.result);
        }
        return result;
    }

    async queue(id, params) {
        return commands.queueAsync(this.getDb.bind(this), id, params);
    }

    runQueue(id) {
        commands.runQueue(this.sockets, this.getDb.bind(this), id);
    }

    setGps(id, interval) {
        return gps.setGps(this.sockets, this.gpsTimers, this.getDb.bind(this), this.send.bind(this), id, interval);
    }

    clearGps(id) {
        gps.clearGps(this.gpsTimers, id);
    }

    restoreGpsPolling(id) {
        gps.restoreGpsPolling(this.sockets, this.gpsTimers, this.getDb.bind(this), this.send.bind(this), id);
    }

    getData(id, page) {
        return pages.getData(this.dbs, this.getSync.bind(this), id, page);
    }

    async saveFile(id, name, buffer, type, size = null) {
        return storage.saveFileAsync(this.getDb.bind(this), id, name, buffer, type, size);
    }

    setupHandlers(id) {
        const socket = this.sockets.get(id);
        const cdb = this.getDb(id);
        if (!socket || !cdb) return;

        handlers.setupAllHandlers(
            socket,
            cdb,
            id,
            this.getDb.bind(this),
            this.transfers,
            this.saveFile.bind(this),
            this.disconnect.bind(this)
        );
    }

    cleanupStaleTransfers(maxAge = 600000) {
        cleanup.cleanupStaleTransfers(this.transfers, maxAge);
    }

    cleanupClients(maxAge = 2592000000) {
        cleanup.cleanupClients(maxAge);
    }
    
    cleanup(maxAge = 2592000000) {
        this.cleanupClients(maxAge);
    }

    count() {
        return db.repository.count();
    }

    exists(id) {
        return db.repository.exists(id);
    }

    clearCache() {
        this._clientCache.clear();
        this.dbs.clear();
        db.repository.clearCache();
    }

    getCacheStats() {
        return {
            localCache: this._clientCache.size,
            sockets: this.sockets.size,
            dbs: this.dbs.size,
            gpsTimers: this.gpsTimers.size,
            transfers: this.transfers.size,
            onlineClients: this._onlineSet.size,
            dbCache: db.repository.getCacheStats()
        };
    }

    broadcast(event, data) {
        for (const [id, socket] of this.sockets) {
            socket.emit(event, data);
        }
    }
}

export default new ClientManager();
