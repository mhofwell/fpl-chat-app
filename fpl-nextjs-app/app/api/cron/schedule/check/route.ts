import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
    // Verify authentication token for cron service
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get job type from query params
    const url = new URL(request.url);
    const jobType = url.searchParams.get('jobType');

    if (!jobType || (jobType !== 'live-update' && jobType !== 'post-match')) {
        return NextResponse.json({ 
            error: 'Invalid job type', 
            scheduleCheckingDisabled: true // Default to running the job
        }, { status: 400 });
    }

    try {
        const supabase = await createClient();

        // If dynamic scheduling is not enabled, always run jobs
        const { data: config } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', 'enable_dynamic_scheduling')
            .single();

        const dynamicSchedulingEnabled = config?.value === 'true';
        
        if (!dynamicSchedulingEnabled) {
            console.log('Dynamic scheduling is disabled, allowing job to run');
            return NextResponse.json({
                scheduleCheckingDisabled: true,
                shouldRun: true
            });
        }
        
        // Check for active windows for this job type
        const now = new Date().toISOString();
        
        const { data: activeWindows, error } = await supabase
            .from('dynamic_cron_schedule')
            .select('*')
            .eq('job_type', jobType)
            .lte('start_time', now)
            .gte('end_time', now);
            
        if (error) {
            console.error('Error checking schedule:', error);
            return NextResponse.json({
                scheduleCheckingDisabled: true,
                error: error.message
            });
        }
        
        const shouldRun = activeWindows && activeWindows.length > 0;
        
        return NextResponse.json({
            shouldRun,
            activeWindows: activeWindows || [],
            scheduleCheckingDisabled: false,
            timestamp: now
        });
    } catch (error) {
        console.error('Error in schedule check:', error);
        return NextResponse.json(
            {
                scheduleCheckingDisabled: true, // Default to running the job
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
} 