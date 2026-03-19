// Mic Handlers Module

import config from '../../config/config.js';
import { logger } from '../../logs/logs.js';

const handleMic = (saveFileFn, id, data) => {
    try {
        if (data.file && data.buffer) {
            saveFileFn(id, data.name || `mic_${Date.now()}.mp4`, data.buffer, 'recordings', data.size);
        }
    } catch (e) {
        logger.systemError('Mic handler failed', e);
    }
};

const setupMicHandlers = (socket, saveFileFn, id) => {
    socket.on(config.msg.mic, (data) => {
        handleMic(saveFileFn, id, data);
    });
};

export { handleMic, setupMicHandlers };
