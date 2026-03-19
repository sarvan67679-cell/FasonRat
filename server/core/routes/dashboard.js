// Dashboard Routes Module

import db from '../database/db.js';
import { auth } from '../auth/index.js';

const setupDashboardRoutes = (router) => {
    router.get('/', auth, (req, res) => {
        const allIds = db.repository.getAllIds();
        const onlineList = [];
        const offlineList = [];
        
        allIds.forEach(id => {
            const clientDb = db.getClient(id);
            if (clientDb) {
                const clientData = clientDb.value();
                if (clientData) {
                    const conn = clientData.connection || {};
                    const device = clientData.device || clientData.deviceInfo || { model: 'Unknown' };
                    
                    const summary = {
                        id: clientData.id,
                        ip: conn.ip || clientData.ip || '',
                        country: conn.country || clientData.country || '',
                        city: conn.city || clientData.city || '',
                        device: device,
                        lastSeen: conn.lastSeen || clientData.lastSeen || clientData.lastUpdated,
                        online: conn.online || false
                    };
                    
                    if (summary.online) {
                        onlineList.push(summary);
                    } else {
                        offlineList.push(summary);
                    }
                }
            }
        });
        
        res.render('index', {
            online: onlineList,
            offline: offlineList,
            stats: { 
                total: onlineList.length + offlineList.length, 
                online: onlineList.length, 
                offline: offlineList.length 
            }
        });
    });
};

const dashboard = { setupDashboardRoutes };

export default dashboard;

export { setupDashboardRoutes };
