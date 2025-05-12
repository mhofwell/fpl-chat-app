import { Job } from 'bullmq';
import fetch from 'node-fetch';
import { config } from '../../config';
import { getJobContext } from '../../lib/context-provider';

export async function dailyRefreshProcessor(job: Job) {
    try {
        // Ensure job.data is treated as an object, provide empty object fallback
        const originalJobData = { ...(job.data || {}) }; // Keep a copy of the original data

        console.log(`[JOB-INFO] Job ${job.id} in ${job.name}. Fetching full context from provider...`);
        // Get the fresh context. Pass the original triggeredBy if available.
        const freshContext = await getJobContext(job.name, originalJobData.triggeredBy || 'system_processor_default');
        
        // --- Combine original job data with fresh context ---
        // Essential fields from the original job or job object itself:
        const timestamp = originalJobData.timestamp || freshContext.timestamp; // Prefer original job creation timestamp
        const triggeredBy = originalJobData.triggeredBy || freshContext.triggeredBy; // Prefer original trigger
        const queueName = job.name; // Always from the job object

        // Contextual fields: prioritize explicit values from original job data if they exist,
        // otherwise use values from the fresh context.
        const gameweek = (originalJobData.gameweek !== undefined && originalJobData.gameweek !== null)
                         ? originalJobData.gameweek
                         : freshContext.gameweek;
        const isMatchDay = (originalJobData.isMatchDay !== undefined)
                           ? originalJobData.isMatchDay
                           : freshContext.isMatchDay;
        
        // Fields typically best determined by getJobContext based on queueName and current state:
        const refreshType = freshContext.refreshType;
        const lastRefreshTime = freshContext.lastRefreshTime;
        // const priority = freshContext.priority; // If needed later by API

        // Enhanced structured logging with the fully resolved context
        console.log(`[JOB-START] Processing ${queueName} job ${job.id}`, {
            refreshType,
            gameweek,
            lastRefreshTime,
            triggeredBy,
            isMatchDay,
            jobTimestamp: new Date(timestamp).toISOString(), // This is the original job enqueued time
            processingStarted: new Date().toISOString()    // This is when processing actually begins
        });

        // Build query parameters for API call using resolved variables
        const queryParams = new URLSearchParams();
        if (gameweek) queryParams.append('gameweek', gameweek.toString());
        if (refreshType) queryParams.append('type', refreshType);
        if (triggeredBy) queryParams.append('source', triggeredBy);
        if (isMatchDay) queryParams.append('matchDay', isMatchDay.toString());
        queryParams.append('family', '0'); 
        
        const apiEndpoint = `${config.nextApp.url}/api/cron/sync-fpl/daily?${queryParams}`;

        console.log(`[API-CALL] Calling daily refresh endpoint at ${apiEndpoint}`);
        
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.cron.secret}`,
                'X-Job-ID': (job.id ?? 'unknown').toString(),
                'X-Queue-Name': queueName
            },
            body: JSON.stringify({
                jobId: job.id,
                refreshType,
                gameweek,
                lastRefreshTime,
                triggeredBy,
                isMatchDay,
                timestamp, // Original job enqueued time
                processingStarted: Date.now()
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const resultData = await response.json();
        // Ensure result is an object before spreading, default to empty object if not
        const result = (typeof resultData === 'object' && resultData !== null) ? resultData : {};
        
        const enhancedResult = {
            ...result,
            jobContext: {
                id: job.id,
                refreshType,
                gameweek,
                lastRefreshTime,
                triggeredBy,
                isMatchDay,
                queueName
            },
            timing: {
                queuedAt: new Date(timestamp).toISOString(),
                processedAt: new Date().toISOString(),
                processingDuration: Date.now() - timestamp 
            }
        };
        
        console.log(`[JOB-COMPLETE] ${queueName} job ${job.id} completed:`, enhancedResult);
        return enhancedResult;

    } catch (error) {
        // Also ensure safety when accessing job.data here
        const queueName = typeof job.data === 'object' && job.data !== null && job.data.queueName ? job.data.queueName : 'daily-refresh';
        console.error(`[JOB-ERROR] Error in ${queueName} processor for job ${job.id}:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            jobData: job.data || {}, // Log original data or empty object
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}
