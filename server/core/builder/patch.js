// APK Patcher Module

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { ensureDir } from '../utils/ensureDir.js';
import { updateProgress } from './progress.js';
import { getSmaliDirs, getSmaliFiles } from './decompile.js';
import { defaultUrl, defaultHome, decompilePath } from './path.js';
import { logger } from '../logs/logs.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeXml = (s) => {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, "&apos;");
};

const ICON_DENSITIES = [
    { name: 'mipmap-mdpi', size: 48 },
    { name: 'mipmap-hdpi', size: 72 },
    { name: 'mipmap-xhdpi', size: 96 },
    { name: 'mipmap-xxhdpi', size: 144 },
    { name: 'mipmap-xxxhdpi', size: 192 }
];

const ADAPTIVE_SIZES = [
    { name: 'drawable-mdpi', size: 108 },
    { name: 'drawable-hdpi', size: 162 },
    { name: 'drawable-xhdpi', size: 216 },
    { name: 'drawable-xxhdpi', size: 324 },
    { name: 'drawable-xxxhdpi', size: 432 }
];

const patchAppName = (appName) => {
    if (!appName) return false;
    
    const stringsPath = path.join(decompilePath, 'res', 'values', 'strings.xml');
    if (!fs.existsSync(stringsPath)) {
        logger.warning('strings.xml not found for app name patching', 'build');
        return false;
    }
    
    try {
        let content = fs.readFileSync(stringsPath, 'utf8');
        const escapedName = escapeXml(appName);
        
        const appNamePattern = /<string\s+name="app_name">[^<]*<\/string>/g;
        if (appNamePattern.test(content)) {
            content = content.replace(appNamePattern, `<string name="app_name">${escapedName}</string>`);
        }
        
        fs.writeFileSync(stringsPath, content, 'utf8');
        logger.buildStep('patch', `App name patched to: ${appName}`);
        return true;
    } catch (e) {
        logger.buildFailed(`App name patch: ${e.message}`);
        return false;
    }
};

const patchAppIcon = async (iconBuffer) => {
    if (!iconBuffer) return false;
    
    const resPath = path.join(decompilePath, 'res');
    if (!fs.existsSync(resPath)) {
        logger.warning('res directory not found for icon patching', 'build');
        return false;
    }
    
    try {
        logger.buildStep('patch', 'Processing app icon...');
        
        for (const density of ICON_DENSITIES) {
            const mipmapDir = path.join(resPath, density.name);
            ensureDir(mipmapDir);
            
            const iconPath = path.join(mipmapDir, 'ic_launcher.png');
            await sharp(iconBuffer)
                .resize(density.size, density.size, { fit: 'cover', position: 'center' })
                .png()
                .toFile(iconPath);
            
            const roundIconPath = path.join(mipmapDir, 'ic_launcher_round.png');
            await sharp(iconBuffer)
                .resize(density.size, density.size, { fit: 'cover', position: 'center' })
                .png()
                .toFile(roundIconPath);
        }
        
        for (const density of ADAPTIVE_SIZES) {
            const drawableDir = path.join(resPath, density.name);
            ensureDir(drawableDir);
            
            const iconSize = Math.round(density.size * 72 / 108);
            
            const resizedIcon = await sharp(iconBuffer)
                .resize(iconSize, iconSize, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .toBuffer();
            
            const foregroundPath = path.join(drawableDir, 'ic_launcher_foreground.png');
            await sharp({
                create: {
                    width: density.size,
                    height: density.size,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                }
            })
                .composite([{ input: resizedIcon, gravity: 'center' }])
                .png()
                .toFile(foregroundPath);
            
            const backgroundPath = path.join(drawableDir, 'ic_launcher_background.png');
            await sharp({
                create: {
                    width: density.size,
                    height: density.size,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                }
            })
                .png()
                .toFile(backgroundPath);
        }
        
        const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>`;
        
        const adaptiveIconPath = path.join(resPath, 'mipmap-anydpi-v26', 'ic_launcher.xml');
        if (fs.existsSync(adaptiveIconPath)) {
            fs.writeFileSync(adaptiveIconPath, adaptiveIconXml, 'utf8');
        }
        
        const roundIconPath = path.join(resPath, 'mipmap-anydpi-v26', 'ic_launcher_round.xml');
        if (fs.existsSync(roundIconPath)) {
            fs.writeFileSync(roundIconPath, adaptiveIconXml, 'utf8');
        }
        
        logger.buildStep('patch', 'App icon patched successfully');
        return true;
    } catch (e) {
        logger.buildFailed(`App icon patch: ${e.message}`);
        return false;
    }
};

const patch = async (serverUrl, homePageUrl, options, cb) => {
    updateProgress('patch', 'Patching URLs...');

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

                const serverField = /\.field\s+[^\n]*\bSERVER_HOST:Ljava\/lang\/String;[^\n]*=\s*"[^"]*"/g;
                if (serverField.test(data)) {
                    data = data.replace(serverField, (m) => m.replace(/"[^"]*"/, `"${newServer}"`));
                    modified = true;
                    serverPatched++;
                }

                const homeField = /\.field\s+[^\n]*\bHOME_PAGE_URL:Ljava\/lang\/String;[^\n]*=\s*"[^"]*"/g;
                if (homeField.test(data)) {
                    data = data.replace(homeField, (m) => m.replace(/"[^"]*"/, `"${newHome}"`));
                    modified = true;
                    homePatched++;
                }

                const serverRegex = new RegExp(`(const-string\\s+v\\d+,\\s*")${escapeRegex(defaultUrl)}(")`, 'g');
                if (serverRegex.test(data)) {
                    data = data.replace(serverRegex, `$1${newServer}$2`);
                    modified = true;
                    serverPatched++;
                }

                const homeRegex = new RegExp(`(const-string\\s+v\\d+,\\s*")${escapeRegex(defaultHome)}(")`, 'g');
                if (homeRegex.test(data)) {
                    data = data.replace(homeRegex, `$1${newHome}$2`);
                    modified = true;
                    homePatched++;
                }

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

        let appPatched = false;
        if (options && options.appName) {
            appPatched = patchAppName(options.appName);
        }

        let iconPatched = false;
        if (options && options.appIcon) {
            iconPatched = await patchAppIcon(options.appIcon);
        }

        const patchSummary = `Patched: SERVER(${serverPatched}) HOME(${homePatched})${appPatched ? ' APP_NAME' : ''}${iconPatched ? ' APP_ICON' : ''}`;
        updateProgress('patch', patchSummary, true);
        cb(null);
    } catch (e) {
        cb(`Patch failed: ${e.message}`);
    }
};

export { patch };
