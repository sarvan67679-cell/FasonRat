// APK Decompiler Module

import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureDir } from '../utils/ensureDir.js';
import { updateProgress } from './progress.js';
import { apkToolPath, baseApkPath, decompilePath } from './path.js';

const cleanDecompiled = () => {
    try {
        if (fs.existsSync(decompilePath)) {
            fs.rmSync(decompilePath, { recursive: true, force: true });
        }
        ensureDir(decompilePath);
        return null;
    } catch (e) {
        return e.message;
    }
};

const getSmaliDirs = () => {
    if (!fs.existsSync(decompilePath)) return [];
    return fs.readdirSync(decompilePath)
        .filter(d => d.startsWith('smali'))
        .map(d => path.join(decompilePath, d));
};

const getSmaliFiles = (dir) => {
    let results = [];
    try {
        fs.readdirSync(dir).forEach(f => {
            const fp = path.join(dir, f);
            if (fs.statSync(fp).isDirectory()) {
                results = results.concat(getSmaliFiles(fp));
            } else if (f.endsWith('.smali')) {
                results.push(fp);
            }
        });
    } catch (e) {}
    return results;
};

const decompile = (cb) => {
    updateProgress('decompile', 'Cleaning...');
    const err = cleanDecompiled();
    if (err) return cb(err);

    if (!fs.existsSync(baseApkPath)) {
        return cb('Base APK not found');
    }

    updateProgress('decompile', 'Decompiling with apktool...');
    
    cp.exec(
        `java -jar "${apkToolPath}" d "${baseApkPath}" -o "${decompilePath}" -f`,
        { timeout: 120000 },
        (err) => {
            if (err) {
                updateProgress('decompile', `Failed: ${err.message}`, false, err.message);
                cb(err.message);
            } else {
                updateProgress('decompile', 'Decompiled', true);
                cb(null);
            }
        }
    );
};

export { cleanDecompiled, getSmaliDirs, getSmaliFiles, decompile };
