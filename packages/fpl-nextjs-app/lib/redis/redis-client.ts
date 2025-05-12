import Redis from 'ioredis';

// Get environment variables
const redisUrl = process.env.REDIS_URL
    ? `${process.env.REDIS_URL}?family=0`
    : 'redis://localhost:6379?family=0';
const appEnv = process.env.APP_ENV || 'development';

// Log environment info for debugging
console.log('Environment variables:');
console.log(`- APP_ENV: ${process.env.APP_ENV}`);
console.log(`- NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`- REDIS_URL: ${process.env.REDIS_URL ? '[SET]' : '[NOT SET]'}`);
console.log(`- Using Redis URL: ${redisUrl}`);

// Configure Redis client based on environment
const getRedisClient = () => {
    console.log(`Initializing Redis in ${appEnv} mode`);

    const client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        enableReadyCheck: true,
        retryStrategy(times) {
            const delay = Math.min(times * 100, 2000);
            return delay;
        },
    });

    // Log connection status based on environment
    client.on('error', (err) => {
        console.error(`Redis connection error (${appEnv}):`, err);
    });

    client.on('connect', () => {
        console.log(`Connected to Redis successfully (${appEnv})`);
    });

    return client;
};

// Export Redis client
const redis = getRedisClient();
export default redis;
