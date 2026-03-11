const { Server } = require('socket.io');
const qs = require('querystring');
const geoip = require('geoip-lite');
const clients = require('../clients/clients');
const { logger } = require('../logs/logs');
const config = require('../config/config');

// Initialize Socket.IO server
module.exports = (server) => {
    const io = new Server(server, {
        transports: config.socket.transports,
        pingInterval: config.socket.pingInterval,
        pingTimeout: config.socket.pingTimeout,
        maxHttpBufferSize: config.socket.maxHttpBufferSize,
        cors: config.socket.cors
    });

    logger.info('Socket.IO server initialized');

    // Auth middleware
    io.use((socket, next) => {
        try {
            const params = typeof socket.handshake.query === 'string'
                ? qs.parse(socket.handshake.query)
                : socket.handshake.query;

            if (!params.id) {
                logger.warning('Connection rejected: no ID', 'client');
                return next(new Error('ID required'));
            }

            socket.fasonParams = params;
            next();
        } catch (e) {
            logger.systemError('Socket auth failed', e);
            next(e);
        }
    });

    // Handle connections
    io.on('connection', (socket) => {
        try {
            const params = socket.fasonParams || socket.handshake.query;

            // Determine client IP
            let ip = '';
            const forwarded = socket.handshake.headers['x-forwarded-for'];
            if (forwarded) ip = forwarded.split(',')[0].trim(); // proxy IP
            if (!ip) {
                let remoteAddr = socket.request.connection.remoteAddress || '';
                ip = remoteAddr.replace(/^::ffff:/, ''); // IPv6 prefix
                if (ip === '::1') ip = '127.0.0.1'; // localhost
                if (ip.includes(':') && !ip.startsWith('[')) ip = ip.split(':').pop(); // IPv6 last segment
            }

            // Geo lookup
            const geo = geoip.lookup(ip) || {};

            // Client info
            const clientInfo = {
                ip,
                country: geo.country || '',
                city: geo.city || '',
                timezone: geo.timezone || '',
                device: {
                    model: params.model || 'Unknown',
                    brand: params.manf || 'Unknown',
                    version: params.release || 'Unknown'
                },
                connectedAt: new Date().toISOString()
            };

            const clientId = params.id;
            logger.clientConnected(clientId, ip, clientInfo.device);
            clients.connect(socket, clientId, clientInfo);

            // Socket events
            socket.on('error', (err) => logger.systemError(`Socket error from ${clientId}`, err));
            socket.on('ping', () => socket.emit('pong'));

        } catch (e) {
            logger.systemError('Socket connection failed', e);
            socket.disconnect(true);
        }
    });

    // Server errors
    io.on('error', (err) => logger.systemError('Socket.IO server error', err));

    // Expose io globally
    global.io = io;
    return io;
};
