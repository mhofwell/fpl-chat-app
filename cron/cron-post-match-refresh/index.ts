import dotenv from 'dotenv';
import { shouldRunCronJob } from './utils/schedule-helper.js';
import { addJobToQueue } from './queue-client.js'; // Local copy of queue-client.ts
dotenv.config();

console.log(`Starting FPL post-match refresh scheduler at ${new Date().toISOString()}`);

// Execute the post-match refresh
(async () => {
    try {
        // Check if we should run based on the current schedule
        const shouldRun = await shouldRunCronJob('post-match');
        if (!shouldRun) {
            console.log('No active post-match windows found, skipping refresh');
            process.exit(0); // Exit successfully without error
        }

        console.log('Adding post-match refresh job to queue');
        
        const result = await addJobToQueue('post-match-refresh', { family: 0 });
        console.log('Post-match refresh job added to queue:', result);
    } catch (error) {
        console.error('Error scheduling post-match refresh job:', error);
        process.exit(1); // Exit with error code
    }
    console.log('Post-match refresh job scheduling complete');
})(); 