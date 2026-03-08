const { Server } = require('socket.io');
const qs = require('querystring');
const geoip = require('geoip-lite');
const clients = require('../clients/clients');
const { logger } = require('../logs/logs');
const config = require('../config/config');

module.exports = function(server) {
    const io = new Server(server, {
        transports: ['websocket', 'polling'],
        pingInterval: config.socket?.pingInterval || 25000,
        pingTimeout: config.socket?.pingTimeout || 60000,
        maxHttpBufferSize: config.limits?.maxFileSize || 50e6,
        cors: config.socket?.cors || {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    logger.info('Socket.IO server initialized');

    // Authentication middleware
    io.use((socket, next) => {
        try {
            const params = typeof socket.handshake.query === 'string' 
                ? qs.parse(socket.handshake.query) 
                : socket.handshake.query;
            
            if (!params.id) {
                logger.warning('Connection rejected: no ID', 'client');
                return next(new Error('ID required'));
            }
            
            // Store params in socket for later use
            socket.fasonParams = params;
            next();
        } catch (e) {
            logger.systemError('Socket auth failed', e);
            next(e);
        }
    });

    // Handle client connections
    io.on('connection', socket => {
        try {
            const params = socket.fasonParams || socket.handshake.query;
            
            // Get client IP
            const ip = (socket.request.connection.remoteAddress || '')
                .split(':')
                .pop()
                .replace('::ffff:', '');
            
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
                },
                connectedAt: new Date().toISOString()
            };
            
            // Register client
            const clientId = params.id;
            
            // Log connection
            logger.clientConnected(clientId, ip, clientInfo.device);
            
            // Register with client manager
            clients.connect(socket, clientId, clientInfo);
            
            // Setup socket event handlers
            setupSocketEvents(socket, clientId);
            
        } catch (e) {
            logger.systemError('Socket connection handler failed', e);
            socket.disconnect(true);
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

// Setup socket event handlers
function setupSocketEvents(socket, clientId) {
    // Note: disconnect and pong handlers are in clients.js setupHandlers()
    // Only handle socket-level errors here
    
    socket.on('error', (err) => {
        logger.systemError(`Socket error from ${clientId}`, err);
    });
    
    // Ping-pong for keepalive (server responds to client ping)
    socket.on('ping', () => socket.emit('pong'));
    
    // Note: Device messages are handled by clients.js setupHandlers()
    // No need to duplicate handlers here
}
