import dotenv from 'dotenv';
import { addJobToQueue } from './queue-client.js';
dotenv.config();

const JOB_NAME = 'pre-deadline-refresh';
const TRIGGERED_BY = 'cron-pre-deadline-scheduler';

console.log(
    `[CRON-START] Starting FPL Pre-Deadline Refresh Scheduler at ${new Date().toISOString()}`
);

(async () => {
    try {
        console.log(`[CRON-JOB] Adding ${JOB_NAME} job to its queue.`);

        const jobData = {
            triggeredBy: TRIGGERED_BY,
            timestamp: Date.now(), // Add a timestamp for when the job was created
        };

        const result = await addJobToQueue(JOB_NAME, jobData);

        console.log(`[CRON-JOB] ${JOB_NAME} job added to queue:`, {
            jobId: result.id,
            jobName: result.name,
            data: result.data,
        });
    } catch (error) {
        console.error(`[CRON-ERROR] Error scheduling ${JOB_NAME} job:`, error);
        process.exit(1); // Exit with error code
    }
    console.log(`[CRON-COMPLETE] ${JOB_NAME} job scheduling attempt complete.`);
})();
