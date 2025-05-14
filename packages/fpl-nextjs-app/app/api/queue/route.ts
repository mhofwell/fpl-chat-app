import { NextRequest, NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import redis from '@/lib/redis/redis-client';
import { checkCronSecret } from '@/lib/cron/cron-auth';

// Define default queue options to prevent queue key accumulation
const defaultQueueOptions = {
    connection: redis,
    prefix: 'fpl-queue',
    defaultJobOptions: {
        removeOnComplete: true,  // Remove jobs from Redis when they complete
        removeOnFail: 100,       // Keep only the last 100 failed jobs
        attempts: 3,             // Retry failed jobs up to 3 times
        backoff: {
            type: 'exponential',
            delay: 5000
        }
    }
};

// Define the queues - one for each job type
const queues = {
    'daily-refresh': new Queue('daily-refresh', defaultQueueOptions),
    'hourly-refresh': new Queue('hourly-refresh', defaultQueueOptions),
    'live-refresh': new Queue('live-refresh', defaultQueueOptions),
    'post-match-refresh': new Queue('post-match-refresh', defaultQueueOptions),
    'pre-deadline-refresh': new Queue('pre-deadline-refresh', defaultQueueOptions),
    'schedule-update': new Queue('schedule-update', defaultQueueOptions),
};

export async function POST(request: NextRequest) {
    // Verify authentication
    const isAuthorized = await checkCronSecret(request);
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { jobType, data, options } = await request.json();
        const validType = jobType as keyof typeof queues;

        // Validate job type
        if (!queues[validType]) {
            return NextResponse.json(
                { error: `Invalid job type: ${jobType}` },
                { status: 400 }
            );
        }

        // Add the job to the appropriate queue
        const queue = queues[validType];
        const job = await queue.add(jobType, data, options);

        return NextResponse.json({
            id: job.id,
            name: job.name,
            status: 'queued',
        });
    } catch (error) {
        console.error('Error adding job to queue:', error);
        return NextResponse.json(
            { error: 'Failed to add job to queue' },
            { status: 500 }
        );
    }
}

// Health check endpoint
export async function GET(request: NextRequest) {
    const isAuthorized = await checkCronSecret(request);
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if this is a cleanup request
    const { searchParams } = new URL(request.url);
    const cleanup = searchParams.get('cleanup');

    try {
        // If cleanup is requested, clean up old jobs
        if (cleanup === 'true') {
            await cleanupOldJobs();
            return NextResponse.json({ status: 'cleanup-completed' });
        }

        // Get queue stats
        const stats = await Promise.all(
            Object.entries(queues).map(async ([name, queue]) => {
                const [waiting, active, completed, failed] = await Promise.all([
                    queue.getWaitingCount(),
                    queue.getActiveCount(),
                    queue.getCompletedCount(),
                    queue.getFailedCount(),
                ]);

                return {
                    name,
                    stats: { waiting, active, completed, failed },
                };
            })
        );

        return NextResponse.json({ status: 'healthy', queues: stats });
    } catch (error) {
        console.error('Error getting queue status:', error);
        return NextResponse.json(
            { error: 'Failed to get queue status' },
            { status: 500 }
        );
    }
}

/**
 * Cleans up old jobs from all queues to prevent Redis memory accumulation
 */
async function cleanupOldJobs() {
    console.log('Starting queue cleanup process...');
    
    try {
        const results = await Promise.all(
            Object.entries(queues).map(async ([name, queue]) => {
                // Clean jobs older than 24 hours (grace period is in milliseconds)
                const gracePeriod24h = 24 * 60 * 60 * 1000;
                
                // Clean up completed jobs
                try {
                    const completedCount = await queue.clean(gracePeriod24h, 100, 'completed');
                    console.log(`Cleaned ${completedCount} completed jobs from ${name} queue`);
                } catch (err) {
                    console.error(`Error cleaning completed jobs from ${name} queue:`, err);
                }
                
                // Clean up failed jobs (keep more recent ones)
                try {
                    const failedCount = await queue.clean(gracePeriod24h, 100, 'failed');
                    console.log(`Cleaned ${failedCount} failed jobs from ${name} queue`);
                } catch (err) {
                    console.error(`Error cleaning failed jobs from ${name} queue:`, err);
                }
                
                // Clean delayed jobs older than 48 hours (these are probably forgotten)
                try {
                    const gracePeriod48h = 48 * 60 * 60 * 1000;
                    const delayedCount = await queue.clean(gracePeriod48h, 100, 'delayed');
                    console.log(`Cleaned ${delayedCount} delayed jobs from ${name} queue`);
                } catch (err) {
                    console.error(`Error cleaning delayed jobs from ${name} queue:`, err);
                }
                
                // Get updated counts
                const [waiting, active, completed, failed] = await Promise.all([
                    queue.getWaitingCount(),
                    queue.getActiveCount(),
                    queue.getCompletedCount(),
                    queue.getFailedCount(),
                ]);
                
                return {
                    name,
                    stats: { waiting, active, completed, failed },
                };
            })
        );
        
        console.log('Queue cleanup completed successfully');
        return results;
    } catch (error) {
        console.error('Error during queue cleanup:', error);
        throw error;
    }
}
