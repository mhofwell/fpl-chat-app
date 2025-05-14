import { QUEUE_NAMES } from '../config/queue-config';
import supabase from './supabase';

// Priority mapping based on job type
const JOB_PRIORITIES = {
  [QUEUE_NAMES.LIVE_REFRESH]: 1,
  [QUEUE_NAMES.POST_MATCH_REFRESH]: 2,
  [QUEUE_NAMES.DAILY_REFRESH]: 5,
  [QUEUE_NAMES.HOURLY_REFRESH]: 10,
  [QUEUE_NAMES.SCHEDULER_MANAGER]: 15,
};

// Refresh type mapping based on job type
const REFRESH_TYPES = {
  [QUEUE_NAMES.LIVE_REFRESH]: 'live',
  [QUEUE_NAMES.POST_MATCH_REFRESH]: 'post-match',
  [QUEUE_NAMES.DAILY_REFRESH]: 'full',
  [QUEUE_NAMES.HOURLY_REFRESH]: 'incremental',
  [QUEUE_NAMES.SCHEDULER_MANAGER]: 'schedule',
};

// Get current gameweek from database with error handling
async function getCurrentGameweek() {
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('gameweeks')
      .select('id')
      .lt('deadline_time', now) // Find gameweeks whose deadline has passed
      .order('deadline_time', { ascending: false }) // Get the most recent one
      .limit(1)
      .maybeSingle(); // Handles no rows found by returning data as null

    if (error) {
      // If error is present here, it's an actual database error,
      // as maybeSingle() handles "no rows" by returning data: null.
      console.error('Error fetching current gameweek from gameweeks table:', error);
      throw error; // Re-throw to be caught by the outer catch block
    }

    if (!data) {
      console.info('No gameweek found with a deadline_time in the past. This could be pre-season or a fresh setup.');
      return null;
    }

    return data.id; // data.id is already an integer
  } catch (error) {
    console.error('Failed to determine current gameweek:', error);
    // We're in the off-season, so return null
    return null;
  }
}

// Get last refresh time for a specific job type
async function getLastRefreshTime(jobType: string) {
  try {
    // Use .maybeSingle() instead of .single() to avoid error when no rows found
    // Look for any successful state, not just 'completed'
    const successStates = ['completed', 'regular', 'live-match', 'post-match', 'pre-deadline', 'full_success', 'manual_success'];
    
    const { data, error } = await supabase
      .from('refresh_logs')
      .select('created_at')
      .eq('type', jobType)
      .in('state', successStates)  // Look for any successful state
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (typeof error === 'object' && error && 'code' in error && error.code === 'PGRST116') {
      console.info(`No previous successful refresh logs found for ${jobType}. This is expected for a fresh setup.`);
    } else if (error) {
      console.error(`Error fetching last refresh time for ${jobType}:`, error);
    }
    
    return data ? data.created_at : null;
  } catch (error) {
    // Only log as error if it's not the expected "no rows" error
    if (typeof error === 'object' && error && 'code' in error && error.code === 'PGRST116') {
      console.info(`No previous successful refresh logs found for ${jobType}. This is expected for a fresh setup.`);
    } else if (error) {
      console.error(`Error fetching last refresh time for ${jobType}:`, error);
    }
    return null;
  }
}

// Check if it's currently a match day
async function isMatchDay() {
  try {
    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format
    
    const { count, error } = await supabase
      .from('fixtures')
      .select('id', { count: 'exact' })
      .eq('finished', false)
      .gte('kickoff_time', `${today}T00:00:00Z`)
      .lte('kickoff_time', `${today}T23:59:59Z`);
    
    if (error) throw error;
    
    return count !== null && count > 0;
  } catch (error) {
    console.error('Error checking match day status:', error);
    return false;
  }
}

// Main function to get job context with better error handling
export async function getJobContext(queueName: string, source: string = 'schedule') {
  try {
    // Run all database queries in parallel for performance
    const [matchDay, currentGameweek, lastRefreshTime] = await Promise.all([
      isMatchDay().catch(() => false),
      getCurrentGameweek().catch(() => null),
      getLastRefreshTime(queueName).catch(() => null)
    ]);
    
    let priority = JOB_PRIORITIES[queueName] || 10;
    
    // Boost priority during match days
    if (matchDay && (queueName === QUEUE_NAMES.LIVE_REFRESH || queueName === QUEUE_NAMES.POST_MATCH_REFRESH)) {
      priority = Math.max(1, priority - 1);
    }
    
    return {
      refreshType: REFRESH_TYPES[queueName] || 'incremental',
      gameweek: currentGameweek,
      lastRefreshTime,
      triggeredBy: source,
      priority,
      timestamp: Date.now(),
      isMatchDay: matchDay,
      queueName  // Include the queue name for reference
    };
  } catch (error) {
    console.error('Error getting job context, using fallback values:', error);
    
    // Provide fallback values when there are errors
    return {
      refreshType: REFRESH_TYPES[queueName] || 'incremental',
      gameweek: null,
      lastRefreshTime: null,
      triggeredBy: source,
      priority: JOB_PRIORITIES[queueName] || 10,
      timestamp: Date.now(),
      isMatchDay: false,
      queueName,
      error: 'Failed to fetch complete context'
    };
  }
}
