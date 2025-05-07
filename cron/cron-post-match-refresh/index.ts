import dotenv from 'dotenv';
import { addJobToQueue } from './queue-client.js';
dotenv.config();

console.log(`[CRON-START] Starting FPL post-match refresh scheduler at ${new Date().toISOString()}`);

// Check if we should run based on recently finished matches
async function shouldRunPostMatchRefresh() {
  try {
    // This would typically check for recently finished matches in the database
    // For now, we'll just return true to ensure it runs
    return true;
  } catch (error) {
    console.error('[CRON-ERROR] Error checking if post-match refresh should run:', error);
    return true; // Default to running if check fails
  }
}

// Add the post-match refresh job to the queue
(async () => {
  try {
    // Check if we should run based on recently finished matches
    const shouldRun = await shouldRunPostMatchRefresh();
    
    if (shouldRun) {
      console.log('[CRON-JOB] Adding post-match refresh job to queue');
      
      // Enhanced job data without family:0
      const result = await addJobToQueue('post-match-refresh', {
        triggeredBy: 'post-match-cron-schedule',
        refreshType: 'post-match'
      });
      
      console.log('[CRON-JOB] Post-match refresh job added to queue:', result);
    } else {
      console.log('[CRON-SKIP] No recently finished matches, skipping post-match refresh');
    }
  } catch (error) {
    console.error('[CRON-ERROR] Error scheduling post-match refresh job:', error);
    process.exit(1); // Exit with error code
  }
  console.log('[CRON-COMPLETE] Post-match refresh job scheduling complete');
})(); 