const { createClient } = require('redis');
require('dotenv').config();

let isConnected = false;
const inMemoryCache = new Map();

const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (process.env.NODE_ENV === 'test' || retries > 1) {
                return false; // Stop socket reconnect attempts during test runs or errors
            }
            return Math.min(retries * 100, 1000);
        }
    }
});

client.on('error', (err) => {
    if (process.env.NODE_ENV !== 'test') {
        console.warn('[Cache] Redis Client Warning/Error:', err.message);
    }
    isConnected = false;
});

client.on('ready', () => {
    isConnected = true;
    if (process.env.NODE_ENV !== 'test') {
        console.log('[Cache] Redis connected and ready.');
    }
});

(async () => {
    try {
        if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
            await client.connect();
        }
    } catch (err) {
        if (process.env.NODE_ENV !== 'test') {
            console.warn('[Cache] Initial Redis connection failed. Operating in fallback mode:', err.message);
        }
        isConnected = false;
    }
})();

/**
 * Cache abstraction wrapper ensuring application stability even if Redis crashes.
 */
const safeCache = {
    get: async (key) => {
        try {
            if (isConnected) {
                return await client.get(key);
            }
        } catch (err) {
            // Silently fall back
        }
        const item = inMemoryCache.get(key);
        if (!item) return null;
        if (item.expiry && Date.now() > item.expiry) {
            inMemoryCache.delete(key);
            return null;
        }
        return item.value;
    },

    set: async (key, value, options = {}) => {
        try {
            if (isConnected) {
                if (options.EX) {
                    await client.set(key, value, { EX: options.EX });
                } else {
                    await client.set(key, value);
                }
                return true;
            }
        } catch (err) {
            // Silently fall back
        }
        const ttlMs = (options.EX || 3600) * 1000;
        inMemoryCache.set(key, {
            value,
            expiry: Date.now() + ttlMs
        });
        return true;
    },

    del: async (key) => {
        try {
            if (isConnected) {
                await client.del(key);
            }
        } catch (err) {
            // Silently fall back
        }
        inMemoryCache.delete(key);
        return true;
    },

    flush: async () => {
        try {
            if (isConnected) {
                await client.flushAll();
            }
        } catch (err) {
            // Silently fall back
        }
        inMemoryCache.clear();
        return true;
    },

    isReady: () => isConnected,
    rawClient: client
};

module.exports = safeCache;
