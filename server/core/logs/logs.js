// Winston Logger Module

import path from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import low from 'lowdb';
import FileSync from 'lowdb/adapters/FileSync.js';
import config from '../config/config.js';
import fs from 'fs';
import { dbPath } from '../database/path.js';

const logsDir = path.join(dbPath, 'log-files');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logDb = low(new FileSync(path.join(dbPath, 'logs.json')));
logDb.defaults({ logs: [], stats: { total: 0, cleared: 0 } }).write();

const MAX_DB_LOGS = 10000;

const LOG_TYPES = {
    INFO: { color: '#3b82f6', icon: 'ℹ', level: 'info' },
    SUCCESS: { color: '#22c55e', icon: '✓', level: 'info' },
    ERROR: { color: '#ef4444', icon: '✕', level: 'error' },
    WARNING: { color: '#f59e0b', icon: '⚠', level: 'warn' },
    CONNECTION: { color: '#8b5cf6', icon: '🔗', level: 'info' },
    DISCONNECTION: { color: '#f97316', icon: '⏏', level: 'info' },
    COMMAND: { color: '#06b6d4', icon: '→', level: 'debug' },
    DATA: { color: '#10b981', icon: '↓', level: 'debug' },
    BUILD: { color: '#a855f7', icon: '⚙', level: 'info' },
    AUTH: { color: '#ec4899', icon: '🔐', level: 'info' },
    FILE: { color: '#6366f1', icon: '📁', level: 'debug' },
    HTTP: { color: '#64748b', icon: '🌐', level: 'debug' },
    DEBUG: { color: '#94a3b8', icon: '⚑', level: 'debug' }
};

const getWinstonLevel = (type) => {
    const typeInfo = LOG_TYPES[type?.toUpperCase()] || LOG_TYPES.INFO;
    return typeInfo.level;
};

const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, type, category, details }) => {
        const typeInfo = LOG_TYPES[type?.toUpperCase()] || LOG_TYPES.INFO;
        const icon = typeInfo.icon;
        const typeStr = type?.toUpperCase() || 'INFO';
        const catStr = category || 'system';
        let output = `[${timestamp}] ${icon} [${typeStr}] [${catStr}] ${message}`;
        if (details && Object.keys(details).length > 0) {
            output += ` | ${JSON.stringify(details)}`;
        }
        return output;
    }),
    winston.format.colorize({ all: true })
);

const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

const winstonLogger = winston.createLogger({
    levels: winston.config.npm.levels,
    level: config.debug ? 'debug' : 'info',
    transports: [
        new winston.transports.Console({
            format: consoleFormat,
            handleExceptions: true,
            handleRejections: true
        }),
        new DailyRotateFile({
            filename: path.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            format: fileFormat,
            maxSize: '20m',
            maxFiles: '30d',
            handleExceptions: true,
            handleRejections: true
        }),
        new DailyRotateFile({
            filename: path.join(logsDir, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            format: fileFormat,
            maxSize: '20m',
            maxFiles: '14d'
        }),
        new DailyRotateFile({
            filename: path.join(logsDir, 'app-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'info',
            format: fileFormat,
            maxSize: '20m',
            maxFiles: '7d'
        })
    ],
    exitOnError: false
});

if (config.debug) {
    winstonLogger.add(new DailyRotateFile({
        filename: path.join(logsDir, 'debug-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'debug',
        format: fileFormat,
        maxSize: '50m',
        maxFiles: '3d'
    }));
}

const log = (type, message, category = 'system', details = null) => {
    try {
        const typeUpper = (typeof type === 'string' ? type : 'INFO').toUpperCase();
        const entry = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            time: new Date().toISOString(),
            timestamp: Date.now(),
            type: typeUpper,
            category,
            message,
            details: details ? (typeof details === 'object' ? details : { value: details }) : null
        };

        logDb.get('logs').push(entry).write();
        logDb.update('stats.total', n => (n || 0) + 1).write();

        const count = logDb.get('logs').size().value();
        if (count > MAX_DB_LOGS) {
            logDb.get('logs').drop(count - MAX_DB_LOGS).write();
        }

        const winstonLevel = getWinstonLevel(typeUpper);
        winstonLogger.log({
            level: winstonLevel,
            message,
            type: typeUpper,
            category,
            details: entry.details,
            timestamp: entry.time
        });

        return entry;
    } catch (e) {
        console.error('Logger error:', e);
        return null;
    }
};

const logger = {
    info: (msg, cat = 'system', det = null) => log('INFO', msg, cat, det),
    success: (msg, cat = 'system', det = null) => log('SUCCESS', msg, cat, det),
    error: (msg, cat = 'error', det = null) => log('ERROR', msg, cat, det),
    warning: (msg, cat = 'system', det = null) => log('WARNING', msg, cat, det),
    debug: (msg, cat = 'debug', det = null) => log('DEBUG', msg, cat, det),

    systemError: (ctx, err) => log('ERROR', `${ctx}: ${err?.message || err}`, 'error', {
        context: ctx,
        error: err?.message,
        stack: err?.stack
    }),

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
    buildFailed: (error) => log('ERROR', `Build failed: ${error}`, 'build', { error }),

    http: (method, path, status, ip) => log('HTTP', `${method} ${path} ${status}`, 'http', { method, path, status, ip }),

    event: (eventType, message, data = null) => log(eventType.toUpperCase(), message, eventType.toLowerCase(), data)
};

const getLogs = (options = {}) => {
    try {
        const { limit = 100, type, category, search, since, until } = options;
        let query = logDb.get('logs');

        if (type && type !== 'all') {
            query = query.filter(l => l.type === type.toUpperCase());
        }
        if (category && category !== 'all') {
            query = query.filter(l => l.category === category);
        }
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
        if (until) {
            const t = new Date(until).getTime();
            query = query.filter(l => l.timestamp <= t);
        }

        return query.sortBy('timestamp').reverse().take(Math.min(limit, 1000)).value();
    } catch (e) {
        console.error('Get logs error:', e);
        return [];
    }
};

const clearLogs = () => {
    const count = logDb.get('logs').size().value();
    logDb.set('logs', []).write();
    logDb.update('stats.cleared', n => (n || 0) + count).write();
    log('INFO', `Logs cleared (${count} entries)`, 'system');
    return count;
};

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
        console.error('Get stats error:', e);
        return { total: 0, today: 0, lastHour: 0, errors: 0, warnings: 0 };
    }
};

const getWinstonLogger = () => winstonLogger;

const createLogger = (context) => ({
    info: (msg, det = null) => logger.info(msg, context, det),
    success: (msg, det = null) => logger.success(msg, context, det),
    error: (msg, det = null) => logger.error(msg, context, det),
    warning: (msg, det = null) => logger.warning(msg, context, det),
    debug: (msg, det = null) => logger.debug(msg, context, det)
});

export {
    log,
    logger,
    getLogs,
    clearLogs,
    getStats,
    getWinstonLogger,
    createLogger,
    LOG_TYPES as TYPES
};
