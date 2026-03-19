// Client Commands Module

import db from '../database/db.js';
import { logger } from '../logs/logs.js';

const sendAsync = async (sockets, getDb, id, cmd, params = {}) => {
    try {
        // Check if client exists in repository
        const clientExists = db.repository.exists(id) || db.clientExists(id);
        if (!clientExists) {
            logger.commandFailed(id, cmd, 'Client not found');
            return { error: 'Client not found', result: null };
        }

        // Prepare command parameters
        const orderParams = {
            ...params,
            type: cmd,
            timestamp: Date.now()
        };

        // Try to get socket from ExtendedMap or plain object
        let socket = null;
        if (sockets && typeof sockets.has === 'function' && sockets.has(id)) {
            socket = sockets.get(id);
        } else if (sockets && sockets[id]) {
            socket = sockets[id];
        }

        // Send command or queue it
        if (socket && typeof socket.emit === 'function') {
            socket.emit('order', orderParams);
            logger.commandSent(id, cmd, orderParams);
            return { error: null, result: 'Sent' };
        } else {
            // Client exists but not connected - queue the command
            return await queueAsync(getDb, id, orderParams);
        }
    } catch (e) {
        logger.commandFailed(id, cmd, e.message);
        return { error: e.message, result: null };
    }
};

const queueAsync = async (getDb, id, params) => {
    try {
        const cdb = getDb(id);
        if (!cdb) {
            return { error: 'Database unavailable', result: null };
        }

        // Check if same command type already queued
        const existing = cdb.get('queue').find({ type: params.type }).value();
        if (existing) {
            return { error: null, result: 'Already queued' };
        }

        // Add to queue
        params.uid = Date.now();
        cdb.get('queue').push(params).write();
        logger.commandQueued(id, params.type);
        return { error: null, result: 'Queued' };
    } catch (e) {
        return { error: e.message, result: null };
    }
};

const runQueue = (sockets, getDb, id) => {
    try {
        const cdb = getDb(id);
        if (!cdb) return;

        const queueItems = cdb.get('queue').value() || [];
        
        // Get socket from ExtendedMap or plain object
        let socket = null;
        if (sockets && typeof sockets.has === 'function' && sockets.has(id)) {
            socket = sockets.get(id);
        } else if (sockets && sockets[id]) {
            socket = sockets[id];
        }
        
        if (!socket || typeof socket.emit !== 'function') return;

        // Send all queued commands
        queueItems.forEach(cmd => {
            socket.emit('order', cmd);
            cdb.get('queue').remove({ uid: cmd.uid }).write();
        });
    } catch (e) {
        logger.systemError('Run queue failed', e);
    }
};

const send = (sockets, getDb, id, cmd, params = {}, cb = () => {}) => {
    sendAsync(sockets, getDb, id, cmd, params)
        .then(({ error, result }) => cb(error, result))
        .catch(e => cb(e.message, null));
};

const queue = (getDb, id, params, cb = () => {}) => {
    queueAsync(getDb, id, params)
        .then(({ error, result }) => cb(error, result))
        .catch(e => cb(e.message, null));
};

const commands = {
    sendAsync,
    queueAsync,
    runQueue,
    send,
    queue
};

export default commands;

export {
    sendAsync,
    queueAsync,
    runQueue,
    send,
    queue
};
