import { Worker } from 'bullmq';
import IORedis from 'ioredis';

// Create Redis connection for workers
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: 3,
});

// Import processors
import { dailyRefreshProcessor } from './processors/daily-refresh';
import { hourlyRefreshProcessor } from './processors/hourly-refresh';
import { liveRefreshProcessor } from './processors/live-refresh';
import { postMatchRefreshProcessor } from './processors/post-match-refresh';
import { scheduleUpdateProcessor } from './processors/schedule-update';

// Create workers for each queue
export const workers = {
  'daily-refresh': new Worker('daily-refresh', dailyRefreshProcessor, { connection }),
  'hourly-refresh': new Worker('hourly-refresh', hourlyRefreshProcessor, { connection }),
  'live-refresh': new Worker('live-refresh', liveRefreshProcessor, { connection }),
  'post-match-refresh': new Worker('post-match-refresh', postMatchRefreshProcessor, { connection }),
  'schedule-update': new Worker('schedule-update', scheduleUpdateProcessor, { connection }),
};

// Set up error handling for all workers
Object.values(workers).forEach(worker => {
  worker.on('error', (error) => {
    console.error(`Worker error: ${error}`);
  });

  worker.on('failed', (job, error) => {
    console.error(`Job ${job?.id} failed: ${error}`);
  });
});

console.log('All queue workers initialized');