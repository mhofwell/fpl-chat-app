import { NextResponse } from 'next/server';
import { fplApiService } from '@/lib/fpl-api/service';

export async function GET(request: Request) {
    // Verify authentication token for cron service
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Get all fixtures from the FPL API
        const fixtures = await fplApiService.getFixtures();
        
        // Get all gameweeks to enrich the data
        const gameweeks = await fplApiService.getGameweeks();
        
        // Map gameweek_id for each fixture 
        const enrichedFixtures = fixtures.map(fixture => {
            // Map event to gameweek_id for consistency
            if (fixture.event) {
                return {
                    ...fixture,
                    gameweek_id: fixture.event
                };
            }
            return fixture;
        });
        
        return NextResponse.json({
            success: true,
            fixtures: enrichedFixtures,
            gameweeks: gameweeks,
            count: enrichedFixtures.length,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching fixtures:', error);
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