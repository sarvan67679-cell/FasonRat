// Directory Utility Module

import fs from 'fs';

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

export { ensureDir };
