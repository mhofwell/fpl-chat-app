import { Job } from 'bullmq';
import fetch from 'node-fetch';
import { config } from '../../config';
import { getJobContext } from '../../lib/context-provider';

export async function liveRefreshProcessor(job: Job) {
    try {
        const originalJobData = { ...(job.data || {}) };

        console.log(`[JOB-INFO] Job ${job.id} in ${job.name}. Fetching full context from provider...`);
        const freshContext = await getJobContext(job.name, originalJobData.triggeredBy || 'system_processor_default');
        
        const timestamp = originalJobData.timestamp || freshContext.timestamp; 
        const triggeredBy = originalJobData.triggeredBy || freshContext.triggeredBy; 
        const queueName = job.name; 

        const gameweek = (originalJobData.gameweek !== undefined && originalJobData.gameweek !== null)
                         ? originalJobData.gameweek
                         : freshContext.gameweek;
        const isMatchDay = (originalJobData.isMatchDay !== undefined)
                           ? originalJobData.isMatchDay
                           : freshContext.isMatchDay;
        
        const refreshType = freshContext.refreshType; 
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

        const queryParams = new URLSearchParams();
        if (gameweek) queryParams.append('gameweek', gameweek.toString());
        if (refreshType) queryParams.append('type', refreshType);
        if (triggeredBy) queryParams.append('source', triggeredBy);
        if (isMatchDay) queryParams.append('matchDay', isMatchDay.toString());
        queryParams.append('family', '0'); 
        
        const apiEndpoint = `${config.nextApp.url}/api/cron/sync-fpl/live-updates?${queryParams}`;

        console.log(`[API-CALL] Calling live refresh endpoint at ${apiEndpoint}`);
        
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
                timestamp, 
                processingStarted: Date.now()
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const resultData = await response.json();
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
        const queueName = typeof job.data === 'object' && job.data !== null && job.data.queueName ? job.data.queueName : job.name || 'live-refresh';
        console.error(`[JOB-ERROR] Error in ${queueName} processor for job ${job.id}:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            jobData: job.data || {},
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}
