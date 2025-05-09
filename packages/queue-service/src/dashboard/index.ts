import express from 'express';
import path from 'path';
import { getQueue } from '../queues';
import { QUEUE_NAMES } from '../config/queue-config';

const router = express.Router();

// Dashboard home page
router.get('/', async (req, res) => {
    const queues = Object.values(QUEUE_NAMES);
    const queueStats = [];

    // Get basic stats for each queue
    for (const queueName of queues) {
        const queue = getQueue(queueName);
        if (queue) {
            const jobCounts = await queue.getJobCounts();
            queueStats.push({
                name: queueName,
                counts: jobCounts,
            });
        }
    }

    res.render('dashboard/index', {
        title: 'Queue Dashboard',
        queues: queueStats,
    });
});

// Queue details page
router.get('/queue/:queueName', async (req, res) => {
    const { queueName } = req.params;

    // Validate queue name
    if (!Object.values(QUEUE_NAMES).includes(queueName)) {
        return res.status(404).render('dashboard/error', {
            title: 'Error',
            message: 'Queue not found',
        });
    }

    const queue = getQueue(queueName);
    if (!queue) {
        return res.status(500).render('dashboard/error', {
            title: 'Error',
            message: 'Queue not initialized',
        });
    }

    try {
        // Get queue metrics - add stalled and delayed jobs
        const [jobCounts, activeJobs, waitingJobs, completedJobs, failedJobs, stalledJobs, delayedJobs] =
            await Promise.all([
                queue.getJobCounts(),
                queue.getJobs(['active'], 0, 10),
                queue.getJobs(['waiting'], 0, 10),
                queue.getJobs(['completed'], 0, 10),
                queue.getJobs(['failed'], 0, 10),
                queue.getJobs(['waiting'], 0, 10).then(jobs => jobs.filter(job => job.isFailed())),
                queue.getJobs(['delayed'], 0, 10)
            ]);

        res.render('dashboard/queue-details', {
            title: `Queue: ${queueName}`,
            queueName,
            jobCounts,
            jobs: {
                active: activeJobs,
                waiting: waitingJobs,
                completed: completedJobs,
                failed: failedJobs,
                stalled: stalledJobs,
                delayed: delayedJobs
            },
        });
    } catch (error) {
        console.error(`Error getting queue status for ${queueName}:`, error);
        res.status(500).render('dashboard/error', {
            title: 'Error',
            message: 'Failed to get queue status',
        });
    }
});

// Job management - Retry failed job
router.post('/job/:jobId/retry', async (req, res) => {
    const { jobId } = req.params;
    const { queueName } = req.body;

    if (!jobId || !queueName) {
        return res
            .status(400)
            .json({ error: 'Job ID and queue name are required' });
    }

    const queue = getQueue(queueName);
    if (!queue) {
        return res.status(500).json({ error: 'Queue not initialized' });
    }

    try {
        const job = await queue.getJob(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        await job.retry();
        res.json({ success: true, message: 'Job retry initiated' });
    } catch (error) {
        console.error(`Error retrying job ${jobId}:`, error);
        res.status(500).json({ error: 'Failed to retry job' });
    }
});

// Job management - Remove job
router.delete('/job/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const { queueName } = req.body;

    if (!jobId || !queueName) {
        return res
            .status(400)
            .json({ error: 'Job ID and queue name are required' });
    }

    const queue = getQueue(queueName);
    if (!queue) {
        return res.status(500).json({ error: 'Queue not initialized' });
    }

    try {
        const job = await queue.getJob(jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        await job.remove();
        res.json({ success: true, message: 'Job removed' });
    } catch (error) {
        console.error(`Error removing job ${jobId}:`, error);
        res.status(500).json({ error: 'Failed to remove job' });
    }
});

// Job management - Create new job
router.post('/queue/:queueName/add-job', async (req, res) => {
    const { queueName } = req.params;
    const { data, options } = req.body;

    // Validate queue name
    if (!Object.values(QUEUE_NAMES).includes(queueName)) {
        return res.status(400).json({ error: 'Invalid queue name' });
    }

    const queue = getQueue(queueName);
    if (!queue) {
        return res.status(500).json({ error: 'Queue not initialized' });
    }

    try {
        const job = await queue.add(queueName, data, options);
        res.json({
            success: true,
            jobId: job.id,
            message: 'Job added successfully',
        });
    } catch (error) {
        console.error(`Error adding job to queue ${queueName}:`, error);
        res.status(500).json({ error: 'Failed to add job' });
    }
});

// Job management - Clean stalled jobs
router.post('/queue/:queueName/clean-stalled', async (req, res) => {
    const { queueName } = req.params;

    // Validate queue name
    if (!Object.values(QUEUE_NAMES).includes(queueName)) {
        return res.status(400).json({ error: 'Invalid queue name' });
    }

    const queue = getQueue(queueName);
    if (!queue) {
        return res.status(500).json({ error: 'Queue not initialized' });
    }

    try {
        // Get all stalled jobs
        const stalledJobs = await queue.getJobs(['waiting'], 0, 100).then(jobs => jobs.filter(job => job.isFailed()));
        
        // Remove or retry them
        const promises = stalledJobs.map(job => job.retry());
        await Promise.all(promises);
        
        res.json({
            success: true,
            count: stalledJobs.length,
            message: `Retried ${stalledJobs.length} stalled jobs`
        });
    } catch (error) {
        console.error(`Error cleaning stalled jobs in queue ${queueName}:`, error);
        res.status(500).json({ error: 'Failed to clean stalled jobs' });
    }
});

export default router;
