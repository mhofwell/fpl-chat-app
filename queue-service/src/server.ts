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
import { getJobContext } from './lib/context-provider';

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
    console.log('[STARTUP] Adding enhanced test job to verify queue functionality');
    
    // Get dynamic context for test job
    getJobContext(QUEUE_NAMES.DAILY_REFRESH, 'system-startup')
        .then(context => {
            console.log('[STARTUP] Generated context for test job:', context);
            
            // Extract priority for job options
            const { priority, ...jobData } = context;
            
            return testQueue.add('test-job', jobData, { 
                priority,
                // Add job options for cleanup
                removeOnComplete: 100,
                removeOnFail: 100
            });
        })
        .then((job) => console.log(`[STARTUP] Test job added with ID: ${job.id} and data:`, job.data))
        .catch((err) => console.error('[STARTUP-ERROR] Failed to add test job:', err));
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
app.get('/redis/keys/:pattern', async (req, res) => {
    try {
        const { pattern } = req.params;
        const keys = await redis.keys(pattern);

        // For each key, get the type and TTL
        const keysWithDetails = await Promise.all(
            keys.map(async (key) => {
                const type = await redis.type(key);
                const ttl = await redis.ttl(key);
                return { key, type, ttl };
            })
        );

        res.json({
            count: keys.length,
            keys: keysWithDetails,
        });
    } catch (error) {
        console.error('Error searching Redis keys:', error);
        res.status(500).json({ error: 'Failed to search Redis keys' });
    }
});

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

                // Enhanced job mapping function with consistent format
                const mapJobData = (j: any) => ({
                    id: j.id,
                    data: j.data,
                    timestamp: j.timestamp,
                    added: new Date(j.timestamp).toISOString(),
                    // Add enhanced fields for better debugging
                    refreshType: j.data?.refreshType || 'unknown',
                    triggeredBy: j.data?.triggeredBy || 'unknown',
                    jobContext: {
                        gameweek: j.data?.gameweek,
                        isMatchDay: j.data?.isMatchDay,
                        lastRefreshTime: j.data?.lastRefreshTime
                    }
                });

                queueStats[queueName] = {
                    counts,
                    jobs: {
                        waiting: waiting.map(mapJobData),
                        active: active.map(mapJobData),
                        completed: completed.map(mapJobData),
                        failed: failed.map((j) => ({
                            ...mapJobData(j),
                            failedReason: j.failedReason
                        })),
                    },
                };
            }
        }

        res.json({ queues: queueStats });
    } catch (error) {
        console.error('[DEBUG-ERROR] Error fetching queue debug info:', error);
        res.status(500).json({ error: 'Failed to fetch queue information' });
    }
});

// API to add a job to a queue
app.post('/queue/:queueName', verifyQueueSecret, async (req, res) => {
    const { queueName } = req.params;
    let { data = {}, options = {} } = req.body;

    // Validate queue name
    if (!Object.values(QUEUE_NAMES).includes(queueName)) {
        return res.status(400).json({ error: 'Invalid queue name' });
    }

    try {
        // Get dynamic context based on queue name
        const context = await getJobContext(
            queueName,
            data.triggeredBy || 'api-request'
        );

        // Merge provided data with context, allowing overrides
        data = {
            ...context,
            ...data,
            timestamp: Date.now(), // Always use the current timestamp
        };

        // Set priority in options if not already provided
        if (!options.priority && data.priority) {
            options.priority = data.priority;
            // Remove from data to avoid duplication
            delete data.priority;
        }

        const queue = getQueue(queueName);
        if (!queue) {
            return res.status(500).json({ error: 'Queue not initialized' });
        }

        // Add job to queue with enhanced data and options
        const job = await queue.add(queueName, data, options);

        res.json({
            success: true,
            jobId: job.id,
            queue: queueName,
            data, // Return the enhanced data for debugging
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

        // Enhanced job mapping function
        const mapJobData = (j: any) => ({
            id: j.id,
            data: {
                refreshType: j.data?.refreshType || 'unknown',
                gameweek: j.data?.gameweek,
                triggeredBy: j.data?.triggeredBy || 'unknown',
                isMatchDay: j.data?.isMatchDay,
                timestamp: j.data?.timestamp || j.timestamp
            },
            addedAt: new Date(j.timestamp).toISOString()
        });

        res.json({
            queueName,
            jobCounts,
            jobs: {
                active: activeJobs.map(mapJobData),
                waiting: waitingJobs.map(mapJobData),
                completed: completedJobs.map(mapJobData),
                failed: failedJobs.map(j => ({
                    ...mapJobData(j),
                    failedReason: j.failedReason
                }))
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`[API-ERROR] Error getting queue status for ${queueName}:`, error);
        res.status(500).json({ error: 'Failed to get queue status' });
    }
});

// health check
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

// Add this near the other API routes
app.get('/context/:queueName', verifyQueueSecret, async (req, res) => {
    const { queueName } = req.params;
    const source = req.query.source || 'api-request';

    // Validate queue name
    if (!Object.values(QUEUE_NAMES).includes(queueName)) {
        return res.status(400).json({ error: 'Invalid queue name' });
    }

    try {
        const context = await getJobContext(queueName, source as string);
        res.json(context);
    } catch (error) {
        console.error(`Error getting context for ${queueName}:`, error);
        res.status(500).json({ error: 'Failed to get job context' });
    }
});

app.get('/health/context', async (req, res) => {
    try {
        // Test context provider by getting a sample context
        const context = await getJobContext(QUEUE_NAMES.DAILY_REFRESH, 'health-check');
        
        // Check if we got essential fields
        const isValid = context && 
                        context.refreshType && 
                        typeof context.isMatchDay === 'boolean';
        
        if (isValid) {
            res.json({
                status: 'ok',
                context: {
                    refreshType: context.refreshType,
                    gameweek: context.gameweek,
                    isMatchDay: context.isMatchDay
                },
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('Invalid context received');
        }
    } catch (error) {
        console.error('[HEALTH] Context provider check failed:', error);
        res.status(500).json({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
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
            `Dashboard available at: https://${process.env.RAILWAY_PUBLIC_DOMAIN}/dashboard`
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
