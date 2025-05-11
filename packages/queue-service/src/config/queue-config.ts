// Define queue names as constants to ensure consistency
export const QUEUE_NAMES = {
    LIVE_REFRESH: 'live-refresh',
    DAILY_REFRESH: 'daily-refresh',
    HOURLY_REFRESH: 'hourly-refresh',
    POST_MATCH_REFRESH: 'post-match-refresh',
    PRE_DEADLINE_REFRESH: 'pre-deadline-refresh',
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

    // Specific options for each job type
    [QUEUE_NAMES.LIVE_REFRESH]: {
        attempts: 3,
        priority: 1, // Highest priority for live updates
        timeout: 120000, // 2 minutes
    },
    
    [QUEUE_NAMES.POST_MATCH_REFRESH]: {
        attempts: 3,
        priority: 2, // Very high priority
        timeout: 180000, // 3 minutes
    },
    
    [QUEUE_NAMES.PRE_DEADLINE_REFRESH]: {
        attempts: 3,
        priority: 3,
        timeout: 180000,
    },
    
    [QUEUE_NAMES.DAILY_REFRESH]: {
        attempts: 5, // More attempts for important daily refresh
        priority: 5,
        timeout: 300000, // 5 minutes timeout
    },
    
    [QUEUE_NAMES.HOURLY_REFRESH]: {
        attempts: 3,
        priority: 10, // Medium priority
        timeout: 180000, // 3 minutes
    },
    
    [QUEUE_NAMES.SCHEDULER_MANAGER]: {
        attempts: 3,
        priority: 15, // Lower priority
        timeout: 120000, // 2 minutes
    }
};
