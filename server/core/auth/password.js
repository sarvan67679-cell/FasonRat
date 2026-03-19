// Password Utility Module

import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

const hashPassword = async (password) => {
    if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
    }
    return await bcrypt.hash(password, SALT_ROUNDS);
};

const hashPasswordSync = (password) => {
    if (!password || typeof password !== 'string') {
        throw new Error('Password must be a non-empty string');
    }
    return bcrypt.hashSync(password, SALT_ROUNDS);
};

const verifyPassword = async (password, hash) => {
    if (!password || !hash) return false;
    try {
        return await bcrypt.compare(password, hash);
    } catch (e) {
        return false;
    }
};

const generateRandomPassword = (length = 16) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    const randomBytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        password += chars[randomBytes[i] % chars.length];
    }
    return password;
};

const validatePasswordStrength = (password) => {
    const errors = [];
    
    if (!password || password.length < 6) {
        errors.push('Password must be at least 6 characters long');
    }
    if (password && password.length > 128) {
        errors.push('Password must be less than 128 characters');
    }
    
    return { valid: errors.length === 0, errors };
};

export {
    hashPassword,
    hashPasswordSync,
    verifyPassword,
    generateRandomPassword,
    validatePasswordStrength,
    SALT_ROUNDS
};
