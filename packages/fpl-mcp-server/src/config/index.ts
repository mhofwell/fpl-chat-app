// src/config/index.ts
export const config = {
    nextjsPort: process.env.NEXT_CLIENT_PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    redisUrl:
        `${process.env.REDIS_URL}?family=0` ||
        'redis://localhost:6379?family=0',
    nextjsUrl:
        `http://${process.env.NEXT_CLIENT_PRIVATE_URL}:${process.env.NEXT_CLIENT_PORT}` ||
        'http://localhost:3000',
    appEnv: process.env.RAILWAY_ENVIRONMENT_NAME || 'development',
};
