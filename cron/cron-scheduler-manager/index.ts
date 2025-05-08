import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { addJobToQueue } from './queue-client.js'; // Local copy of queue-client.ts
dotenv.config();

const NEXT_CLIENT_PORT = process.env.NEXT_CLIENT_PORT || 3000;
const BASE_URL =
    process.env.NEXT_CLIENT_PRIVATE_URL || 'fpl-mcp-chat.railway.internal';
const APP_URL =
    `http://${BASE_URL}:${NEXT_CLIENT_PORT}` ||
    'http://fpl-mcp-chat.railway.internal:3000';
const API_ENDPOINT = `${APP_URL}/api/cron/schedule/update`;
const CRON_SECRET = process.env.CRON_SECRET;

console.log(`Starting FPL scheduler manager at ${new Date().toISOString()}`);

interface Fixture {
    id: number;
    gameweek_id: number;
    home_team_id: number;
    away_team_id: number;
    kickoff_time: string;
    finished: boolean;
    last_updated?: string;
}

interface ScheduleWindow {
    job_type: 'live-update' | 'post-match';
    start_time: string;
    end_time: string;
    match_ids: number[];
}

/**
 * Generate dynamic cron windows for fixtures
 */
function generateScheduleWindows(fixtures: Fixture[]): ScheduleWindow[] {
    const windows: ScheduleWindow[] = [];
    const now = new Date();

    // Filter out fixtures without kickoff times or too old (more than 24h ago)
    const relevantFixtures = fixtures.filter((fixture) => {
        if (!fixture.kickoff_time) return false;

        const kickoff = new Date(fixture.kickoff_time);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        return kickoff > oneDayAgo;
    });

    console.log(
        `Generating schedule windows for ${relevantFixtures.length} relevant fixtures`
    );

    // For each fixture, create windows
    relevantFixtures.forEach((fixture) => {
        const kickoff = new Date(fixture.kickoff_time);

        // Live updates window: 15min before kickoff until 2h after kickoff
        windows.push({
            job_type: 'live-update',
            start_time: new Date(
                kickoff.getTime() - 15 * 60 * 1000
            ).toISOString(),
            end_time: new Date(
                kickoff.getTime() + 120 * 60 * 1000
            ).toISOString(),
            match_ids: [fixture.id],
        });

        // Post-match window: 2h after kickoff until 6h after kickoff
        windows.push({
            job_type: 'post-match',
            start_time: new Date(
                kickoff.getTime() + 120 * 60 * 1000
            ).toISOString(),
            end_time: new Date(
                kickoff.getTime() + 360 * 60 * 1000
            ).toISOString(),
            match_ids: [fixture.id],
        });
    });

    return windows;
}

/**
 * Fetch fixture data from FPL API
 */
async function fetchFixtures(): Promise<Fixture[]> {
    try {
        const endpoint = `${APP_URL}/api/fpl/fixtures`;

        console.log(`Fetching fixtures from ${endpoint}`);

        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${CRON_SECRET}`,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch fixtures: ${response.status}`);
        }

        const data = (await response.json()) as { fixtures: Fixture[] };
        return data.fixtures || [];
    } catch (error) {
        console.error('Error fetching fixtures:', error);
        return [];
    }
}

// Main execution
(async () => {
    try {
        // 1. Fetch fixture data
        const fixtures = await fetchFixtures();
        console.log(`Fetched ${fixtures.length} fixtures`);

        if (fixtures.length === 0) {
            console.warn('No fixtures found, cannot create schedule payload');
            // Decide if you want to exit or just not enqueue a job
            process.exit(0); // Exit gracefully if no fixtures, or handle as needed
        }

        // 2. Generate schedule windows
        const windows = generateScheduleWindows(fixtures);
        console.log(`Generated ${windows.length} schedule windows`);

        if (windows.length === 0) {
            console.log(
                'No windows generated, not adding schedule-update job.'
            );
            process.exit(0);
        }

        // 3. Add the schedule update job to the queue WITH the windows data
        console.log(
            '[CRON-JOB] Adding schedule update job to queue with windows data'
        );

        const jobDataPayload = {
            triggeredBy: 'scheduler-cron-schedule',
            windows: windows, // Pass the generated windows here
        };

        const result = await addJobToQueue('schedule-update', jobDataPayload);

        console.log('[CRON-JOB] Schedule update job added to queue:', result);
        process.exit(0); // Success
    } catch (error) {
        console.error('Error in scheduler manager:', error);
        process.exit(1);
    }
})();

