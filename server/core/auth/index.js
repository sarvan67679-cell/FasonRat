// Auth Module Index

import { auth, checkRateLimit, isLockedOut, startCleanup, recordFailedAttempt, clearFailedAttempts } from './middleware.js';
import { setupLoginRoutes } from './login.js';
import { setupRegisterRoutes, initDefaultUser } from './register.js';
import * as password from './password.js';

const setupRoutes = (router) => {
    setupLoginRoutes(router);
    setupRegisterRoutes(router);
};

export {
    auth,
    checkRateLimit,
    isLockedOut,
    recordFailedAttempt,
    clearFailedAttempts,
    startCleanup,
    setupRoutes,
    initDefaultUser,
    password
};
