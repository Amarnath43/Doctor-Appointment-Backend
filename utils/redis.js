const { createClient } = require('redis');

const redisUrl = 'redis://:Amar234@%23@127.0.0.1:6379';

const redisClient = createClient({
  url: redisUrl
});


redisClient.on('error', (err) => console.error('❌ Redis Client Error:', err));

(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis successfully!');
  } catch (err) {
    console.error('🔥 Failed to connect to Redis:', err);
  }
})();

module.exports = redisClient;