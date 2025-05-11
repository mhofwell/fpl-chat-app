import { Worker } from 'bullmq';
import redis from '../lib/redis/redis-client'; 
import { QUEUE_NAMES } from '../config/queue-config';

// Import processors
import { dailyRefreshProcessor } from './processors/daily-refresh';
import { hourlyRefreshProcessor } from './processors/hourly-refresh';
import { liveRefreshProcessor } from './processors/live-refresh';
import { postMatchRefreshProcessor } from './processors/post-match-refresh';
import { preDeadlineRefreshProcessor } from './processors/pre-deadline-refresh';
import { scheduleUpdateProcessor } from './processors/schedule-update';

// Create workers for each queue
export const workers = {
    [QUEUE_NAMES.DAILY_REFRESH]: new Worker(QUEUE_NAMES.DAILY_REFRESH, dailyRefreshProcessor, {
        connection: redis, 
    }),
    [QUEUE_NAMES.HOURLY_REFRESH]: new Worker(QUEUE_NAMES.HOURLY_REFRESH, hourlyRefreshProcessor, {
        connection: redis, 
    }),
    [QUEUE_NAMES.LIVE_REFRESH]: new Worker(QUEUE_NAMES.LIVE_REFRESH, liveRefreshProcessor, {
        connection: redis, 
    }),
    [QUEUE_NAMES.POST_MATCH_REFRESH]: new Worker(
        QUEUE_NAMES.POST_MATCH_REFRESH,
        postMatchRefreshProcessor,
        { connection: redis } 
    ),
    [QUEUE_NAMES.PRE_DEADLINE_REFRESH]: new Worker(
        QUEUE_NAMES.PRE_DEADLINE_REFRESH,
        preDeadlineRefreshProcessor,
        { connection: redis }
    ),
    [QUEUE_NAMES.SCHEDULER_MANAGER]: new Worker(QUEUE_NAMES.SCHEDULER_MANAGER, scheduleUpdateProcessor, {
        connection: redis, 
    }),
};

// Set up error handling for all workers
Object.values(workers).forEach((worker) => {
    worker.on('error', (error) => {
        console.error(`Worker error: ${error}`);
    });

    worker.on('failed', (job, error) => {
        console.error(`Job ${job?.id} failed: ${error}`);
    });
});

console.log('All queue workers initialized');
