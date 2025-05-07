import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
const BASE_URL =
    process.env.NEXT_CLIENT_PRIVATE_URL || 'localhost';
const APP_URL = `http://${BASE_URL}:${NEXT_CLIENT_PORT}`;
const QUEUE_API_ENDPOINT = `${APP_URL}/api/queue`;
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Adds a job to the BullMQ queue via the API
 */
export async function addJobToQueue(
    jobType: string,
    additionalData: Record<string, any> = {},
    additionalOptions: Record<string, any> = {}
): Promise<any> {
    try {
        console.log(`[CRON-JOB] Adding ${jobType} job to queue at ${new Date().toISOString()}`);
        
        // Create complete job data
        const jobData = {
            ...additionalData,
            triggeredBy: additionalData.triggeredBy || 'cron-schedule',
            timestamp: Date.now()
        };
        
        // Add the job with the enhanced data
        const jobResponse = await fetch(`${QUEUE_API_ENDPOINT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${CRON_SECRET}`,
            },
            body: JSON.stringify({
                queueName: jobType,
                data: jobData,
                options: additionalOptions
            }),
        });

        if (!jobResponse.ok) {
            throw new Error(`[CRON-ERROR] HTTP error adding job! Status: ${jobResponse.status}`);
        }

        const result = await jobResponse.json() as { jobId: string; data: Record<string, any> };
        console.log(`[CRON-JOB] Job added to queue: ${result.jobId}`, result.data);
        return result;
    } catch (error) {
        console.error(`[CRON-ERROR] Error adding ${jobType} job to queue:`, error);
        throw error;
    }
}
