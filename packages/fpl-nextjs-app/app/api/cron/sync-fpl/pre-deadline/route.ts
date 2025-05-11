import { NextResponse } from 'next/server';
import { refreshManager } from '@/lib/fpl-api/refresh-manager';

export async function POST(request: Request) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        if (await refreshManager.isPreDeadlineWindow()) {
            console.log('Pre-deadline window active. Performing pre-deadline refresh.');
            const result = await refreshManager.performPreDeadlineRefresh();
            return NextResponse.json({ success: true, ...result, triggered: true });
        } else {
            console.log('Not in pre-deadline window. Skipping pre-deadline refresh.');
            return NextResponse.json({ success: true, triggered: false, message: 'Not in pre-deadline window.' });
        }
    } catch (error) {
        console.error('Error in pre-deadline refresh API route:', error);
        return NextResponse.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
}

export async function GET(request: Request) {
    // Allow GET for manual triggering/testing
    return POST(request);
}
