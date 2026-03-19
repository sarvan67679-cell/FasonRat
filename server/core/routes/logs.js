// Logs Routes Module

import { getLogs, clearLogs, getStats } from '../logs/logs.js';
import { auth } from '../auth/index.js';

const setupLogsRoutes = (router) => {
    router.get('/logs', auth, (req, res) => {
        const { type, category, search, limit } = req.query;
        const logs = getLogs({
            type,
            category,
            search,
            limit: limit ? Math.min(parseInt(limit), 1000) : 100
        });
        res.render('logs', { logs, stats: getStats(), filters: { type, category, search } });
    });

    router.post('/logs/clear', auth, (req, res) => {
        clearLogs();
        res.json({ success: true });
    });

    router.get('/api/logs/stats', auth, (req, res) => {
        res.json(getStats());
    });
};

const logs = { setupLogsRoutes };

export default logs;

export { setupLogsRoutes };
