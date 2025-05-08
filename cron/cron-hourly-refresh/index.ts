import dotenv from 'dotenv';
import { addJobToQueue } from './queue-client.js';
dotenv.config();

console.log(`[CRON-START] Starting FPL hourly refresh scheduler at ${new Date().toISOString()}`);

// Add the hourly refresh job to the queue
(async () => {
  try {
    console.log('[CRON-JOB] Adding hourly refresh job to queue');
    
    // Enhanced job data without family:0
    const result = await addJobToQueue('hourly-refresh', {
      triggeredBy: 'hourly-cron-schedule',
    });
    
    console.log('[CRON-JOB] Hourly refresh job added to queue:', result);
  } catch (error) {
    console.error('[CRON-ERROR] Error scheduling hourly refresh job:', error);
    process.exit(1); // Exit with error code
  }
  console.log('[CRON-COMPLETE] Hourly refresh job scheduling complete');
})(); 