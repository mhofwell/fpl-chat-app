import dotenv from 'dotenv';
import fetch from 'node-fetch';
dotenv.config();

const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
const BASE_URL = process.env.NEXT_CLIENT_PRIVATE_URL || 'fpl-mcp-chat.railway.internal';
const APP_URL = `http://${BASE_URL}:${NEXT_CLIENT_PORT}` || 'http://fpl-mcp-chat.railway.internal:3000';
const CRON_SECRET = process.env.CRON_SECRET;

export interface DynamicCronWindow {
  id: number;
  job_type: 'live-update' | 'post-match';
  start_time: string;
  end_time: string;
  match_ids: number[];
  created_at: string;
}

interface ScheduleCheckResponse {
  scheduleCheckingDisabled?: boolean;
  shouldRun?: boolean;
  activeWindows?: DynamicCronWindow[];
}

/**
 * Checks if current time falls within any active window for the specified job type
 */
export async function shouldRunCronJob(jobType: 'live-update' | 'post-match'): Promise<boolean> {
  try {
    // For hourly and daily jobs, always return true - they run on their regular schedule
    if (jobType !== 'live-update' && jobType !== 'post-match') {
      return true;
    }

    const scheduleEndpoint = `${APP_URL}/api/cron/schedule/check?jobType=${jobType}`;
    
    console.log(`Checking if job ${jobType} should run at ${new Date().toISOString()}`);
    console.log(`Calling schedule check endpoint: ${scheduleEndpoint}`);
    
    const response = await fetch(scheduleEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    });

    if (!response.ok) {
      console.warn(`Schedule check returned status ${response.status}, defaulting to run cron job`);
      return true; // Default to running the job if we can't check the schedule
    }

    const data = await response.json() as ScheduleCheckResponse;
    
    // If schedule checking is disabled or we get an explicit shouldRun response, use that
    if (data.scheduleCheckingDisabled || data.shouldRun !== undefined) {
      console.log(`Schedule check result: ${data.shouldRun ? 'should run' : 'skip'} (schedule checking ${data.scheduleCheckingDisabled ? 'disabled' : 'enabled'})`);
      return data.scheduleCheckingDisabled ? true : !!data.shouldRun;
    }
    
    // Check if we have any active windows
    const activeWindows = data.activeWindows || [];
    const shouldRun = activeWindows.length > 0;
    
    console.log(`Schedule check result: ${shouldRun ? 'should run' : 'skip'} (${activeWindows.length} active windows)`);
    if (shouldRun && activeWindows.length > 0) {
      const matches = activeWindows.map((window: any) => window.match_ids).flat();
      console.log(`Active matches: ${matches.join(', ')}`);
    }
    
    return shouldRun;
  } catch (error) {
    console.error('Error checking cron schedule:', error);
    return true; // Default to running the job if there's an error
  }
} 