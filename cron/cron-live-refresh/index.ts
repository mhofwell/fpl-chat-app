import dotenv from 'dotenv';
import { addJobToQueue } from './queue-client.js';
dotenv.config();

console.log(`[CRON-START] Starting FPL live refresh scheduler at ${new Date().toISOString()}`);

// Check if we should run based on match schedule
async function shouldRunLiveRefresh() {
  try {
    // This would typically check the match schedule in the database
    // For now, we'll just return true to ensure it runs
    return true;
  } catch (error) {
    console.error('[CRON-ERROR] Error checking if live refresh should run:', error);
    return true; // Default to running if check fails
  }
}

// Add the live refresh job to the queue
(async () => {
  try {
    // Check if we should run based on match schedule
    const shouldRun = await shouldRunLiveRefresh();
    
    if (shouldRun) {
      console.log('[CRON-JOB] Adding live refresh job to queue');
      
      // Enhanced job data without family:0
      const result = await addJobToQueue('live-refresh', {
        triggeredBy: 'live-cron-schedule',
        refreshType: 'live',
        isMatchDay: true // We assume this is true if shouldRun is true
      });
      
      console.log('[CRON-JOB] Live refresh job added to queue:', result);
    } else {
      console.log('[CRON-SKIP] No active matches, skipping live refresh');
    }
  } catch (error) {
    console.error('[CRON-ERROR] Error scheduling live refresh job:', error);
    process.exit(1); // Exit with error code
  }
  console.log('[CRON-COMPLETE] Live refresh job scheduling complete');
})();