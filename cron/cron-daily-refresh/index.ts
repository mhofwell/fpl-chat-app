import dotenv from 'dotenv';
import { addJobToQueue } from './queue-client.js';
dotenv.config();

console.log(`Starting FPL daily refresh scheduler at ${new Date().toISOString()}`);

// Add the daily refresh job to the queue instead of directly calling the API
(async () => {
  try {
    console.log('Adding daily refresh job to queue');
    
    const result = await addJobToQueue('daily-refresh', { family: 0 });
    console.log('Daily refresh job added to queue:', result);
  } catch (error) {
    console.error('Error scheduling daily refresh job:', error);
    process.exit(1); // Exit with error code
  }
  console.log('Daily refresh job scheduling complete');
})();