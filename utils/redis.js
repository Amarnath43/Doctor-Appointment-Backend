const { createClient } = require('redis');

// Your connection URL with the password
const redisUrl = 'redis://:Amar234@%23@127.0.0.1:6379';

// Create the client with the connection URL
const redisClient = createClient({
  url: redisUrl
});

// Set up a listener for connection errors
redisClient.on('error', (err) => console.error('❌ Redis Client Error:', err));

// Connect to Redis and log the status
(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis successfully!');
  } catch (err) {
    console.error('🔥 Failed to connect to Redis:', err);
  }
})();

// Export the connected client for the rest of your app to use
module.exports = redisClient;