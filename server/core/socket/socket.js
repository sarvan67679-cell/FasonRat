// Socket.IO Server Module

import { Server } from 'socket.io';
import geoip from 'geoip-lite';
import clients from '../clients/index.js';
import { logger } from '../logs/logs.js';
import config from '../config/config.js';

const initSocket = (server) => {
    const io = new Server(server, {
        transports: config.socket.transports,
        pingInterval: config.socket.pingInterval,
        pingTimeout: config.socket.pingTimeout,
        maxHttpBufferSize: config.socket.maxHttpBufferSize,
        cors: config.socket.cors
    });

    logger.info('Socket.IO server initialized');

    io.use((socket, next) => {
        try {
            const params = socket.handshake.query || {};

            if (!params.id) {
                logger.warning('Connection rejected: no ID', 'client');
                return next(new Error('ID required'));
            }

            socket.fasonParams = params;
            next();
        } catch (e) {
            logger.error('Socket auth failed', 'socket', e);
            next(e);
        }
    });

    io.on('connection', async (socket) => {
        try {
            const params = socket.fasonParams || socket.handshake.query;

            let ip = '';
            const forwarded = socket.handshake.headers['x-forwarded-for'];
            if (forwarded) ip = forwarded.split(',')[0].trim();
            if (!ip) {
                let remoteAddr = socket.request.connection.remoteAddress || '';
                ip = remoteAddr.replace(/^::ffff:/, '');
                if (ip === '::1') ip = '127.0.0.1';
                if (ip.includes(':') && !ip.startsWith('[')) ip = ip.split(':').pop();
            }

            const geo = geoip.lookup(ip) || {};

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
            await clients.connect(socket, clientId, clientInfo);

            socket.on('error', (err) => logger.error(`Socket error from ${clientId}`, 'socket', err));
            socket.on('ping', () => socket.emit('pong'));

        } catch (e) {
            logger.error('Socket connection failed', 'socket', e);
            socket.disconnect(true);
        }
    });

    io.on('error', (err) => logger.error('Socket.IO server error', 'socket', err));

    global.io = io;
    return io;
};

export default initSocket;
