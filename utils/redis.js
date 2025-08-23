// redisClient.js
const { createClient } = require('redis');

// Your connection URL
const redisUrl = 'redis://:Amar234@#@127.0.0.1:6379';

// Create the client
const redisClient = createClient({
  url: redisUrl
});

// Set up error handling
redisClient.on('error', (err) => console.error('❌ Redis Client Error:', err));

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis successfully!');
  } catch (err) {
    console.error('🔥 Failed to connect to Redis:', err);
  }
})();

// Export the connected client
module.exports = redisClient;