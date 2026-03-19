// GPS Polling Module

import config from '../config/config.js';
import { logger } from '../logs/logs.js';

const getTimer = (gpsTimers, id) => {
    if (gpsTimers.has && gpsTimers.get) {
        return gpsTimers.get(id);
    }
    return gpsTimers[id] || null;
};

const setTimer = (gpsTimers, id, timer) => {
    if (gpsTimers.has && gpsTimers.set) {
        gpsTimers.set(id, timer);
    } else {
        gpsTimers[id] = timer;
    }
};

const deleteTimer = (gpsTimers, id) => {
    if (gpsTimers.has && gpsTimers.delete) {
        gpsTimers.delete(id);
    } else {
        delete gpsTimers[id];
    }
};

const getSocket = (sockets, id) => {
    if (sockets.has && sockets.get) {
        return sockets.get(id);
    }
    return sockets[id] || null;
};

const setGps = (sockets, gpsTimers, getDb, send, id, interval) => {
    try {
        const existingTimer = getTimer(gpsTimers, id);
        if (existingTimer) {
            clearInterval(existingTimer);
            deleteTimer(gpsTimers, id);
        }

        const cdb = getDb(id);
        const socket = getSocket(sockets, id);

        if (interval > 0 && socket) {
            const timer = setInterval(() => {
                send(id, config.msg.location, {});
            }, interval * 1000);
            
            setTimer(gpsTimers, id, timer);

            if (cdb) cdb.set('gpsInterval', interval).write();
            logger.info(`GPS polling started for ${id} (${interval}s)`, 'client');
        } else if (cdb) {
            cdb.set('gpsInterval', 0).write();
        }

        return true;
    } catch (e) {
        logger.systemError('GPS set failed', e);
        return false;
    }
};

const clearGps = (gpsTimers, id) => {
    const timer = getTimer(gpsTimers, id);
    if (timer) {
        clearInterval(timer);
        deleteTimer(gpsTimers, id);
    }
};

const restoreGpsPolling = (sockets, gpsTimers, getDb, send, id) => {
    try {
        const cdb = getDb(id);
        const interval = cdb?.get('gpsInterval').value();
        if (interval > 0) {
            setGps(sockets, gpsTimers, getDb, send, id, interval);
        }
    } catch (e) {}
};

const getActivePollingClients = (gpsTimers) => {
    if (gpsTimers.has && gpsTimers.keys) {
        return Array.from(gpsTimers.keys());
    }
    return Object.keys(gpsTimers);
};

const clearAllGps = (gpsTimers) => {
    if (gpsTimers.has && gpsTimers.forEach) {
        for (const [id, timer] of gpsTimers) {
            clearInterval(timer);
            gpsTimers.delete(id);
        }
    } else {
        for (const id of Object.keys(gpsTimers)) {
            clearInterval(gpsTimers[id]);
            delete gpsTimers[id];
        }
    }
};

const gps = {
    setGps,
    clearGps,
    restoreGpsPolling,
    getActivePollingClients,
    clearAllGps
};

export default gps;

export {
    setGps,
    clearGps,
    restoreGpsPolling,
    getActivePollingClients,
    clearAllGps
};
