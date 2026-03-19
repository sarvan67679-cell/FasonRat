// Handlers Index Module

import * as dataHandlers from './data.js';
import * as fileHandlers from './files.js';
import * as cameraHandlers from './camera.js';
import * as micHandlers from './mic.js';

const setupAllHandlers = (socket, cdb, id, getDb, transfers, saveFileFn, disconnectHandler) => {
    dataHandlers.setupDataHandlers(socket, cdb, id, disconnectHandler);
    fileHandlers.setupFileHandlers(socket, getDb, transfers, saveFileFn, id);
    cameraHandlers.setupCameraHandlers(socket, getDb, saveFileFn, id);
    micHandlers.setupMicHandlers(socket, saveFileFn, id);
};

const handlers = {
    setupAllHandlers,
    dataHandlers,
    fileHandlers,
    cameraHandlers,
    micHandlers
};

export default handlers;

export {
    setupAllHandlers,
    dataHandlers,
    fileHandlers,
    cameraHandlers,
    micHandlers
};
