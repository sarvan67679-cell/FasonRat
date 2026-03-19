// Camera Handlers Module

import config from '../../config/config.js';
import { logger } from '../../logs/logs.js';

const handleCamera = (getDb, saveFileFn, id, data) => {
    const cdb = getDb(id);
    if (!cdb) return;

    try {
        if (data.camList && data.list) {
            cdb.set('cameras', data.list).write();
            cdb.set('cameraPermission', data.hasPermission).write();
            logger.dataReceived(id, 'camera list', data.list?.length || 0);
        } else if (data.image && data.buffer) {
            const ts = data.timestamp || Date.now();
            saveFileFn(id, `cam${data.cameraId}_${ts}.jpg`, data.buffer, 'photos', data.size);
        }
    } catch (e) {
        logger.systemError('Camera handler failed', e);
    }
};

const setupCameraHandlers = (socket, getDb, saveFileFn, id) => {
    socket.on(config.msg.camera, (data) => {
        handleCamera(getDb, saveFileFn, id, data);
    });
};

export { handleCamera, setupCameraHandlers };
