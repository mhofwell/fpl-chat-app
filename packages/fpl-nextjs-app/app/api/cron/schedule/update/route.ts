import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

interface ScheduleWindow {
  job_type: 'live-update' | 'post-match';
  start_time: string;
  end_time: string;
  match_ids: number[];
}

export async function POST(request: Request) {
    // Verify authentication token for cron service
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Parse request body
        const requestData = await request.json();
        const windows: ScheduleWindow[] = requestData.windows || [];
        
        if (!Array.isArray(windows) || windows.length === 0) {
            return NextResponse.json(
                { error: 'Invalid schedule windows data' },
                { status: 400 }
            );
        }
        
        console.log(`Updating schedule with ${windows.length} windows`);
        
        const supabase = await createClient();
        
        // First check if dynamic scheduling is enabled
        const { data: config } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', 'enable_dynamic_scheduling')
            .single();
            
        const dynamicSchedulingEnabled = config?.value === 'true';
        
        if (!dynamicSchedulingEnabled) {
            console.log('Dynamic scheduling is disabled, not updating schedule');
            return NextResponse.json({
                success: false,
                message: 'Dynamic scheduling is disabled'
            });
        }
        
        // Clear existing schedule
        const { error: deleteError } = await supabase
            .from('dynamic_cron_schedule')
            .delete()
            .neq('id', 0); // Delete all records
            
        if (deleteError) {
            console.error('Error clearing schedule:', deleteError);
            return NextResponse.json(
                { error: 'Failed to clear existing schedule' },
                { status: 500 }
            );
        }
        
        // Insert new schedule windows
        const insertData = windows.map(window => ({
            job_type: window.job_type,
            start_time: window.start_time,
            end_time: window.end_time,
            match_ids: window.match_ids,
        }));
        
        const { data, error: insertError } = await supabase
            .from('dynamic_cron_schedule')
            .insert(insertData)
            .select();
            
        if (insertError) {
            console.error('Error inserting schedule:', insertError);
            return NextResponse.json(
                { error: 'Failed to insert schedule windows' },
                { status: 500 }
            );
        }
        
        return NextResponse.json({
            success: true,
            message: `Successfully updated schedule with ${windows.length} windows`,
            inserted: data?.length || 0,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error updating schedule:', error);
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