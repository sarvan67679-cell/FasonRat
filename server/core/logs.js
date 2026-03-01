const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('./config');

// Log database
const logFile = path.join(config.dbPath, 'logs.json');
const logDb = low(new FileSync(logFile));
logDb.defaults({ logs: [] }).write();

// Log types with colors
const TYPES = {
    INFO: { color: '#3b82f6', icon: 'ℹ' },
    SUCCESS: { color: '#22c55e', icon: '✓' },
    ERROR: { color: '#ef4444', icon: '✕' },
    WARNING: { color: '#f59e0b', icon: '⚠' },
    CONNECTION: { color: '#8b5cf6', icon: '🔗' },
    DISCONNECTION: { color: '#f97316', icon: '断' },
    COMMAND: { color: '#06b6d4', icon: '→' },
    DATA: { color: '#10b981', icon: '↓' },
    BUILD: { color: '#a855f7', icon: '⚙' },
    AUTH: { color: '#ec4899', icon: '🔐' },
    FILE: { color: '#6366f1', icon: '📁' }
};

// Categories for filtering
const CATEGORIES = {
    SYSTEM: 'system',
    CLIENT: 'client',
    BUILD: 'build',
    AUTH: 'auth',
    DATA: 'data',
    FILE: 'file',
    ERROR: 'error'
};

// Add log entry
function log(type, message, category = 'system', details = null) {
    const logType = (typeof type === 'string' ? type : type?.name || 'INFO').toUpperCase();
    
    const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        time: new Date().toISOString(),
        type: logType,
        category,
        message,
        details
    };
    
    // Add to database
    logDb.get('logs').push(entry).write();
    
    // Console output with icon
    const typeInfo = TYPES[logType] || TYPES.INFO;
    console.log(`[${entry.time}] ${typeInfo.icon} [${logType}] ${message}`);
    
    return entry;
}

// Convenience methods
const logger = {
    info: (msg, category = 'system', details = null) => log('INFO', msg, category, details),
    success: (msg, category = 'system', details = null) => log('SUCCESS', msg, category, details),
    error: (msg, category = 'error', details = null) => log('ERROR', msg, category, details),
    warning: (msg, category = 'system', details = null) => log('WARNING', msg, category, details),
    
    // Client events
    clientConnected: (id, ip, device) => log('CONNECTION', `Client ${id} connected from ${ip}`, 'client', { id, ip, device }),
    clientDisconnected: (id, reason = '') => log('DISCONNECTION', `Client ${id} disconnected${reason ? ': ' + reason : ''}`, 'client', { id, reason }),
    
    // Commands
    commandSent: (id, cmd, params = {}) => log('COMMAND', `Command ${cmd} sent to ${id}`, 'client', { id, cmd, params }),
    commandQueued: (id, cmd) => log('COMMAND', `Command ${cmd} queued for offline client ${id}`, 'client', { id, cmd }),
    commandFailed: (id, cmd, error) => log('ERROR', `Command ${cmd} failed for ${id}: ${error}`, 'client', { id, cmd, error }),
    
    // Data received
    dataReceived: (id, type, count = null) => {
        const countStr = count !== null ? ` (${count} items)` : '';
        log('DATA', `Received ${type} from ${id}${countStr}`, 'data', { id, type, count });
    },
    
    // Files
    fileSaved: (id, name, type) => log('FILE', `Saved ${type} file "${name}" from ${id}`, 'file', { id, name, type }),
    fileSaveFailed: (id, name, error) => log('ERROR', `Failed to save "${name}" from ${id}: ${error}`, 'file', { id, name, error }),
    
    // Auth
    loginSuccess: (ip) => log('AUTH', `Admin logged in from ${ip}`, 'auth', { ip }),
    loginFailed: (ip) => log('WARNING', `Failed login attempt from ${ip}`, 'auth', { ip }),
    logout: (ip) => log('AUTH', `Admin logged out from ${ip}`, 'auth', { ip }),
    
    // Build
    buildStart: (serverUrl) => log('BUILD', `Starting APK build for ${serverUrl}`, 'build', { serverUrl }),
    buildStep: (step, msg) => log('BUILD', `[${step}] ${msg}`, 'build', { step }),
    buildSuccess: (serverUrl) => log('SUCCESS', `APK built successfully for ${serverUrl}`, 'build', { serverUrl }),
    buildFailed: (error) => log('ERROR', `APK build failed: ${error}`, 'build', { error }),
    
    // Errors
    systemError: (context, error) => log('ERROR', `${context}: ${error.message || error}`, 'error', { context, error: error.message || error })
};

// Get logs with filtering
function getLogs(options = {}) {
    const { limit = 100, type = null, category = null, search = null } = options;
    
    let query = logDb.get('logs');
    
    if (type) {
        query = query.filter(l => l.type === type.toUpperCase());
    }
    
    if (category) {
        query = query.filter(l => l.category === category);
    }
    
    if (search) {
        const searchLower = search.toLowerCase();
        query = query.filter(l => 
            l.message.toLowerCase().includes(searchLower) ||
            (l.details && JSON.stringify(l.details).toLowerCase().includes(searchLower))
        );
    }
    
    return query
        .sortBy('time')
        .reverse()
        .take(limit)
        .value();
}

// Clear all logs
function clearLogs() {
    logDb.set('logs', []).write();
    log('INFO', 'Logs cleared', 'system');
}

// Get log statistics
function getStats() {
    const logs = logDb.get('logs').value();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const hourAgo = new Date(now - 3600000);
    
    return {
        total: logs.length,
        today: logs.filter(l => new Date(l.time) >= today).length,
        lastHour: logs.filter(l => new Date(l.time) >= hourAgo).length,
        errors: logs.filter(l => l.type === 'ERROR').length,
        warnings: logs.filter(l => l.type === 'WARNING').length,
        byType: logs.reduce((acc, l) => {
            acc[l.type] = (acc[l.type] || 0) + 1;
            return acc;
        }, {}),
        byCategory: logs.reduce((acc, l) => {
            acc[l.category] = (acc[l.category] || 0) + 1;
            return acc;
        }, {})
    };
}

module.exports = { 
    log, 
    logger, 
    getLogs, 
    clearLogs, 
    getStats,
    TYPES,
    CATEGORIES 
};
