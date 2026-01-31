const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('./config');

// Log database
const logFile = path.join(config.dbPath, 'logs.json');
const logDb = low(new FileSync(logFile));
logDb.defaults({ logs: [] }).write();

// Log types
const types = {
    info: { name: 'INFO', color: '#3b82f6' },
    success: { name: 'SUCCESS', color: '#22c55e' },
    error: { name: 'ERROR', color: '#ef4444' },
    warning: { name: 'WARNING', color: '#f59e0b' }
};

function log(type, message) {
    const logType = typeof type === 'string' ? type : (type?.name || 'info');
    
    const entry = {
        time: new Date().toISOString(),
        type: logType.toUpperCase(),
        message
    };
    
    logDb.get('logs').push(entry).write();
    console.log(`[${entry.time}] ${entry.type}: ${message}`);
}

function getLogs(limit = 100) {
    return logDb.get('logs')
        .sortBy('time')
        .reverse()
        .take(limit)
        .value();
}

function clearLogs() {
    logDb.set('logs', []).write();
}

module.exports = { log, getLogs, clearLogs, types };
