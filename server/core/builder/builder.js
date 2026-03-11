const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { logger } = require('../logs/logs');
const { ensureDir } = require('../utils/ensureDir');

// Paths
const { apkToolPath, signerPath, baseApkPath, decompilePath, defaultUrl, defaultHome } = config.build;
const builtApkPath = config.getBuiltApkPath();
const outputApk = config.getOutputApk();
const signedApk = config.getSignedApk();
const progressFile = config.getProgressFile();

// Ensure output directory
ensureDir(builtApkPath);

// Update progress
const progress = (step, message, complete = false, error = null) => {
    const data = { step, message, complete, error, time: new Date().toISOString() };
    try { fs.writeFileSync(progressFile, JSON.stringify(data)); } catch (e) {}
    logger.buildStep(step, message);
};

// Get progress
const getProgress = () => {
    try {
        if (fs.existsSync(progressFile)) {
            return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        }
    } catch (e) {}
    return { step: 'idle', message: 'Ready', complete: false };
};

// Check Java
const checkJava = (cb) => {
    progress('java', 'Checking Java...');

    const proc = cp.spawn('java', ['-version']);
    let output = '';

    proc.stderr.on('data', d => output += d.toString());

    proc.on('error', () => {
        const err = 'Java not found. Install Java 8+';
        progress('java', err, false, err);
        cb(err);
    });

    proc.on('close', () => {
        if (output.includes('version')) {
            const match = output.match(/version "([^"]+)"/);
            progress('java', `Java ${match ? match[1] : 'detected'}`, true);
            cb(null);
        } else {
            const err = 'Java not detected';
            progress('java', err, false, err);
            cb(err);
        }
    });
};

// Clean decompiled directory
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

// Decompile APK
const decompile = (cb) => {
    progress('decompile', 'Cleaning...');
    const err = cleanDecompiled();
    if (err) return cb(err);

    if (!fs.existsSync(baseApkPath)) {
        return cb('Base APK not found');
    }

    progress('decompile', 'Decompiling with apktool...');
    cp.exec(`java -jar "${apkToolPath}" d "${baseApkPath}" -o "${decompilePath}" -f`, { timeout: 120000 }, (err) => {
        if (err) {
            progress('decompile', `Failed: ${err.message}`, false, err.message);
            cb(err.message);
        } else {
            progress('decompile', 'Decompiled', true);
            cb(null);
        }
    });
};

// Get smali directories
const getSmaliDirs = () => {
    if (!fs.existsSync(decompilePath)) return [];
    return fs.readdirSync(decompilePath)
        .filter(d => d.startsWith('smali'))
        .map(d => path.join(decompilePath, d));
};

// Get smali files recursively
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

// Escape regex
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Patch URLs
const patch = (serverUrl, homePageUrl, cb) => {
    progress('patch', 'Patching URLs...');

    // Normalize URLs
    let newServer = serverUrl;
    if (!newServer.startsWith('http')) newServer = 'http://' + newServer;

    let newHome = homePageUrl || 'https://google.com';
    if (!newHome.startsWith('http')) newHome = 'https://' + newHome;

    const dirs = getSmaliDirs();
    if (dirs.length === 0) {
        return cb('No smali directories found');
    }

    let serverPatched = 0;
    let homePatched = 0;

    try {
        dirs.forEach(dir => {
            getSmaliFiles(dir).forEach(file => {
                let data = fs.readFileSync(file, 'utf8');
                let modified = false;

                // Patch SERVER_HOST field
                const serverField = /\.field\s+[^\n]*\bSERVER_HOST:Ljava\/lang\/String;[^\n]*=\s*"[^"]*"/g;
                if (serverField.test(data)) {
                    data = data.replace(serverField, (m) => m.replace(/"[^"]*"/, `"${newServer}"`));
                    modified = true;
                    serverPatched++;
                }

                // Patch HOME_PAGE_URL field
                const homeField = /\.field\s+[^\n]*\bHOME_PAGE_URL:Ljava\/lang\/String;[^\n]*=\s*"[^"]*"/g;
                if (homeField.test(data)) {
                    data = data.replace(homeField, (m) => m.replace(/"[^"]*"/, `"${newHome}"`));
                    modified = true;
                    homePatched++;
                }

                // Patch const-string server URL
                const serverRegex = new RegExp(`(const-string\\s+v\\d+,\\s*")${escapeRegex(defaultUrl)}(")`, 'g');
                if (serverRegex.test(data)) {
                    data = data.replace(serverRegex, `$1${newServer}$2`);
                    modified = true;
                    serverPatched++;
                }

                // Patch const-string home URL
                const homeRegex = new RegExp(`(const-string\\s+v\\d+,\\s*")${escapeRegex(defaultHome)}(")`, 'g');
                if (homeRegex.test(data)) {
                    data = data.replace(homeRegex, `$1${newHome}$2`);
                    modified = true;
                    homePatched++;
                }

                // Generic replacements
                const genServer = new RegExp(escapeRegex(defaultUrl), 'g');
                if (genServer.test(data)) {
                    data = data.replace(genServer, newServer);
                    modified = true;
                    serverPatched++;
                }

                if (homePageUrl) {
                    const genHome = new RegExp(escapeRegex(defaultHome), 'g');
                    if (genHome.test(data)) {
                        data = data.replace(genHome, newHome);
                        modified = true;
                        homePatched++;
                    }
                }

                if (modified) fs.writeFileSync(file, data, 'utf8');
            });
        });

        if (serverPatched === 0) {
            return cb('Could not find server URL to patch');
        }

        progress('patch', `Patched: SERVER(${serverPatched}) HOME(${homePatched})`, true);
        cb(null);
    } catch (e) {
        cb(`Patch failed: ${e.message}`);
    }
};

// Build APK
const build = (cb) => {
    progress('build', 'Building with apktool...');
    cp.exec(`java -jar "${apkToolPath}" b "${decompilePath}" -o "${outputApk}"`, { timeout: 180000 }, (err) => {
        if (err) {
            progress('build', `Failed: ${err.message}`, false, err.message);
            cb(err.message);
        } else {
            progress('build', 'Built successfully', true);
            cb(null);
        }
    });
};

// Sign APK
const sign = (cb) => {
    progress('sign', 'Signing APK...');
    cp.exec(`java -jar "${signerPath}" --apks "${outputApk}" --overwrite`, { timeout: 60000 }, (err) => {
        if (err) {
            progress('sign', `Failed: ${err.message}`, false, err.message);
            cb(err.message);
        } else {
            try {
                fs.copyFileSync(outputApk, signedApk);
                progress('sign', 'Signed and ready', true);
                cb(null);
            } catch (e) {
                cb(`Copy failed: ${e.message}`);
            }
        }
    });
};

// Cleanup
const cleanup = () => {
    progress('cleanup', 'Cleaning...');
    cleanDecompiled();
    progress('done', 'APK ready for download!', true);
};

// Main build function
const buildApk = (serverUrl, homePageUrl, cb) => {
    if (!serverUrl) return cb('Server URL required');

    // Validate URL
    let url = serverUrl;
    if (!url.startsWith('http')) url = 'http://' + url;
    try {
        const parsed = new URL(url);
        if (!parsed.hostname) return cb('Invalid URL');
    } catch (e) {
        return cb('Invalid URL format');
    }

    logger.info(`Building APK for ${serverUrl}`, 'build');

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
                        logger.success(`APK built for ${serverUrl}`, 'build');
                        cb(null);
                    });
                });
            });
        });
    });
};

module.exports = { buildApk, getProgress, signedApk };
