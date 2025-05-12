import { Job } from 'bullmq';
import fetch from 'node-fetch'; // Or your preferred HTTP client
import { config } from '../../config'; // Assuming this correctly points to your combined config
import { getJobContext } from '../../lib/context-provider'; // Assuming this path

export async function preDeadlineRefreshProcessor(job: Job) {
    try {
        const originalJobData = { ...(job.data || {}) };

        console.log(`[JOB-INFO] Job ${job.id} in ${job.name}. Fetching full context from provider...`);
        // For pre-deadline, specific context fetching might not be as critical as the API endpoint itself checks the window.
        // However, maintaining the pattern for logging and consistency is good.
        const freshContext = await getJobContext(job.name, originalJobData.triggeredBy || 'system_processor_pre_deadline');
        
        const timestamp = originalJobData.timestamp || freshContext.timestamp;
        const triggeredBy = originalJobData.triggeredBy || freshContext.triggeredBy;
        const queueName = job.name; // Should be 'pre-deadline-refresh'

        // Contextual fields that might be passed or determined by getJobContext
        const gameweek = (originalJobData.gameweek !== undefined && originalJobData.gameweek !== null)
                         ? originalJobData.gameweek
                         : freshContext.gameweek;
        // isMatchDay might be less relevant here, but good to keep pattern
        const isMatchDay = (originalJobData.isMatchDay !== undefined)
                           ? originalJobData.isMatchDay
                           : freshContext.isMatchDay;
        
        const refreshType = freshContext.refreshType || 'pre-deadline'; // Explicitly this type
        const lastRefreshTime = freshContext.lastRefreshTime;

        console.log(`[JOB-START] Processing ${queueName} job ${job.id}`, {
            refreshType,
            gameweek,
            lastRefreshTime,
            triggeredBy,
            isMatchDay,
            jobTimestamp: new Date(timestamp).toISOString(),
            processingStarted: new Date().toISOString()
        });

        // The API endpoint for pre-deadline refresh doesn't strictly need many query params
        // as it primarily checks isPreDeadlineWindow itself.
        // However, sending some standard ones for logging/consistency is fine.
        const queryParams = new URLSearchParams();
        if (gameweek) queryParams.append('gameweek', gameweek.toString());
        queryParams.append('type', refreshType); // Send 'pre-deadline'
        if (triggeredBy) queryParams.append('source', triggeredBy);
        
        const apiEndpoint = `${config.nextApp.url}/api/cron/sync-fpl/pre-deadline?${queryParams.toString()}`;

        console.log(`[API-CALL] Calling pre-deadline refresh endpoint at ${apiEndpoint}`);
        
        const response = await fetch(apiEndpoint, {
            method: 'POST', // The API route for pre-deadline was set up for POST
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.cron.secret}`,
                'X-Job-ID': (job.id ?? 'unknown').toString(),
                'X-Queue-Name': queueName
            },
            // Body can be minimal as the API endpoint drives logic based on its internal checks
            body: JSON.stringify({
                jobId: job.id,
                triggeredBy,
                timestamp, // Original job enqueued time
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[API-ERROR-DETAIL] Job ${job.id} received status ${response.status} from ${apiEndpoint}. Response: ${errorText}`);
            throw new Error(`HTTP error! Status: ${response.status}. Body: ${errorText}`);
        }

        const result = await response.json();
        
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
        const queueName = job.name || 'pre-deadline-refresh'; // Use job.name as fallback
        console.error(`[JOB-ERROR] Error in ${queueName} processor for job ${job.id}:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            jobData: job.data || {}, // Log original data or empty object
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}
