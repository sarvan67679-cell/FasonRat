// Builder Routes Module

import fs from 'fs';
import multer from 'multer';
import builderModule from '../builder/index.js';
import { auth } from '../auth/index.js';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

const setupBuilderRoutes = (router) => {
    router.get('/builder', auth, (req, res) => {
        res.render('builder');
    });

    router.post('/builder', auth, upload.single('appIcon'), (req, res) => {
        const { serverUrl, homePageUrl, appName } = req.body;

        if (!serverUrl) {
            return res.json({ error: 'Server URL is required' });
        }

        try {
            new URL(serverUrl.startsWith('http') ? serverUrl : `http://${serverUrl}`);
        } catch (e) {
            return res.json({ error: 'Invalid server URL' });
        }

        const options = {
            appName: appName || null,
            appIcon: req.file ? req.file.buffer : null
        };

        builderModule.buildApk(serverUrl, homePageUrl, options, (err) => {
            if (err) {
                res.json({ error: err });
            } else {
                res.json({ success: true });
            }
        });
    });

    router.get('/builder/progress', auth, (req, res) => {
        res.json({ progress: builderModule.getProgress() });
    });

    router.get('/Fason.apk', (req, res) => {
        if (fs.existsSync(builderModule.signedApk)) {
            res.download(builderModule.signedApk, 'Fason.apk');
        } else {
            res.status(404).json({ error: 'APK not found. Build one first.' });
        }
    });
};

const builder = { setupBuilderRoutes };

export default builder;

export { setupBuilderRoutes };
