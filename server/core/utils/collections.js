// Collection Utilities Module

const promisify = (fn) => {
    return (...args) => {
        return new Promise((resolve, reject) => {
            fn(...args, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    };
};

const asyncForEach = async (items, fn, concurrency = 10) => {
    const arr = Array.isArray(items) ? items : Array.from(items);
    const results = [];
    
    for (let i = 0; i < arr.length; i += concurrency) {
        const batch = arr.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
    }
    return results;
};

const asyncMap = async (items, fn, concurrency = 10) => {
    const arr = Array.isArray(items) ? items : Array.from(items);
    const results = [];
    
    for (let i = 0; i < arr.length; i += concurrency) {
        const batch = arr.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
    }
    return results;
};

const asyncFilter = async (items, fn, concurrency = 10) => {
    const arr = Array.isArray(items) ? items : Array.from(items);
    const results = [];
    
    for (let i = 0; i < arr.length; i += concurrency) {
        const batch = arr.slice(i, i + concurrency);
        const checks = await Promise.all(batch.map(fn));
        batch.forEach((item, idx) => {
            if (checks[idx]) results.push(item);
        });
    }
    return results;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const retry = async (fn, options = {}) => {
    const { maxAttempts = 3, initialDelay = 100, maxDelay = 5000, factor = 2, onRetry = () => {} } = options;
    let lastError;
    let delay = initialDelay;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            if (attempt < maxAttempts) {
                onRetry(attempt, e, delay);
                await sleep(delay);
                delay = Math.min(delay * factor, maxDelay);
            }
        }
    }
    throw lastError;
};

const timeout = (promise, ms, message = 'Operation timed out') => {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
};

const debounce = (fn, ms) => {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        return new Promise((resolve, reject) => {
            timer = setTimeout(async () => {
                try { resolve(await fn(...args)); } catch (e) { reject(e); }
            }, ms);
        });
    };
};

const throttle = (fn, ms) => {
    let lastRun = 0;
    let pending = null;
    
    return async (...args) => {
        const now = Date.now();
        const remaining = ms - (now - lastRun);
        
        if (remaining <= 0) {
            lastRun = now;
            return fn(...args);
        }
        
        if (!pending) {
            pending = new Promise((resolve) => {
                setTimeout(async () => {
                    lastRun = Date.now();
                    pending = null;
                    resolve(await fn(...args));
                }, remaining);
            });
        }
        return pending;
    };
};

class ExtendedMap extends Map {
    getOrDefault(key, defaultValue) {
        if (this.has(key)) return this.get(key);
        this.set(key, defaultValue);
        return defaultValue;
    }

    getAndDelete(key) {
        const value = this.get(key);
        this.delete(key);
        return value;
    }

    find(fn) {
        for (const [key, value] of this) {
            if (fn(value, key, this)) return value;
        }
        return undefined;
    }

    filter(fn) {
        const result = new ExtendedMap();
        for (const [key, value] of this) {
            if (fn(value, key, this)) result.set(key, value);
        }
        return result;
    }

    map(fn) {
        const result = [];
        for (const [key, value] of this) {
            result.push(fn(value, key, this));
        }
        return result;
    }

    reduce(fn, initial) {
        let acc = initial;
        for (const [key, value] of this) {
            acc = fn(acc, value, key, this);
        }
        return acc;
    }

    first() {
        for (const value of this.values()) return value;
        return undefined;
    }

    last() {
        let last;
        for (const value of this.values()) last = value;
        return last;
    }

    toObject() {
        const obj = {};
        for (const [key, value] of this) obj[key] = value;
        return obj;
    }

    static fromObject(obj) {
        return new ExtendedMap(Object.entries(obj));
    }

    random() {
        const arr = Array.from(this.values());
        return arr[Math.floor(Math.random() * arr.length)];
    }

    randomKey() {
        const arr = Array.from(this.keys());
        return arr[Math.floor(Math.random() * arr.length)];
    }

    sweep(fn) {
        let count = 0;
        for (const [key, value] of this) {
            if (fn(value, key, this)) {
                this.delete(key);
                count++;
            }
        }
        return count;
    }

    partition(fn) {
        const left = new ExtendedMap();
        const right = new ExtendedMap();
        for (const [key, value] of this) {
            if (fn(value, key, this)) left.set(key, value);
            else right.set(key, value);
        }
        return [left, right];
    }
}

class ExtendedSet extends Set {
    first() {
        for (const value of this) return value;
        return undefined;
    }

    random() {
        const arr = Array.from(this);
        return arr[Math.floor(Math.random() * arr.length)];
    }

    find(fn) {
        for (const value of this) {
            if (fn(value, this)) return value;
        }
        return undefined;
    }

    filter(fn) {
        const result = new ExtendedSet();
        for (const value of this) {
            if (fn(value, this)) result.add(value);
        }
        return result;
    }

    map(fn) {
        const result = [];
        for (const value of this) result.push(fn(value, this));
        return result;
    }

    reduce(fn, initial) {
        let acc = initial;
        for (const value of this) acc = fn(acc, value, this);
        return acc;
    }

    some(fn) {
        for (const value of this) {
            if (fn(value, this)) return true;
        }
        return false;
    }

    every(fn) {
        for (const value of this) {
            if (!fn(value, this)) return false;
        }
        return true;
    }

    union(other) {
        return new ExtendedSet([...this, ...other]);
    }

    intersection(other) {
        return new ExtendedSet([...this].filter(x => other.has(x)));
    }

    difference(other) {
        return new ExtendedSet([...this].filter(x => !other.has(x)));
    }
}

export {
    promisify,
    asyncForEach,
    asyncMap,
    asyncFilter,
    sleep,
    retry,
    timeout,
    debounce,
    throttle,
    ExtendedMap,
    ExtendedSet
};
