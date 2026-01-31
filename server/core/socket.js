const { Server } = require('socket.io');
const qs = require('querystring');
const geoip = require('geoip-lite');
const clients = require('./clients');

module.exports = function(server) {
    const io = new Server(server, {
        transports: ['websocket', 'polling'],
        pingInterval: 30000,
        pingTimeout: 60000
    });

    io.on('connection', socket => {
        const params = typeof socket.handshake.query === 'string' 
            ? qs.parse(socket.handshake.query) 
            : socket.handshake.query;
        
        const ip = (socket.request.connection.remoteAddress || '').split(':').pop();
        const geo = geoip.lookup(ip) || {};
        
        clients.connect(socket, params.id || 'unknown', {
            ip,
            country: geo.country || '',
            device: {
                model: params.model || 'Unknown',
                brand: params.manf || 'Unknown',
                version: params.release || 'Unknown'
            }
        });
    });

    return io;
};
