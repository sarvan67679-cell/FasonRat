// Main Configuration Module

const config = {
    port: 22533,
    debug: false,

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

    socket: {
        pingInterval: 25000,
        pingTimeout: 60000,
        maxHttpBufferSize: 50e6,
        transports: ['websocket', 'polling'],
        cors: { origin: '*', methods: ['GET', 'POST'] }
    },

    rateLimit: {
        windowMs: 60000,
        maxRequests: 100
    },

    build: {
        timeout: 600000
    },

    security: {
        sessionTimeout: 24 * 60 * 60 * 1000,
        loginAttempts: 5,
        loginLockout: 15 * 60 * 1000
    },

    logger: {
        maxDbLogs: 10000,
        files: {
            maxSize: '20m',
            errorRetention: '30d',
            combinedRetention: '14d',
            appRetention: '7d',
            debugRetention: '3d'
        },
        console: {
            enabled: true,
            colorize: true
        }
    }
};

export default config;
