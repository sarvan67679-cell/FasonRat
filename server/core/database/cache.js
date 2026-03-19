// LRU Cache Module

class LRUCache {
    constructor(maxSize = 100) {
        this.maxSize = maxSize;
        this.cache = new Map();
        this.hits = 0;
        this.misses = 0;
    }

    get(id) {
        if (!this.cache.has(id)) {
            this.misses++;
            return null;
        }
        
        const value = this.cache.get(id);
        this.cache.delete(id);
        this.cache.set(id, value);
        this.hits++;
        return value;
    }

    set(id, data) {
        if (this.cache.has(id)) {
            this.cache.delete(id);
        } else if (this.cache.size >= this.maxSize) {
            const oldest = this.cache.keys().next().value;
            this.cache.delete(oldest);
        }
        
        this.cache.set(id, data);
        return data;
    }

    has(id) {
        return this.cache.has(id);
    }

    delete(id) {
        return this.cache.delete(id);
    }

    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    get size() {
        return this.cache.size;
    }

    keys() {
        return Array.from(this.cache.keys()).reverse();
    }

    getStats() {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%'
        };
    }

    evictOlderThan(maxAge) {
        const now = Date.now();
        let evicted = 0;
        
        for (const [id, data] of this.cache) {
            if (data._cachedAt && (now - data._cachedAt) > maxAge) {
                this.cache.delete(id);
                evicted++;
            }
        }
        return evicted;
    }
}

class TTLCache extends LRUCache {
    constructor(maxSize = 100, defaultTTL = 300000) {
        super(maxSize);
        this.defaultTTL = defaultTTL;
    }

    set(id, data, ttl = this.defaultTTL) {
        const item = {
            data,
            expiresAt: Date.now() + ttl,
            _cachedAt: Date.now()
        };
        return super.set(id, item);
    }

    get(id) {
        const item = super.get(id);
        if (!item) return null;
        
        if (Date.now() > item.expiresAt) {
            this.delete(id);
            this.misses++;
            return null;
        }
        
        return item.data;
    }

    refresh(id, ttl = this.defaultTTL) {
        const item = super.get(id);
        if (item) {
            item.expiresAt = Date.now() + ttl;
            return true;
        }
        return false;
    }
}

export { LRUCache, TTLCache };
