// /Users/bigviking/Documents/GitHub/Projects/fpl-chat-app/queue-service/src/utils/redis.ts
import Redis from 'ioredis';
// Get Redis URL from environment variables
const redisUrl = `${process.env.REDIS_URL}?family=0` || 'redis://localhost:6379?family=0';

// Configure Redis client
export const getRedisClient = () => {
  console.log(`Initializing Redis connection to ${redisUrl}`);

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 10000,
    enableReadyCheck: true,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 2000);
      return delay;
    },
  });

  // Log connection status
  client.on('error', (err) => {
    console.error(`Redis connection error:`, err);
  });

  client.on('connect', () => {
    console.log(`Connected to Redis successfully`);
  });

  return client;
};

// Export Redis client
const redis = getRedisClient();
export default redis;