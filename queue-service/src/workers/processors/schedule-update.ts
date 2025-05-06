import { Job } from 'bullmq';
import fetch from 'node-fetch';

const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
const BASE_URL =
    process.env.NEXT_CLIENT_PRIVATE_URL || 'fpl-mcp-chat.railway.internal';
const APP_URL = `http://${BASE_URL}:${NEXT_CLIENT_PORT}`;
const CRON_SECRET = process.env.CRON_SECRET;

export async function scheduleUpdateProcessor(job: Job) {
    try {
        console.log(`Processing schedule update job ${job.id}`);

        // Call the API endpoint that contains the execution logic
        const apiEndpoint = `${APP_URL}/api/cron/schedule/update`;

        console.log(`Calling schedule update endpoint at ${apiEndpoint}`);
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${CRON_SECRET}`,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Schedule update completed:', result);

        return result;
    } catch (error) {
        console.error('Error in schedule update processor:', error);
        throw error;
    }
}
