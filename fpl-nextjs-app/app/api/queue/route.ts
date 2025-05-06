import { NextRequest, NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import redis from '@/lib/redis/redis-client';
import { checkCronSecret } from '@/lib/cron/cron-auth';

// Create Redis connection
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Define the queues - one for each job type
const queues = {
    'daily-refresh': new Queue('daily-refresh', { connection: redis }),
    'hourly-refresh': new Queue('hourly-refresh', { connection: redis }),
    'live-refresh': new Queue('live-refresh', { connection: redis }),
    'post-match-refresh': new Queue('post-match-refresh', {
        connection: redis,
    }),
    'schedule-update': new Queue('schedule-update', { connection: redis }),
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

    try {
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
