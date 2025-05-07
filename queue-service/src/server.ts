// /Users/bigviking/Documents/GitHub/Projects/fpl-chat-app/queue-service/src/index.ts
import express from 'express';
import path from 'path';
import { initializeQueues, closeQueues, getQueue } from './queues';
import { initializeWorkers, closeWorkers } from './workers';
import { QUEUE_NAMES } from './config/queue-config';
import dotenv from 'dotenv';
import { config } from './config';
import dashboardRouter from './dashboard';
import redis from './lib/redis/redis-client';

// Initialize dotenv at the top
dotenv.config();

// Initialize the Express app
const app = express();
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Initialize queues and workers
initializeQueues();
initializeWorkers();

// Add to server.ts after initializing queues
const testQueue = getQueue(QUEUE_NAMES.DAILY_REFRESH);
if (testQueue) {
    console.log('Adding test job to verify queue functionality');
    testQueue
        .add('test-job', { test: true })
        .then((job) => console.log(`Test job added with ID: ${job.id}`))
        .catch((err) => console.error('Failed to add test job:', err));
}

// Middleware to verify API secret
const verifyQueueSecret = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) => {
    const queueSecret = req.headers['x-queue-secret'];

    if (!queueSecret || queueSecret !== config.api.secret) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
};

// Mount dashboard routes
app.use('/dashboard', dashboardRouter);

// API routes
app.get('/debug/queues', async (req, res) => {
    try {
        const queueStats: Record<string, any> = {};

        for (const queueName of Object.values(QUEUE_NAMES)) {
            const queue = getQueue(queueName);
            if (queue) {
                const [counts, waiting, active, completed, failed] =
                    await Promise.all([
                        queue.getJobCounts(),
                        queue.getJobs(['waiting'], 0, 100),
                        queue.getJobs(['active'], 0, 100),
                        queue.getJobs(['completed'], 0, 100),
                        queue.getJobs(['failed'], 0, 100),
                    ]);

                queueStats[queueName] = {
                    counts,
                    jobs: {
                        waiting: waiting.map((j) => ({
                            id: j.id,
                            data: j.data,
                            timestamp: j.timestamp,
                        })),
                        active: active.map((j) => ({
                            id: j.id,
                            data: j.data,
                            timestamp: j.timestamp,
                        })),
                        completed: completed.map((j) => ({
                            id: j.id,
                            data: j.data,
                            timestamp: j.timestamp,
                        })),
                        failed: failed.map((j) => ({
                            id: j.id,
                            data: j.data,
                            failedReason: j.failedReason,
                        })),
                    },
                };
            }
        }

        res.json({ queues: queueStats });
    } catch (error) {
        console.error('Error fetching queue debug info:', error);
        res.status(500).json({ error: 'Failed to fetch queue information' });
    }
});

// API to add a job to a queue
app.post('/queue/:queueName', verifyQueueSecret, async (req, res) => {
    const { queueName } = req.params;
    const { data, options } = req.body;

    // Validate queue name
    if (!Object.values(QUEUE_NAMES).includes(queueName)) {
        return res.status(400).json({ error: 'Invalid queue name' });
    }

    try {
        const queue = getQueue(queueName);
        if (!queue) {
            return res.status(500).json({ error: 'Queue not initialized' });
        }

        // Add job to queue
        const job = await queue.add(queueName, data, options);

        res.json({
            success: true,
            jobId: job.id,
            queue: queueName,
        });
    } catch (error) {
        console.error(`Error adding job to queue ${queueName}:`, error);
        res.status(500).json({ error: 'Failed to add job to queue' });
    }
});

// API to get queue status
app.get('/queue/:queueName/status', verifyQueueSecret, async (req, res) => {
    const { queueName } = req.params;

    // Validate queue name
    if (!Object.values(QUEUE_NAMES).includes(queueName)) {
        return res.status(400).json({ error: 'Invalid queue name' });
    }

    try {
        const queue = getQueue(queueName);
        if (!queue) {
            return res.status(500).json({ error: 'Queue not initialized' });
        }

        // Get queue metrics
        const [jobCounts, activeJobs, waitingJobs, completedJobs, failedJobs] =
            await Promise.all([
                queue.getJobCounts(),
                queue.getJobs(['active'], 0, 10),
                queue.getJobs(['waiting'], 0, 10),
                queue.getJobs(['completed'], 0, 10),
                queue.getJobs(['failed'], 0, 10),
            ]);

        res.json({
            queueName,
            jobCounts,
            jobs: {
                active: activeJobs,
                waiting: waitingJobs,
                completed: completedJobs,
                failed: failedJobs,
            },
        });
    } catch (error) {
        console.error(`Error getting queue status for ${queueName}:`, error);
        res.status(500).json({ error: 'Failed to get queue status' });
    }
});

// Add this near the other API routes
app.get('/health', async (req, res) => {
    try {
        // Test Redis connection
        await redis.ping();
        res.json({
            status: 'ok',
            redis: 'connected',
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({
            status: 'error',
            redis: 'disconnected',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
        });
    }
});

const configEnvironment = process.env.NODE_ENV || 'development';

// Start the server
const server = app.listen(config.api.port, () => {
    console.log(`Queue service running on port ${config.api.port}`);
    console.log(`Environment: ${config.environment}`);
    if (configEnvironment === 'development') {
        console.log(
            `Dashboard available at: http://localhost:${config.api.port}/dashboard`
        );
    } else {
        console.log(
            `Dashboard available at: ${process.env.RAILWAY_PUBLIC_DOMAIN}/dashboard`
        );
    }
});

// Handle graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown() {
    console.log('Shutting down gracefully...');

    // Close the HTTP server
    server.close(() => {
        console.log('HTTP server closed');
    });

    try {
        // Close workers and queues
        await closeWorkers();
        await closeQueues();

        console.log('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}
