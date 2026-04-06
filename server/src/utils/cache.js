const { createClient } = require('redis');
require('dotenv').config();

const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 3) {
                console.error('Redis: Max retries reached. Shutting down reconnect strategy.');
                return new Error('Max retries reached');
            }
            return Math.min(retries * 100, 3000);
        }
    }
});

client.on('error', (err) => console.log('Redis Client Error', err));

// Connect immediately
(async () => {
    try {
        await client.connect();
        console.log('Redis connected');
    } catch (err) {
        console.error('Redis connection failed:', err);
        // Fallback to in-memory if Redis fails? 
        // For now, we'll log error. In prod, we might want a fallback.
    }
})();

module.exports = client;
