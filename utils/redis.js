const { createClient } = require('redis');

const redis = createClient(); // localhost:6379 for Docker

redis.on('error', (err) => console.error('❌ Redis Client Error:', err));

// Connect immediately when the app starts
(async () => {
  await redis.connect();
})();

module.exports = redis;