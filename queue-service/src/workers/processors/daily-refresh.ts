import { Job } from 'bullmq';
import fetch from 'node-fetch';
import { config } from '../../config';

export async function dailyRefreshProcessor(job: Job) {
    try {
        console.log(`Processing daily refresh job ${job.id}`);
        console.log('Job data:', JSON.stringify(job.data));

        // Call the API endpoint that contains the execution logic
        const apiEndpoint = `${config.nextApp.url}/api/cron/sync-fpl/daily?family=0`;

        console.log(`Calling daily refresh endpoint at ${apiEndpoint}`);
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
        console.log('Daily refresh completed:', result);

        return result;
    } catch (error) {
        console.error('Error in daily refresh processor:', error);
        throw error;
    }
}
