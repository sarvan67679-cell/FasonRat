const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const config = require('../config/config');

// Log database
const logDb = low(new FileSync(path.join(config.dbPath, 'logs.json')));
logDb.defaults({ logs: [], stats: { total: 0, cleared: 0 } }).write();

// Max logs to keep
const MAX_LOGS = 10000;

// Log types
const TYPES = {
    INFO: { color: '#3b82f6', icon: 'ℹ' },
    SUCCESS: { color: '#22c55e', icon: '✓' },
    ERROR: { color: '#ef4444', icon: '✕' },
    WARNING: { color: '#f59e0b', icon: '⚠' },
    CONNECTION: { color: '#8b5cf6', icon: '🔗' },
    DISCONNECTION: { color: '#f97316', icon: '⏏' },
    COMMAND: { color: '#06b6d4', icon: '→' },
    DATA: { color: '#10b981', icon: '↓' },
    BUILD: { color: '#a855f7', icon: '⚙' },
    AUTH: { color: '#ec4899', icon: '🔐' },
    FILE: { color: '#6366f1', icon: '📁' },
    HTTP: { color: '#64748b', icon: '🌐' }
};

// Add log entry
const log = (type, message, category = 'system', details = null) => {
    try {
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            time: new Date().toISOString(),
            timestamp: Date.now(),
            type: (typeof type === 'string' ? type : 'INFO').toUpperCase(),
            category,
            message,
            details: details ? (typeof details === 'object' ? details : { value: details }) : null
        };

        logDb.get('logs').push(entry).write();
        logDb.update('stats.total', n => (n || 0) + 1).write();

        // Trim old logs
        const count = logDb.get('logs').size().value();
        if (count > MAX_LOGS) {
            logDb.get('logs').drop(count - MAX_LOGS).write();
        }

        // Console output
        const typeInfo = TYPES[entry.type] || TYPES.INFO;
        console.log(`[${new Date().toLocaleTimeString()}] ${typeInfo.icon} [${entry.type}] [${category}] ${message}`);

        return entry;
    } catch (e) {
        console.error('Logger error:', e);
        return null;
    }
};

// Logger convenience methods
const logger = {
    info: (msg, cat = 'system', det = null) => log('INFO', msg, cat, det),
    success: (msg, cat = 'system', det = null) => log('SUCCESS', msg, cat, det),
    error: (msg, cat = 'error', det = null) => log('ERROR', msg, cat, det),
    warning: (msg, cat = 'system', det = null) => log('WARNING', msg, cat, det),
    systemError: (ctx, err) => log('ERROR', `${ctx}: ${err?.message || err}`, 'error', { context: ctx, error: err?.message, stack: err?.stack }),

    clientConnected: (id, ip, device) => log('CONNECTION', `Client ${id} connected`, 'client', { id, ip, device }),
    clientDisconnected: (id, reason = '') => log('DISCONNECTION', `Client ${id} disconnected`, 'client', { id, reason }),

    commandSent: (id, cmd, params = {}) => log('COMMAND', `→ ${id}: ${cmd}`, 'client', { id, cmd, params }),
    commandQueued: (id, cmd) => log('COMMAND', `⏳ ${id}: ${cmd} (queued)`, 'client', { id, cmd }),
    commandFailed: (id, cmd, error) => log('ERROR', `✕ ${id}: ${cmd} failed`, 'client', { id, cmd, error }),

    dataReceived: (id, type, count = null) => log('DATA', `↓ ${id}: ${type}${count !== null ? ` (${count})` : ''}`, 'data', { id, type, count }),

    fileSaved: (id, name, type) => log('FILE', `Saved ${type} "${name}" from ${id}`, 'file', { id, name, type }),
    fileSaveFailed: (id, name, error) => log('ERROR', `Failed "${name}" from ${id}`, 'file', { id, name, error }),

    loginSuccess: (ip) => log('AUTH', `✓ Login from ${ip}`, 'auth', { ip, success: true }),
    loginFailed: (ip) => log('WARNING', `✕ Failed login from ${ip}`, 'auth', { ip, success: false }),
    logout: (ip, username = null) => log('AUTH', `Logout ${username || ''} from ${ip}`, 'auth', { ip, username }),

    buildStart: (url) => log('BUILD', 'Starting build...', 'build', { url }),
    buildStep: (step, msg) => log('BUILD', `[${step}] ${msg}`, 'build', { step }),
    buildSuccess: (url) => log('SUCCESS', 'Build complete', 'build', { url }),
    buildFailed: (error) => log('ERROR', `Build failed: ${error}`, 'build', { error })
};

// Get logs with filtering
const getLogs = (options = {}) => {
    try {
        const { limit = 100, type, category, search, since } = options;
        let query = logDb.get('logs');

        if (type && type !== 'all') query = query.filter(l => l.type === type.toUpperCase());
        if (category && category !== 'all') query = query.filter(l => l.category === category);
        if (search) {
            const s = search.toLowerCase();
            query = query.filter(l =>
                l.message.toLowerCase().includes(s) ||
                (l.details && JSON.stringify(l.details).toLowerCase().includes(s))
            );
        }
        if (since) {
            const t = new Date(since).getTime();
            query = query.filter(l => l.timestamp >= t);
        }

        return query.sortBy('timestamp').reverse().take(Math.min(limit, 1000)).value();
    } catch (e) {
        return [];
    }
};

// Clear all logs
const clearLogs = () => {
    const count = logDb.get('logs').size().value();
    logDb.set('logs', []).write();
    logDb.update('stats.cleared', n => (n || 0) + count).write();
    log('INFO', `Logs cleared (${count} entries)`, 'system');
    return count;
};

// Get log statistics
const getStats = () => {
    try {
        const logs = logDb.get('logs').value();
        const now = Date.now();

        return {
            total: logs.length,
            today: logs.filter(l => l.timestamp >= new Date().setHours(0, 0, 0, 0)).length,
            lastHour: logs.filter(l => l.timestamp >= now - 3600000).length,
            lastDay: logs.filter(l => l.timestamp >= now - 86400000).length,
            lastWeek: logs.filter(l => l.timestamp >= now - 604800000).length,
            errors: logs.filter(l => l.type === 'ERROR').length,
            warnings: logs.filter(l => l.type === 'WARNING').length,
            connections: logs.filter(l => l.type === 'CONNECTION').length,
            disconnections: logs.filter(l => l.type === 'DISCONNECTION').length,
            byType: logs.reduce((acc, l) => { acc[l.type] = (acc[l.type] || 0) + 1; return acc; }, {}),
            byCategory: logs.reduce((acc, l) => { acc[l.category] = (acc[l.category] || 0) + 1; return acc; }, {})
        };
    } catch (e) {
        return { total: 0, today: 0, lastHour: 0, errors: 0, warnings: 0 };
    }
};

module.exports = { log, logger, getLogs, clearLogs, getStats, TYPES };
