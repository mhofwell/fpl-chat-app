import Redis from 'ioredis';
import { config } from '../../config';

// Get environment variables
const redisUrl =
    `${process.env.REDIS_URL}?family=0` || 'redis://localhost:6379?family=0';

// Log environment info for debugging
console.log('Environment variables:');
console.log(`- APP_ENV: ${config.appEnv}`);
console.log(`- NODE_ENV: ${config.nodeEnv}`);
console.log(`REDIS_URL: ${redisUrl}`);
console.log(`- REDIS_URL: ${config.redisUrl ? '[SET]' : '[NOT SET]'}`);

// Configure Redis client based on environment
const getRedisClient = () => {
    console.log(`Initializing Redis in ${config.appEnv} mode`);

    // Create and return Redis client
    // In redis-client.ts
    const client = new Redis(redisUrl, {
        commandTimeout: 5000, // 5 second timeout for Redis commands
        enableOfflineQueue: false, // Don't queue commands when disconnected
        maxRetriesPerRequest: 2, // Limit retries to reduce hang time
    });

    // Log connection status based on environment
    client.on('error', (err) => {
        console.error(`Redis connection error (${config.appEnv}):`, err);
    });

    client.on('connect', () => {
        console.log(`Connected to Redis successfully (${config.appEnv})`);
    });

    return client;
};

// Export Redis client
const redis = getRedisClient();
export default redis;
