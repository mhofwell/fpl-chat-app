import { Worker } from 'bullmq';
import redis from '../lib/redis/redis-client'; 

// Import processors
import { dailyRefreshProcessor } from './processors/daily-refresh';
import { hourlyRefreshProcessor } from './processors/hourly-refresh';
import { liveRefreshProcessor } from './processors/live-refresh';
import { postMatchRefreshProcessor } from './processors/post-match-refresh';
import { scheduleUpdateProcessor } from './processors/schedule-update';

// Create workers for each queue
export const workers = {
    'daily-refresh': new Worker('daily-refresh', dailyRefreshProcessor, {
        connection: redis, 
    }),
    'hourly-refresh': new Worker('hourly-refresh', hourlyRefreshProcessor, {
        connection: redis, 
    }),
    'live-refresh': new Worker('live-refresh', liveRefreshProcessor, {
        connection: redis, 
    }),
    'post-match-refresh': new Worker(
        'post-match-refresh',
        postMatchRefreshProcessor,
        { connection: redis } 
    ),
    'schedule-update': new Worker('schedule-update', scheduleUpdateProcessor, {
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
