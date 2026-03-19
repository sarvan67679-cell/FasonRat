// Builder Path Configuration Module

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data');

const defaultUrl = 'http://127.0.0.1:22533';
const defaultHome = 'https://google.com';

const apkToolPath = join(__dirname, '../../app/factory/apktool.jar');
const signerPath = join(__dirname, '../../app/factory/uber-apk-signer.jar');
const baseApkPath = join(__dirname, '../../app/factory/baseApp/Fason.apk');
const decompilePath = join(__dirname, '../../app/factory/decompiled');

const getProgressFile = () => join(dbPath, 'build_progress.json');
const getBuiltApkPath = () => join(dbPath, 'built_apks');
const getOutputApk = () => join(getBuiltApkPath(), 'build.apk');
const getSignedApkName = () => 'Fason.apk';
const getSignedApk = () => join(getBuiltApkPath(), getSignedApkName());

export {
    defaultUrl,
    defaultHome,
    apkToolPath,
    signerPath,
    baseApkPath,
    decompilePath,
    getProgressFile,
    getBuiltApkPath,
    getOutputApk,
    getSignedApkName,
    getSignedApk,
    dbPath
};
