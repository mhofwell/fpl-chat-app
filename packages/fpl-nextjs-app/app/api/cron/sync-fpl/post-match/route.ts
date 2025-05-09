// app/api/cron/sync-fpl/post-match/route.ts

import { NextResponse } from 'next/server';
import { refreshManager } from '@/lib/fpl-api/refresh-manager';

export async function POST(request: Request) {
    // Verify authentication token for cron service
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('Starting FPL post-match data refresh');

        // Perform post-match refresh
        const result = await refreshManager.performPostMatchRefresh();

        return NextResponse.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error in post-match refresh:', error);
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
    return POST(request);
}
