import { Job } from 'bullmq';
import fetch from 'node-fetch';
import { config } from '../../config';

export async function postMatchRefreshProcessor(job: Job) {
    try {
        // Extract job data with defaults for backward compatibility
        const { 
            refreshType = 'post-match',
            gameweek = null,
            lastRefreshTime = null,
            triggeredBy = 'system',
            isMatchDay = false,
            timestamp = Date.now(),
            queueName = 'post-match-refresh'
        } = job.data;

        // Enhanced structured logging
        console.log(`[JOB-START] Processing ${queueName} job ${job.id}`, {
            refreshType,
            gameweek,
            lastRefreshTime,
            triggeredBy,
            isMatchDay,
            jobTimestamp: new Date(timestamp).toISOString(),
            processingStarted: new Date().toISOString()
        });

        // Build query parameters for API call
        const queryParams = new URLSearchParams();
        
        // Include all relevant context in URL parameters
        if (gameweek) queryParams.append('gameweek', gameweek.toString());
        if (refreshType) queryParams.append('type', refreshType);
        if (triggeredBy) queryParams.append('source', triggeredBy);
        if (isMatchDay) queryParams.append('matchDay', isMatchDay.toString());
        queryParams.append('family', '0'); // Keep for compatibility
        
        // Build the API endpoint URL
        const apiEndpoint = `${config.nextApp.url}/api/cron/sync-fpl/post-match?${queryParams}`;

        console.log(`[API-CALL] Calling post-match refresh endpoint at ${apiEndpoint}`);
        
        // Make the API call with complete job data in body
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.cron.secret}`,
                'X-Job-ID': (job.id ?? 'unknown').toString(),
                'X-Queue-Name': queueName
            },
            // Include complete job data in request body
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

        const result = await response.json();
        
        // Create enhanced result object with job context
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
        
        // Enhanced structured logging of result
        console.log(`[JOB-COMPLETE] ${queueName} job ${job.id} completed:`, enhancedResult);

        return enhancedResult;
    } catch (error) {
        // Enhanced error logging
        console.error(`[JOB-ERROR] Error in ${job.data.queueName || 'post-match-refresh'} processor for job ${job.id}:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            jobData: job.data,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}
