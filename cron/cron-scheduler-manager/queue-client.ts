import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
const BASE_URL =
    process.env.NEXT_CLIENT_PRIVATE_URL || 'localhost';
const APP_URL = `http://${BASE_URL}:${NEXT_CLIENT_PORT}`;
const QUEUE_API_ENDPOINT = `${APP_URL}/api/queue?family=0`;
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Adds a job to the BullMQ queue via the API
 */
export async function addJobToQueue(
    jobType: string,
    data: Record<string, any> = {},
    options: Record<string, any> = {}
): Promise<any> {
    try {
        console.log(
            `Adding ${jobType} job to queue at ${new Date().toISOString()}`
        );

        const response = await fetch(`${QUEUE_API_ENDPOINT}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${CRON_SECRET}`,
            },
            body: JSON.stringify({
                jobType,
                data,
                options,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json() as { id: string };
        console.log(`Job added to queue: ${result.id}`);
        return result;
    } catch (error) {
        console.error(`Error adding ${jobType} job to queue:`, error);
        throw error;
    }
}
