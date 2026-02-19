const { createClient } = require('redis');
require('dotenv').config();

const client = createClient({
    url: process.env.REDIS_URL
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
