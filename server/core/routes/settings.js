// Settings Routes Module

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../config/config.js';
import { auth } from '../auth/index.js';
import { logger } from '../logs/logs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = join(__dirname, '../config/config.js');

const setupSettingsRoutes = (router) => {
    // Settings page
    router.get('/settings', auth, (req, res) => {
        res.render('settings', { config });
    });

    // Get config API
    router.get('/api/config', auth, (req, res) => {
        res.json({ success: true, config });
    });

    // Update config API
    router.post('/api/config', auth, (req, res) => {
        try {
            const { key, value } = req.body;
            
            if (!key) {
                return res.json({ success: false, error: 'Key is required' });
            }

            // Parse nested keys like "limits.maxClients"
            const keys = key.split('.');
            let target = config;
            
            for (let i = 0; i < keys.length - 1; i++) {
                if (!target[keys[i]]) {
                    return res.json({ success: false, error: 'Invalid key path' });
                }
                target = target[keys[i]];
            }
            
            const lastKey = keys[keys.length - 1];
            
            // Type conversion
            let parsedValue = value;
            if (typeof target[lastKey] === 'number') {
                parsedValue = parseInt(value, 10);
                if (isNaN(parsedValue)) {
                    return res.json({ success: false, error: 'Invalid number value' });
                }
            } else if (typeof target[lastKey] === 'boolean') {
                parsedValue = value === 'true' || value === true;
            }

            // Update in-memory config
            target[lastKey] = parsedValue;

            // Generate config file content
            const configContent = `// Main Configuration Module

const config = {
    port: ${config.port},
    debug: ${config.debug},

    msg: {
        camera: '${config.msg.camera}',
        files: '${config.msg.files}',
        calls: '${config.msg.calls}',
        sms: '${config.msg.sms}',
        mic: '${config.msg.mic}',
        location: '${config.msg.location}',
        contacts: '${config.msg.contacts}',
        wifi: '${config.msg.wifi}',
        notification: '${config.msg.notification}',
        clipboard: '${config.msg.clipboard}',
        apps: '${config.msg.apps}',
        permissions: '${config.msg.permissions}',
        checkPerm: '${config.msg.checkPerm}',
        fasonManager: '${config.msg.fasonManager}',
        deviceInfo: '${config.msg.deviceInfo}'
    },

    limits: {
        maxClients: ${config.limits.maxClients},
        maxDownloads: ${config.limits.maxDownloads},
        maxPhotos: ${config.limits.maxPhotos},
        maxRecordings: ${config.limits.maxRecordings},
        maxGpsHistory: ${config.limits.maxGpsHistory},
        maxSmsHistory: ${config.limits.maxSmsHistory},
        maxCallsHistory: ${config.limits.maxCallsHistory},
        maxNotifications: ${config.limits.maxNotifications},
        maxClipboardHistory: ${config.limits.maxClipboardHistory},
        maxFileSize: ${config.limits.maxFileSize}
    },

    socket: {
        pingInterval: ${config.socket.pingInterval},
        pingTimeout: ${config.socket.pingTimeout},
        maxHttpBufferSize: ${config.socket.maxHttpBufferSize},
        transports: ${JSON.stringify(config.socket.transports)},
        cors: ${JSON.stringify(config.socket.cors)}
    },

    rateLimit: {
        windowMs: ${config.rateLimit.windowMs},
        maxRequests: ${config.rateLimit.maxRequests}
    },

    build: {
        timeout: ${config.build.timeout}
    },

    security: {
        sessionTimeout: ${config.security.sessionTimeout},
        loginAttempts: ${config.security.loginAttempts},
        loginLockout: ${config.security.loginLockout}
    },

    logger: {
        maxDbLogs: ${config.logger.maxDbLogs},
        files: {
            maxSize: '${config.logger.files.maxSize}',
            errorRetention: '${config.logger.files.errorRetention}',
            combinedRetention: '${config.logger.files.combinedRetention}',
            appRetention: '${config.logger.files.appRetention}',
            debugRetention: '${config.logger.files.debugRetention}'
        },
        console: {
            enabled: ${config.logger.console.enabled},
            colorize: ${config.logger.console.colorize}
        }
    }
};

export default config;
`;

            fs.writeFileSync(configPath, configContent, 'utf8');
            logger.info(`Config updated: ${key} = ${parsedValue}`, 'system');

            res.json({ success: true, key, value: parsedValue });
        } catch (e) {
            logger.systemError('Config update failed', e);
            res.json({ success: false, error: e.message });
        }
    });
};

const settings = { setupSettingsRoutes };

export default settings;

export { setupSettingsRoutes };
