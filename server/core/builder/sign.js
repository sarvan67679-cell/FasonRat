// APK Signer Module

import cp from 'child_process';
import fs from 'fs';
import { updateProgress } from './progress.js';
import { signerPath, getOutputApk, getSignedApk } from './path.js';

const sign = (cb) => {
    const outputApk = getOutputApk();
    const signedApk = getSignedApk();
    
    updateProgress('sign', 'Signing APK...');
    
    cp.exec(
        `java -jar "${signerPath}" --apks "${outputApk}" --overwrite`,
        { timeout: 60000 },
        (err) => {
            if (err) {
                updateProgress('sign', `Failed: ${err.message}`, false, err.message);
                cb(err.message);
            } else {
                try {
                    fs.copyFileSync(outputApk, signedApk);
                    updateProgress('sign', 'Signed and ready', true);
                    cb(null);
                } catch (e) {
                    cb(`Copy failed: ${e.message}`);
                }
            }
        }
    );
};

const getSignedApkPath = () => getSignedApk();

export { sign, getSignedApkPath };
