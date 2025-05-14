import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/utils/supabase/admin-client';

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
        
        // Use the admin client for system operations
        const supabase = createAdminSupabaseClient();
        
        // First check if dynamic scheduling is enabled
        const { data: config, error: configError } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', 'enable_dynamic_scheduling')
            .single();
            
        console.log('Config query result:', { 
            configExists: !!config,
            configError: configError ? configError.message : null
        });
        
        // Force enable dynamic scheduling for now
        const dynamicSchedulingEnabled = true;
        console.log('Dynamic scheduling enabled?', dynamicSchedulingEnabled, 'Forced to true');
        
        // Debugs after the check
        if (configError) {
            console.error('Error querying system_config:', configError);
        }
        
        if (!config) {
            // Try to insert the config if it doesn't exist
            console.log('Config not found, inserting default value');
            const { error: insertError } = await supabase
                .from('system_config')
                .insert({
                    key: 'enable_dynamic_scheduling',
                    value: 'true',
                    description: 'Enable dynamic scheduling of cron jobs based on fixture times'
                });
                
            if (insertError) {
                console.error('Error inserting config:', insertError);
            }
        }
        
        // Clear existing schedule
        const { error: deleteError } = await supabase
            .from('dynamic_cron_schedule')
            .delete()
            .neq('id', 0); // Delete all records
            
        if (deleteError) {
            console.error('Error clearing schedule:', deleteError);
            return NextResponse.json(
                { error: 'Failed to clear existing schedule', details: deleteError },
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
                { error: 'Failed to insert schedule windows', details: insertError },
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
                details: error,
                timestamp: new Date().toISOString(),
            },
            { status: 500 }
        );
    }
} 