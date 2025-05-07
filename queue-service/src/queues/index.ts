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
            defaultJobOptions: JOB_OPTIONS.default,
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

    console.log('All queues initialized');
    return queues;
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
