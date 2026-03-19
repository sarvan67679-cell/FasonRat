// Builder Module Index

import { ensureDir } from '../utils/ensureDir.js';
import { getProgress, updateProgress } from './progress.js';
import { checkJava } from './java.js';
import { decompile, cleanDecompiled } from './decompile.js';
import { patch } from './patch.js';
import { build } from './build.js';
import { sign, getSignedApkPath } from './sign.js';
import { getBuiltApkPath } from './path.js';
import { logger } from '../logs/logs.js';

ensureDir(getBuiltApkPath());

const signedApk = getSignedApkPath();

const cleanup = () => {
    updateProgress('cleanup', 'Cleaning...');
    cleanDecompiled();
    updateProgress('done', 'APK ready for download!', true);
};

const buildApk = (serverUrl, homePageUrl, options, cb) => {
    if (typeof options === 'function') {
        cb = options;
        options = {};
    }

    if (!serverUrl) return cb('Server URL required');

    let url = serverUrl;
    if (!url.startsWith('http')) url = 'http://' + url;
    try {
        const parsed = new URL(url);
        if (!parsed.hostname) return cb('Invalid URL');
    } catch (e) {
        return cb('Invalid URL format');
    }

    logger.buildStart(serverUrl);

    checkJava(err => {
        if (err) return cb(err);
        
        decompile(err => {
            if (err) return cb(err);
            
            patch(serverUrl, homePageUrl, options, err => {
                if (err) return cb(err);
                
                build(err => {
                    if (err) return cb(err);
                    
                    sign(err => {
                        if (err) return cb(err);
                        
                        cleanup();
                        logger.buildSuccess(serverUrl);
                        cb(null);
                    });
                });
            });
        });
    });
};

const builder = { buildApk, getProgress, signedApk };

export default builder;

export { buildApk, getProgress, signedApk };
