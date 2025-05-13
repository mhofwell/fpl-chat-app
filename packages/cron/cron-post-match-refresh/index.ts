import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { addJobToQueue } from './queue-client.js';
dotenv.config();

console.log(`[CRON-START] Starting FPL post-match refresh scheduler at ${new Date().toISOString()}`);

// Check if we should run based on recently finished matches by calling the schedule check API
async function shouldRunPostMatchRefresh() {
  try {
    const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
    const BASE_URL = process.env.NEXT_CLIENT_PRIVATE_URL || 'localhost';
    const APP_URL = `http://${BASE_URL}:${NEXT_CLIENT_PORT}`;
    const SCHEDULE_CHECK_ENDPOINT = `${APP_URL}/api/cron/schedule/check?jobType=post-match`;
    const CRON_SECRET = process.env.CRON_SECRET;

    console.log(`[CRON-CHECK] Checking schedule at ${SCHEDULE_CHECK_ENDPOINT}`);
    
    const response = await fetch(SCHEDULE_CHECK_ENDPOINT, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error from schedule check! Status: ${response.status}`);
    }

    const result = await response.json();
    
    // If schedule checking is disabled, we should run
    if (result.scheduleCheckingDisabled) {
      console.log('[CRON-CHECK] Schedule checking is disabled, proceeding with job');
      return true;
    }
    
    // Otherwise, check if we have an active window
    if (result.shouldRun) {
      console.log(`[CRON-CHECK] Found ${result.activeWindows?.length || 0} active windows, proceeding with job`);
    } else {
      console.log('[CRON-CHECK] No active windows found, skipping job');
    }
    
    return result.shouldRun;
  } catch (error) {
    console.error('[CRON-ERROR] Error checking if post-match refresh should run:', error);
    console.log('[CRON-ERROR] Defaulting to running the job due to schedule check error');
    return true; // Default to running if check fails for safety
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