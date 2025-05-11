// app/api/cron/sync-fpl/hourly/route.ts

import { NextResponse } from 'next/server';
import { refreshManager } from '@/lib/fpl-api/refresh-manager';
import { getJobContext } from '@/lib/fpl-api/job-context-manager';

export async function POST(request: Request) {
    // Verify authentication token for cron service
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { refreshType = 'incremental' } = (await request
            .json()
            .catch(() => ({}))) as { refreshType?: string }; // Default to incremental
        const jobContext = await getJobContext(); // Fetch current job context (includes isMatchDay)

        console.log(
            `Starting FPL hourly data refresh (type: ${refreshType}, isMatchDay: ${jobContext.isMatchDay})`
        );

        let result;

        if (refreshType === 'incremental') {
            if (jobContext.isMatchDay) {
                console.log(
                    'Match day detected, performing live refresh instead of incremental.'
                );
                result = await refreshManager.performLiveRefresh();
            } else {
                console.log('Performing incremental refresh.');
                result = await refreshManager.performIncrementalRefresh();
            }
        } else if (refreshType === 'regular') {
            // Keep regular refresh as an option if explicitly called
            console.log('Performing regular refresh as explicitly requested.');
            result = await refreshManager.performRegularRefresh();
        } else {
            console.warn(
                `Unknown refresh type: ${refreshType}. Defaulting to incremental.`
            );
            if (jobContext.isMatchDay) {
                result = await refreshManager.performLiveRefresh();
            } else {
                result = await refreshManager.performIncrementalRefresh();
            }
        }

        return NextResponse.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error in hourly refresh:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
}

// Also allow GET requests for manual triggering (with authentication)
export async function GET(request: Request) {
    // For GET, we might want to simplify or make it always incremental for manual tests,
    // or parse query params if needed. For now, let's make it mirror POST but allow query param for type.
    const { searchParams } = new URL(request.url);
    const refreshType = searchParams.get('refreshType') || 'incremental';

    // Construct a mock Request object for POST logic
    const mockPostRequest = new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ refreshType }),
    });

    return POST(mockPostRequest);
}
