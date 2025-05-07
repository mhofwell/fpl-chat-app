import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
const BASE_URL = process.env.NEXT_CLIENT_PRIVATE_URL || 'localhost';
const APP_URL = `http://${BASE_URL}:${NEXT_CLIENT_PORT}`;
const QUEUE_API_ENDPOINT = `${APP_URL}/api/queue?family=0`;
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
        
        // Create job data with the enhanced structure
        const data = {
            ...additionalData,
            triggeredBy: additionalData.triggeredBy || 'cron-schedule',
            timestamp: Date.now()
        };
        
        // Keep the original request structure that the Next.js endpoint expects
        const response = await fetch(`${QUEUE_API_ENDPOINT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${CRON_SECRET}`,
            },
            body: JSON.stringify({
                jobType,
                data,
                options: additionalOptions,
            }),
        });

        if (!response.ok) {
            throw new Error(`[CRON-ERROR] HTTP error adding job! Status: ${response.status}`);
        }

        const result = await response.json() as { id: string; name: string; status: string };
        console.log(`[CRON-JOB] Job added to queue: ${result.id}`, { jobType, data });
        return {
            id: result.id,
            jobId: result.id,
            data
        };
    } catch (error) {
        console.error(`[CRON-ERROR] Error adding ${jobType} job to queue:`, error);
        throw error;
    }
}