// Java Checker Module

import cp from 'child_process';
import { updateProgress } from './progress.js';

const checkJava = (cb) => {
    updateProgress('java', 'Checking Java...');

    const proc = cp.spawn('java', ['-version']);
    let output = '';

    proc.stderr.on('data', d => output += d.toString());

    proc.on('error', () => {
        const err = 'Java not found. Install Java 8+';
        updateProgress('java', err, false, err);
        cb(err);
    });

    proc.on('close', () => {
        if (output.includes('version')) {
            const match = output.match(/version "([^"]+)"/);
            updateProgress('java', `Java ${match ? match[1] : 'detected'}`, true);
            cb(null);
        } else {
            const err = 'Java not detected';
            updateProgress('java', err, false, err);
            cb(err);
        }
    });
};

export { checkJava };
