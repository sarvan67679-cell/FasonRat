// Builder Progress Module

import fs from 'fs';
import { getProgressFile } from './path.js';
import { logger } from '../logs/logs.js';

const progressFile = getProgressFile();

const updateProgress = (step, message, complete = false, error = null) => {
    const data = { step, message, complete, error, time: new Date().toISOString() };
    
    try {
        fs.writeFileSync(progressFile, JSON.stringify(data));
    } catch (e) {}
    
    logger.buildStep(step, message);
};

const getProgress = () => {
    try {
        if (fs.existsSync(progressFile)) {
            return JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        }
    } catch (e) {}
    return { step: 'idle', message: 'Ready', complete: false };
};

export { updateProgress, getProgress };
