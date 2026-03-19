// File Handlers Module

import config from '../../config/config.js';
import { logger } from '../../logs/logs.js';

const handleFiles = (getDb, transfers, saveFileFn, id, data) => {
    const cdb = getDb(id);
    if (!cdb) return;

    try {
        if (data.type === 'list') {
            cdb.set('files', data.list || []).write();
            cdb.set('currentPath', data.path || '').write();
            logger.dataReceived(id, 'file list', data.list?.length || 0);
        } else if (data.type === 'download' && data.buffer) {
            saveFileFn(id, data.name, data.buffer, 'downloads', data.size);
        } else if (data.type === 'download_start') {
            const tid = `${id}_${data.transferId}`;
            transfers[tid] = {
                id: data.transferId,
                name: data.name,
                path: data.path || '',
                chunks: new Map(),
                receivedChunks: 0,
                totalChunks: data.totalChunks || 0,
                totalSize: data.totalSize || 0,
                startTime: Date.now()
            };
            logger.info(`File transfer started: ${data.name} from ${id}`, 'file');
        } else if (data.type === 'download_chunk') {
            const tid = `${id}_${data.transferId}`;
            const t = transfers[tid];
            if (t && t.chunks instanceof Map && !t.chunks.has(data.chunkIndex)) {
                t.chunks.set(data.chunkIndex, data.chunkData);
                t.receivedChunks++;
            }
        } else if (data.type === 'download_end') {
            const tid = `${id}_${data.transferId}`;
            const t = transfers[tid];
            if (!t) return;

            let assembled = '';
            for (let i = 0; i < (t.totalChunks || t.chunks.size); i++) {
                const chunk = t.chunks.get(i);
                if (chunk) assembled += chunk;
            }

            if (assembled.length > 0) {
                saveFileFn(id, t.name, assembled, 'downloads', t.totalSize);
            }

            delete transfers[tid];
        } else if (data.type === 'error' && data.transferId) {
            delete transfers[`${id}_${data.transferId}`];
        }
    } catch (e) {
        logger.systemError('Files handler failed', e);
    }
};

const setupFileHandlers = (socket, getDb, transfers, saveFileFn, id) => {
    socket.on(config.msg.files, (data) => {
        handleFiles(getDb, transfers, saveFileFn, id, data);
    });
};

export { handleFiles, setupFileHandlers };
