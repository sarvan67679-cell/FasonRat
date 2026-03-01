const { Server } = require('socket.io');
const qs = require('querystring');
const geoip = require('geoip-lite');
const clients = require('./clients');
const { logger } = require('./logs');

module.exports = function(server) {
    const io = new Server(server, {
        transports: ['websocket', 'polling'],
        pingInterval: 30000,
        pingTimeout: 60000,
        maxHttpBufferSize: 50e6 // 50MB for large file transfers
    });

    logger.info('Socket.IO server initialized');

    io.on('connection', socket => {
        try {
            // Parse query params
            const params = typeof socket.handshake.query === 'string' 
                ? qs.parse(socket.handshake.query) 
                : socket.handshake.query;
            
            // Get client IP
            const ip = (socket.request.connection.remoteAddress || '').split(':').pop();
            
            // Geo lookup
            const geo = geoip.lookup(ip) || {};
            
            // Build client info
            const clientInfo = {
                ip,
                country: geo.country || '',
                city: geo.city || '',
                timezone: geo.timezone || '',
                device: {
                    model: params.model || 'Unknown',
                    brand: params.manf || 'Unknown',
                    version: params.release || 'Unknown'
                }
            };
            
            // Register client
            const clientId = params.id || 'unknown';
            clients.connect(socket, clientId, clientInfo);
            
            // Handle connection errors
            socket.on('error', (err) => {
                logger.systemError('Socket error', err);
            });
            
            socket.on('connect_error', (err) => {
                logger.systemError('Socket connection error', err);
            });
            
        } catch (e) {
            logger.systemError('Socket connection handler failed', e);
        }
    });

    // Handle server-level errors
    io.on('error', (err) => {
        logger.systemError('Socket.IO server error', err);
    });

    // Expose io for external use
    global.io = io;

    return io;
};
