const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { logger } = require('../logs/logs');

// Progress file path
const progressFile = config.getProgressFile();

// Paths from config
const apkToolPath = config.build.apkToolPath;
const signerPath = config.build.signerPath;
const rawApkPath = config.build.rawApkPath;
const decompilePath = config.build.decompilePath;
const builtApkPath = config.getBuiltApkPath();
const outputApk = config.getOutputApk();
const signedApk = config.getSignedApk();

// Default URLs from config
const DEFAULT_SERVER_URL = config.build.defaultUrl;
const DEFAULT_HOME_PAGE = config.build.defaultHome;

// Ensure directories exist
if (!fs.existsSync(builtApkPath)) {
    fs.mkdirSync(builtApkPath, { recursive: true });
    logger.info('Created built_apks directory', 'build');
}

// Progress tracking
function progress(step, message, complete = false, error = null) {
    const data = {
        step,
        message,
        complete,
        error,
        time: new Date().toISOString()
    };
    
    try {
        fs.writeFileSync(progressFile, JSON.stringify(data));
    } catch (e) {
        logger.systemError('Progress write failed', e);
    }
    
    logger.buildStep(step, message);
}

function getProgress() {
    try {
        if (fs.existsSync(progressFile)) {
            return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        }
    } catch (e) {}
    return { step: 'idle', message: 'Ready', complete: false };
}

// ---------------- JAVA CHECK ----------------

function checkJava(cb) {
    progress('java', 'Checking Java installation...');
    
    const spawn = cp.spawn('java', ['-version']);
    let output = '';
    
    spawn.stderr.on('data', d => output += d.toString());
    
    spawn.on('error', () => {
        const err = 'Java not found. Install Java 8+ to build APKs';
        progress('java', err, false, err);
        cb(err);
    });
    
    spawn.on('close', (code) => {
        if (output.includes('version')) {
            const versionMatch = output.match(/version "([^"]+)"/);
            const version = versionMatch ? versionMatch[1] : 'unknown';
            progress('java', `Java ${version} detected`, true);
            cb(null);
        } else {
            const err = 'Java not detected properly';
            progress('java', err, false, err);
            cb(err);
        }
    });
}

// ---------------- CLEAN ----------------

function cleanDecompiled() {
    try {
        if (fs.existsSync(decompilePath)) {
            fs.rmSync(decompilePath, { recursive: true, force: true });
        }
        fs.mkdirSync(decompilePath, { recursive: true });
        return null;
    } catch (e) {
        return e.message;
    }
}

// ---------------- DECOMPILE ----------------

function decompile(cb) {
    progress('decompile', 'Cleaning workspace...');
    const err = cleanDecompiled();
    if (err) {
        progress('decompile', `Cleanup failed: ${err}`, false, err);
        return cb(err);
    }
    
    if (!fs.existsSync(rawApkPath)) {
        const err = 'Raw APK not found in app/factory/rawapk/';
        progress('decompile', err, false, err);
        return cb(err);
    }
    
    progress('decompile', 'Decompiling APK with apktool...');
    const cmd = `java -jar "${apkToolPath}" d "${rawApkPath}" -o "${decompilePath}" -f`;
    
    cp.exec(cmd, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
            const err = 'Decompile failed: ' + error.message;
            progress('decompile', err, false, err);
            cb(err);
        } else {
            progress('decompile', 'Decompiled successfully', true);
            cb(null);
        }
    });
}

// ---------------- PATCH ----------------

function getAllSmaliDirs() {
    if (!fs.existsSync(decompilePath)) return [];
    
    return fs.readdirSync(decompilePath)
        .filter(dir => dir.startsWith('smali'))
        .map(dir => path.join(decompilePath, dir));
}

function getAllSmaliFiles(dir) {
    let results = [];
    
    try {
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat && stat.isDirectory()) {
                results = results.concat(getAllSmaliFiles(filePath));
            } else if (file.endsWith('.smali')) {
                results.push(filePath);
            }
        });
    } catch (e) {
        logger.systemError('Failed to get smali files', e);
    }
    
    return results;
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patch(serverUrl, homePageUrl, cb) {
    progress('patch', 'Preparing URL patches...');
    
    // Ensure server URL has protocol
    let newServerUrl = serverUrl;
    if (!newServerUrl.startsWith('http://') && !newServerUrl.startsWith('https://')) {
        newServerUrl = 'http://' + newServerUrl;
    }
    
    // Default home page if not provided
    let newHomePageUrl = homePageUrl || 'https://google.com';
    if (!newHomePageUrl.startsWith('http://') && !newHomePageUrl.startsWith('https://')) {
        newHomePageUrl = 'https://' + newHomePageUrl;
    }
    
    progress('patch', `Patching URLs: Server=${newServerUrl}, Home=${newHomePageUrl}`);
    
    const smaliDirs = getAllSmaliDirs();
    let serverUrlPatched = 0;
    let homePagePatched = 0;
    let filesProcessed = 0;
    
    if (smaliDirs.length === 0) {
        const err = 'No smali directories found. APK may be corrupted.';
        progress('patch', err, false, err);
        return cb(err);
    }
    
    try {
        progress('patch', 'Scanning and patching smali files...');
        
        smaliDirs.forEach(dir => {
            const files = getAllSmaliFiles(dir);
            
            files.forEach(file => {
                let data = fs.readFileSync(file, 'utf8');
                let modified = false;
                
                // Patch 1: SERVER_HOST field definition
                const serverHostFieldRegex = /(\.field\s+[^\n]*\bSERVER_HOST:Ljava\/lang\/String;[^\n]*=\s*")[^"]*(")/g;
                if (serverHostFieldRegex.test(data)) {
                    data = data.replace(serverHostFieldRegex, `$1${newServerUrl}$2`);
                    modified = true;
                    serverUrlPatched++;
                }
                
                // Patch 2: HOME_PAGE_URL field definition
                const homePageFieldRegex = /(\.field\s+[^\n]*\bHOME_PAGE_URL:Ljava\/lang\/String;[^\n]*=\s*")[^"]*(")/g;
                if (homePageFieldRegex.test(data)) {
                    data = data.replace(homePageFieldRegex, `$1${newHomePageUrl}$2`);
                    modified = true;
                    homePagePatched++;
                }
                
                // Patch 3: const-string with default server URL
                const constStringServerRegex = new RegExp(
                    '(const-string\\s+v\\d+,\\s*")' + escapeRegex(DEFAULT_SERVER_URL) + '(")',
                    'g'
                );
                if (constStringServerRegex.test(data)) {
                    data = data.replace(constStringServerRegex, `$1${newServerUrl}$2`);
                    modified = true;
                    serverUrlPatched++;
                }
                
                // Patch 4: const-string with default home page URL
                const constStringHomeRegex = new RegExp(
                    '(const-string\\s+v\\d+,\\s*")' + escapeRegex(DEFAULT_HOME_PAGE) + '(")',
                    'g'
                );
                if (constStringHomeRegex.test(data)) {
                    data = data.replace(constStringHomeRegex, `$1${newHomePageUrl}$2`);
                    modified = true;
                    homePagePatched++;
                }
                
                // Patch 5: Catch-all for remaining references
                const genericServerUrlRegex = new RegExp(escapeRegex(DEFAULT_SERVER_URL), 'g');
                if (genericServerUrlRegex.test(data)) {
                    data = data.replace(genericServerUrlRegex, newServerUrl);
                    modified = true;
                    serverUrlPatched++;
                }
                
                const genericHomeUrlRegex = new RegExp(escapeRegex(DEFAULT_HOME_PAGE), 'g');
                if (homePageUrl && genericHomeUrlRegex.test(data)) {
                    data = data.replace(genericHomeUrlRegex, newHomePageUrl);
                    modified = true;
                    homePagePatched++;
                }
                
                if (modified) {
                    fs.writeFileSync(file, data, 'utf8');
                    filesProcessed++;
                }
            });
        });
        
        if (serverUrlPatched === 0) {
            const err = 'Could not find server URL to patch. APK may be corrupted or already patched.';
            progress('patch', err, false, err);
            return cb(err);
        }
        
        progress('patch', `Patched ${filesProcessed} files: SERVER_HOST (${serverUrlPatched}), HOME_PAGE_URL (${homePagePatched})`, true);
        cb(null);
        
    } catch (e) {
        const err = 'Patch failed: ' + e.message;
        progress('patch', err, false, err);
        cb(err);
    }
}

// ---------------- BUILD ----------------

function build(cb) {
    progress('build', 'Building APK with apktool...');
    const cmd = `java -jar "${apkToolPath}" b "${decompilePath}" -o "${outputApk}"`;
    
    cp.exec(cmd, { timeout: 180000 }, (error, stdout, stderr) => {
        if (error) {
            const err = 'Build failed: ' + error.message;
            progress('build', err, false, err);
            cb(err);
        } else {
            progress('build', 'APK built successfully', true);
            cb(null);
        }
    });
}

// ---------------- SIGN ----------------

function sign(cb) {
    progress('sign', 'Signing APK with uber-apk-signer...');
    const cmd = `java -jar "${signerPath}" --apks "${outputApk}" --overwrite`;
    
    cp.exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
            const err = 'Signing failed: ' + error.message;
            progress('sign', err, false, err);
            cb(err);
        } else {
            try {
                fs.copyFileSync(outputApk, signedApk);
                progress('sign', 'APK signed and ready for download', true);
                cb(null);
            } catch (e) {
                const err = 'Copy failed: ' + e.message;
                progress('sign', err, false, err);
                cb(err);
            }
        }
    });
}

// ---------------- CLEANUP ----------------

function cleanup() {
    progress('cleanup', 'Cleaning temporary files...');
    try {
        cleanDecompiled();
        progress('cleanup', 'Build completed successfully', true);
    } catch (e) {
        logger.systemError('Cleanup failed', e);
    }
}

// ---------------- MAIN ----------------

function buildApk(serverUrl, homePageUrl, cb) {
    if (!serverUrl) {
        const err = 'Server URL is required';
        progress('error', err, false, err);
        return cb(err);
    }
    
    // Validate URL
    let parsedUrl = serverUrl;
    if (!parsedUrl.startsWith('http://') && !parsedUrl.startsWith('https://')) {
        parsedUrl = 'http://' + parsedUrl;
    }
    
    try {
        const urlObj = new URL(parsedUrl);
        if (!urlObj.hostname) {
            const err = 'Invalid URL: no hostname specified';
            progress('error', err, false, err);
            return cb(err);
        }
    } catch (e) {
        const err = 'Invalid server URL format: ' + e.message;
        progress('error', err, false, err);
        return cb(err);
    }
    
    logger.info(`Starting APK build for ${serverUrl}`, 'build');
    
    checkJava(err => {
        if (err) return cb(err);
        
        decompile(err => {
            if (err) return cb(err);
            
            patch(serverUrl, homePageUrl, err => {
                if (err) return cb(err);
                
                build(err => {
                    if (err) return cb(err);
                    
                    sign(err => {
                        if (err) return cb(err);
                        
                        cleanup();
                        progress('done', 'APK ready for download!', true);
                        logger.success(`APK build completed for ${serverUrl}`, 'build');
                        cb(null);
                    });
                });
            });
        });
    });
}

module.exports = { buildApk, getProgress, signedApk };
