// /Users/bigviking/Documents/GitHub/Projects/fpl-chat-app/queue-service/src/queues/index.ts
import { Queue, QueueEvents } from 'bullmq';
import redis from '../lib/redis/redis-client';
import { QUEUE_NAMES, JOB_OPTIONS, REDIS_CONFIG } from '../config/queue-config';

// Queue instances
const queues: Record<string, Queue> = {};
const schedulers: Record<string, QueueEvents> = {};

// Initialize all queues
export function initializeQueues() {
    // Create a queue for each queue name
    Object.values(QUEUE_NAMES).forEach((queueName) => {
        console.log(`Initializing queue: ${queueName}`);

        // Create queue scheduler (for handling delayed jobs, retries, etc.)
        schedulers[queueName] = new QueueEvents(queueName, {
            connection: redis,
            prefix: REDIS_CONFIG.prefix,
        });

        // Create the queue
        queues[queueName] = new Queue(queueName, {
            connection: redis,
            defaultJobOptions: {
                ...JOB_OPTIONS.default,
                removeOnComplete: 100, // Keep only last 100 completed jobs
                removeOnFail: 100, // Keep only last 100 failed jobs
            },
            prefix: REDIS_CONFIG.prefix,
        });

        // Add this event listener
        queues[queueName].on('waiting', (jobId: string) => {
            console.log(`Job ${jobId} added to queue ${queueName}`);
        });

        queues[queueName].on('progress', (jobId: string) => {
            console.log(`Job ${jobId} started in queue ${queueName}`);
        });
    });

    // Schedule a periodic cleanup function to run every 24 hours
    scheduleQueueCleanup();
    
    console.log('All queues initialized');
    return queues;
}

/**
 * Schedule queue cleanup to run periodically to prevent Redis accumulation
 */
function scheduleQueueCleanup() {
    console.log('Scheduling periodic queue cleanup task');
    
    // Run cleanup immediately on startup
    setTimeout(() => cleanupQueues(), 120000); // 2 minutes after startup
    
    // Then schedule to run every 24 hours
    setInterval(() => cleanupQueues(), 24 * 60 * 60 * 1000);
}

/**
 * Clean up old jobs from all queues
 */
async function cleanupQueues() {
    console.log('Starting automatic queue cleanup...');
    try {
        for (const [queueName, queue] of Object.entries(queues)) {
            console.log(`Cleaning up queue: ${queueName}`);
            
            try {
                // Get timestamp for 24 hours ago
                const olderThan = Date.now() - 24 * 60 * 60 * 1000;
                
                // Clean completed jobs
                const completedCount = await queue.clean(olderThan, 'completed');
                console.log(`- Removed ${completedCount} completed jobs from ${queueName}`);
                
                // Clean failed jobs
                const failedCount = await queue.clean(olderThan, 'failed');
                console.log(`- Removed ${failedCount} failed jobs from ${queueName}`);
                
                // Clean delayed jobs that are older than 48 hours (these might be stuck)
                const olderThan48h = Date.now() - 48 * 60 * 60 * 1000;
                const delayedCount = await queue.clean(olderThan48h, 'delayed');
                console.log(`- Removed ${delayedCount} delayed jobs from ${queueName}`);
                
                // Get current job counts
                const counts = await queue.getJobCounts();
                console.log(`- Queue ${queueName} now has: ${JSON.stringify(counts)}`);
            } catch (err) {
                console.error(`Error cleaning queue ${queueName}:`, err);
            }
        }
        console.log('Automatic queue cleanup completed');
    } catch (error) {
        console.error('Error in automatic queue cleanup:', error);
    }
}

// Get a specific queue
export function getQueue(name: string): Queue | undefined {
    return queues[name];
}

// Get all queues
export function getAllQueues(): Record<string, Queue> {
    return queues;
}

// Clean up function to close all queues
export async function closeQueues() {
    console.log('Closing all queues...');

    // Close all queue schedulers
    await Promise.all(
        Object.values(schedulers).map((scheduler) => scheduler.close())
    );

    // Close all queues
    await Promise.all(Object.values(queues).map((queue) => queue.close()));

    console.log('All queues closed');
}
