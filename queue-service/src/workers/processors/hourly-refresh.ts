import { Job } from 'bullmq';
import fetch from 'node-fetch';
import { config } from '../../config';

export async function hourlyRefreshProcessor(job: Job) {
    try {
        console.log(`Processing hourly refresh job ${job.id}`);
        console.log('Job data:', JSON.stringify(job.data));

        // Call the API endpoint that contains the execution logic
        const apiEndpoint = `${config.nextApp.url}/api/cron/sync-fpl/hourly?family=0`;

        console.log(`Calling hourly refresh endpoint at ${apiEndpoint}`);
        let responseText;

        try {
            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.cron.secret}`,
                },
            });

            console.log(
                `Response status from hourly endpoint: ${response.status}`
            );
            responseText = await response.text();

            if (!response.ok) {
                throw new Error(
                    `HTTP error! Status: ${response.status}, Response: ${responseText}`
                );
            }

            const result = JSON.parse(responseText);
            console.log('Hourly refresh completed:', result);
            return result;
        } catch (fetchError) {
            console.error('Fetch error in hourly refresh:', fetchError);
            console.error('Response text if available:', responseText);
            throw fetchError;
        }
    } catch (error) {
        console.error('Error in hourly refresh processor:', error);
        throw error;
    }
}
