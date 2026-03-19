// API Routes Module

import fs from 'fs';
import db from '../database/db.js';
import clients from '../clients/index.js';
import { getStats as getLogStats } from '../logs/logs.js';
import { auth } from '../auth/index.js';
import { clientDb } from '../database/path.js';

const setupApiRoutes = (router) => {
    router.get('/api/client/:id/:page', auth, (req, res) => {
        const data = clients.getData(req.params.id, req.params.page);
        res.json(data ? { success: true, data } : { error: 'Not found' });
    });

    router.get('/api/clients', auth, async (req, res) => {
        try {
            const onlineList = await clients.online();
            const offlineList = await clients.offline();
            const allClients = await clients.all();
            res.json({
                online: onlineList,
                offline: offlineList,
                total: allClients.length
            });
        } catch (e) {
            res.json({ error: e.message });
        }
    });

    router.get('/api/client/:id', auth, async (req, res) => {
        try {
            const client = await clients.get(req.params.id);
            res.json(client || { error: 'Client not found' });
        } catch (e) {
            res.json({ error: e.message });
        }
    });

    router.delete('/api/client/:id', auth, (req, res) => {
        const id = req.params.id;
        db.main.get('clients').remove({ id }).write();

        const file = clientDb(id);
        if (fs.existsSync(file)) fs.unlinkSync(file);

        res.json({ success: true });
    });

    router.get('/api/stats', auth, async (req, res) => {
        try {
            const onlineList = await clients.online();
            const allClients = await clients.all();
            res.json({
                clients: {
                    online: onlineList.length,
                    offline: allClients.length - onlineList.length,
                    total: allClients.length
                },
                logs: getLogStats(),
                uptime: process.uptime(),
                memory: process.memoryUsage()
            });
        } catch (e) {
            res.json({ error: e.message });
        }
    });
};

const api = { setupApiRoutes };

export default api;

export { setupApiRoutes };
