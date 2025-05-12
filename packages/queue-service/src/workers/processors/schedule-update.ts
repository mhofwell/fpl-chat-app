import { Job } from 'bullmq';
import fetch from 'node-fetch';
import { config } from '../../config';
import { getJobContext } from '../../lib/context-provider';

export async function scheduleUpdateProcessor(job: Job) {
    try {
        const originalJobData = { ...(job.data || {}) };

        console.log(`[JOB-INFO] Job ${job.id} in ${job.name} received with data:`, originalJobData);

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

        const windowsToSchedule = originalJobData.windows;

        if (!Array.isArray(windowsToSchedule) || windowsToSchedule.length === 0) {
            console.error(`[JOB-ERROR] Job ${job.id} (${job.name}) is missing 'windows' data in its payload, or 'windows' is empty. This data is now expected from the cron-scheduler-manager.`);
            throw new Error("Job data from cron-scheduler-manager must contain a non-empty 'windows' array.");
        }

        console.log(`[JOB-START] Processing ${queueName} job ${job.id}`, {
            gameweek, 
            triggeredBy,
            isMatchDay, 
            jobTimestamp: new Date(timestamp).toISOString(),
            processingStarted: new Date().toISOString(),
            numberOfWindows: windowsToSchedule.length
        });

        const queryParams = new URLSearchParams();
        if (freshContext.refreshType) queryParams.append('type', freshContext.refreshType); 
        if (triggeredBy) queryParams.append('source', triggeredBy);
        
        const apiEndpoint = `${config.nextApp.url}/api/cron/schedule/update?${queryParams}`;

        console.log(`[API-CALL] Calling schedule update endpoint at ${apiEndpoint} with ${windowsToSchedule.length} windows.`);
        
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.cron.secret}`,
                'X-Job-ID': (job.id ?? 'unknown').toString(),
                'X-Queue-Name': queueName
            },
            body: JSON.stringify({ 
                windows: windowsToSchedule 
            })
        });

        if (!response.ok) {
            let errorBody = 'Could not retrieve error body';
            try {
                errorBody = await response.text(); 
            } catch (e) {
                console.error(`[API-ERROR-BODY] Failed to parse error response body for job ${job.id}:`, e);
            }
            console.error(`[API-ERROR-DETAIL] Job ${job.id} received status ${response.status} from ${apiEndpoint}. Response: ${errorBody}`);
            throw new Error(`HTTP error! Status: ${response.status}. Body: ${errorBody}`);
        }

        const resultData = await response.json();
        const result = (typeof resultData === 'object' && resultData !== null) ? resultData : {};
        
        const enhancedResult = {
            ...result, 
            jobContext: { 
                id: job.id,
                refreshType: freshContext.refreshType,
                gameweek,
                lastRefreshTime: freshContext.lastRefreshTime,
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
        const queueName = typeof job.data === 'object' && job.data !== null && job.data.queueName ? job.data.queueName : job.name || 'schedule-update';
        console.error(`[JOB-ERROR] Error in ${queueName} processor for job ${job.id}:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            jobData: job.data || {},
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}
