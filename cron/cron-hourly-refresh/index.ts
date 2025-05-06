import dotenv from 'dotenv';
import { addJobToQueue } from './queue-client.js'; // Local copy of queue-client.ts
dotenv.config();

console.log(`Starting FPL hourly refresh scheduler at ${new Date().toISOString()}`);

// Add the hourly refresh job to the queue
(async () => {
  try {
    console.log('Adding hourly refresh job to queue');
    
    const result = await addJobToQueue('hourly-refresh', { family: 0 });
    console.log('Hourly refresh job added to queue:', result);
  } catch (error) {
    console.error('Error scheduling hourly refresh job:', error);
    process.exit(1); // Exit with error code
  }
  console.log('Hourly refresh job scheduling complete');
})(); 