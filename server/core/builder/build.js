// APK Builder Module

import cp from 'child_process';
import { updateProgress } from './progress.js';
import { apkToolPath, decompilePath, getOutputApk } from './path.js';

const build = (cb) => {
    const outputApk = getOutputApk();
    updateProgress('build', 'Building with apktool...');
    
    cp.exec(
        `java -jar "${apkToolPath}" b "${decompilePath}" -o "${outputApk}"`,
        { timeout: 180000 },
        (err) => {
            if (err) {
                updateProgress('build', `Failed: ${err.message}`, false, err.message);
                cb(err.message);
            } else {
                updateProgress('build', 'Built successfully', true);
                cb(null);
            }
        }
    );
};

export { build };
