import dotenv from 'dotenv';
import { addJobToQueue } from './queue-client.js';
dotenv.config();

console.log(`[CRON-START] Starting FPL daily refresh scheduler at ${new Date().toISOString()}`);

// Add the daily refresh job to the queue
(async () => {
  try {
    console.log('[CRON-JOB] Adding daily refresh job to queue');
    
    // Enhanced job data without family:0
    const result = await addJobToQueue('daily-refresh', {
      triggeredBy: 'daily-cron-schedule',
    });
    
    console.log('[CRON-JOB] Daily refresh job added to queue:', result);
  } catch (error) {
    console.error('[CRON-ERROR] Error scheduling daily refresh job:', error);
    process.exit(1); // Exit with error code
  }
  console.log('[CRON-COMPLETE] Daily refresh job scheduling complete');
})();