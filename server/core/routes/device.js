// Device Routes Module

import clients from '../clients/index.js';
import { auth } from '../auth/index.js';

const setupDeviceRoutes = (router) => {
    router.get('/device/:id', auth, (req, res) => {
        res.redirect(`/device/${req.params.id}/info`);
    });

    router.get('/device/:id/:page', auth, async (req, res) => {
        const { id, page } = req.params;
        const client = await clients.get(id);

        if (!client) {
            return res.render('device', { id, page: 'notfound', data: {}, client: null });
        }

        res.render('device', { id, page, data: clients.getData(id, page) || {}, client });
    });

    router.post('/cmd/:id/:cmd', auth, async (req, res) => {
        const { id, cmd } = req.params;
        const params = { ...req.query, ...req.body };

        try {
            const result = await clients.send(id, cmd, params);
            if (result.error) {
                res.json({ error: result.error });
            } else {
                res.json({ success: true, message: result.result });
            }
        } catch (e) {
            res.json({ error: e.message });
        }
    });

    router.post('/gps/:id/:interval', auth, (req, res) => {
        const { id, interval } = req.params;
        const int = parseInt(interval) || 0;

        if (int < 0 || int > 3600) {
            return res.json({ error: 'Interval must be 0-3600 seconds' });
        }

        res.json({ success: clients.setGps(id, int) });
    });
};

const device = { setupDeviceRoutes };

export default device;

export { setupDeviceRoutes };
