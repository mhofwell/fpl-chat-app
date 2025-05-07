// Define queue names as constants to ensure consistency
export const QUEUE_NAMES = {
    LIVE_REFRESH: 'live-refresh',
    DAILY_REFRESH: 'daily-refresh',
    HOURLY_REFRESH: 'hourly-refresh',
    POST_MATCH_REFRESH: 'post-match-refresh',
    SCHEDULER_MANAGER: 'schedule-update',
};

// Redis configuration
export const REDIS_CONFIG = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    prefix: 'fpl-queue', // Prefix for all queue keys in Redis
    maxRetriesPerRequest: 3,
};

// Job options configuration
export const JOB_OPTIONS = {
    // Default options for all jobs
    default: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000, // 5 seconds initial delay
        },
        removeOnComplete: 100, // Keep only last 100 completed jobs
        removeOnFail: 100, // Keep only last 100 failed jobs
    },

    // Specific options for each job type can be added here
    // Example: override options for daily refresh jobs
    [QUEUE_NAMES.DAILY_REFRESH]: {
        attempts: 5, // More attempts for important daily refresh
        timeout: 300000, // 5 minutes timeout
    },
};
