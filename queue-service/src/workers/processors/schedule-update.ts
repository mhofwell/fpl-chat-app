import { Job } from 'bullmq';
import fetch from 'node-fetch';
import { config } from '../../config';

export async function scheduleUpdateProcessor(job: Job) {
    try {
        console.log(`Processing schedule update job ${job.id}`);
        console.log('Job data:', JSON.stringify(job.data));

        // Call the API endpoint that contains the execution logic
        const apiEndpoint = `${config.nextApp.url}/api/cron/schedule/update?family=0`;

        console.log(`Calling schedule update endpoint at ${apiEndpoint}`);
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.cron.secret}`,
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
