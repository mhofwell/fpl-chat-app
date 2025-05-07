import { Job } from 'bullmq';
import fetch from 'node-fetch';
import { config } from '../../config';

export async function postMatchRefreshProcessor(job: Job) {
    try {
        console.log(`Processing post-match refresh job ${job.id}`);
        console.log('Job data:', JSON.stringify(job.data));
        // Call the API endpoint that contains the execution logic
        const apiEndpoint = `${config.nextApp.url}/api/cron/sync-fpl/post-match?family=0`;

        console.log(`Calling post-match refresh endpoint at ${apiEndpoint}`);
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
        console.log('Post-match refresh completed:', result);

        return result;
    } catch (error) {
        console.error('Error in post-match refresh processor:', error);
        throw error;
    }
}
