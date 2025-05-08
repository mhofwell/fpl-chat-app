import { Job } from 'bullmq';
import fetch from 'node-fetch';
import { config } from '../../config';
import { getJobContext } from '../../lib/context-provider';

export async function scheduleUpdateProcessor(job: Job) {
    try {
        const originalJobData = { ...job.data };

        console.log(`[JOB-INFO] Job ${job.id} in ${job.name}. Fetching full context from provider...`);
        const freshContext = await getJobContext(job.name, originalJobData.triggeredBy || 'system_processor_default');
        
        const timestamp = originalJobData.timestamp || freshContext.timestamp;
        const triggeredBy = originalJobData.triggeredBy || freshContext.triggeredBy;
        const queueName = job.name;

        // schedule-update might not use gameweek or isMatchDay as primary inputs for its core task,
        // but they are good to have for consistent logging and context.
        const gameweek = (originalJobData.gameweek !== undefined && originalJobData.gameweek !== null)
                         ? originalJobData.gameweek
                         : freshContext.gameweek;
        const isMatchDay = (originalJobData.isMatchDay !== undefined)
                           ? originalJobData.isMatchDay
                           : freshContext.isMatchDay;
        
        const refreshType = freshContext.refreshType; // Should be 'schedule'
        const lastRefreshTime = freshContext.lastRefreshTime;

        console.log(`[JOB-START] Processing ${queueName} job ${job.id}`, {
            refreshType,
            gameweek, // For logging context
            lastRefreshTime,
            triggeredBy,
            isMatchDay, // For logging context
            jobTimestamp: new Date(timestamp).toISOString(),
            processingStarted: new Date().toISOString()
        });

        const queryParams = new URLSearchParams();
        // Schedule update might not need many query params, but include for consistency if API expects them
        if (refreshType) queryParams.append('type', refreshType); 
        if (triggeredBy) queryParams.append('source', triggeredBy);
        
        const apiEndpoint = `${config.nextApp.url}/api/cron/schedule/update?${queryParams}`;

        console.log(`[API-CALL] Calling schedule update endpoint at ${apiEndpoint}`);
        
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.cron.secret}`,
                'X-Job-ID': (job.id ?? 'unknown').toString(),
                'X-Queue-Name': queueName
            },
            body: JSON.stringify({ // Body might be simpler for schedule update
                jobId: job.id,
                refreshType,
                triggeredBy,
                timestamp,
                processingStarted: Date.now()
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = await response.json();
        
        const enhancedResult = {
            ...result,
            jobContext: { // Consistent job context structure
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
        console.error(`[JOB-ERROR] Error in ${job.data.queueName || job.name || 'schedule-update'} processor for job ${job.id}:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            jobData: job.data,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}
