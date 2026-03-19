// ESM Helper Utilities

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export const getDirname = (importMetaUrl) => {
    return dirname(fileURLToPath(importMetaUrl));
};

export const getFilename = (importMetaUrl) => {
    return fileURLToPath(importMetaUrl);
};

export const createPathHelpers = (importMetaUrl) => {
    const __filename = getFilename(importMetaUrl);
    const __dirname = dirname(__filename);
    return {
        __dirname,
        __filename,
        joinDir: (relativePath) => join(__dirname, relativePath)
    };
};
