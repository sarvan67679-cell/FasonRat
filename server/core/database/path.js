// Database Path Configuration Module

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data');

const downloadsPath = join(__dirname, '../../data/clients/downloads');
const photosPath = join(__dirname, '../../data/clients/photos');
const recordingsPath = join(__dirname, '../../data/clients/recordings');

const clientsDir = () => join(dbPath, 'clients');
const backupsDir = () => join(dbPath, 'backups');
const mainDb = () => join(dbPath, 'main.json');
const logsDb = () => join(dbPath, 'logs.json');
const clientDb = (id) => join(dbPath, 'clients', `${id}.json`);

export {
    dbPath,
    downloadsPath,
    photosPath,
    recordingsPath,
    clientsDir,
    backupsDir,
    mainDb,
    logsDb,
    clientDb
};
