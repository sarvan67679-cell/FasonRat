// Static Routes Module

import express from 'express';
import { downloadsPath, photosPath, recordingsPath } from '../database/path.js';

const setupStaticRoutes = (router) => {
    router.use('/downloads', express.static(downloadsPath));
    router.use('/photos', express.static(photosPath));
    router.use('/recordings', express.static(recordingsPath));
};

const staticFiles = { setupStaticRoutes };

export default staticFiles;

export { setupStaticRoutes };
