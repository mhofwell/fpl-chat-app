// /Users/bigviking/Documents/GitHub/Projects/fpl-chat-app/queue-service/src/workers/index.ts
import { Worker, Job } from 'bullmq';
import redis from '../lib/redis/redis-client';
import { QUEUE_NAMES, REDIS_CONFIG } from '../config/queue-config';

// Import actual processor functions
import { liveRefreshProcessor } from './processors/live-refresh';
import { dailyRefreshProcessor } from './processors/daily-refresh';
import { hourlyRefreshProcessor } from './processors/hourly-refresh';
import { postMatchRefreshProcessor } from './processors/post-match-refresh';
import { scheduleUpdateProcessor } from './processors/schedule-update';

// Store for active workers
const workers: Record<string, Worker> = {};

// Map of queue names to processor functions
const processors: Record<string, (job: Job) => Promise<any>> = {
    [QUEUE_NAMES.LIVE_REFRESH]: liveRefreshProcessor,
    [QUEUE_NAMES.DAILY_REFRESH]: dailyRefreshProcessor,
    [QUEUE_NAMES.HOURLY_REFRESH]: hourlyRefreshProcessor,
    [QUEUE_NAMES.POST_MATCH_REFRESH]: postMatchRefreshProcessor,
    [QUEUE_NAMES.SCHEDULER_MANAGER]: scheduleUpdateProcessor,
};

// Initialize all workers
export function initializeWorkers() {
    // Create a worker for each queue
    Object.values(QUEUE_NAMES).forEach((queueName) => {
        console.log(`Initializing worker for queue: ${queueName}`);

        // Create worker with appropriate processor
        workers[queueName] = new Worker(queueName, processors[queueName], {
            connection: redis,
            prefix: REDIS_CONFIG.prefix,
            concurrency: 1, // Process one job at a time per queue
        });

        // Set up event handlers
        workers[queueName].on('ready', () => {
            console.log(`Worker for queue ${queueName} is ready to process jobs`);
        });

        workers[queueName].on('error', (error) => {
            console.error(`Worker error in queue ${queueName}:`, error);
        });

        workers[queueName].on('active', (job) => {
            console.log(`Job ${job.id} started processing in queue ${queueName}`);
        });

        workers[queueName].on('completed', (job) => {
            console.log(`Job ${job.id} completed in queue ${queueName}`);
        });

        workers[queueName].on('failed', (job, error) => {
            console.error(`Job ${job?.id} failed in queue ${queueName}:`, error);
        });

        workers[queueName].on('stalled', (jobId) => {
            console.warn(`Job ${jobId} stalled in queue ${queueName}`);
        });
    });

    console.log('All workers initialized');
    return workers;
}

// Close all workers
export async function closeWorkers() {
    console.log('Closing all workers...');

    await Promise.all(Object.values(workers).map((worker) => worker.close()));

    console.log('All workers closed');
}
