// src/tools/fpl/fixtures.ts
import redis from '../../lib/redis/redis-client';
import { Fixture, Team } from '../../../../../types/fpl-domain.types';
import { z } from 'zod';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';

// Define the type for fixtures after enrichment
interface EnrichedFixture extends Fixture {
    home_team_name: string;
    away_team_name: string;
    formatted_kickoff: string; // This was also added in the first map
}

// Create schema for validating inputs
const gameweekFixturesSchema = z.object({
    gameweekId: z.number().int().positive()
});

export async function getGameweekFixtures(
    params: { gameweekId: number },
    _extra: any
) {
    try {
        // Validate input
        const { gameweekId } = gameweekFixturesSchema.parse(params);
        
        // Get fixtures data from cache
        const cachedFixtures = await redis.get('fpl:fixtures');
        const cachedTeams = await redis.get('fpl:teams');
        
        if (!cachedFixtures) {
            return createStructuredErrorResponse(
                'Fixtures data not found in cache.', 
                'CACHE_ERROR', 
                ['Ensure FPL data sync is active. Wait a moment and try again.']
            );
        }
        // Similar check for cachedTeams if it's deemed essential even if fixtures exist.
        // Currently, it proceeds and just won't enrich names if cachedTeams is missing.
        // This might be acceptable, or you could make it an error/warning.

        const fixtures: Fixture[] = JSON.parse(cachedFixtures);
        const gameweekFixtures = fixtures.filter(
            (f) => f.gameweek_id === gameweekId
        );

        if (gameweekFixtures.length === 0) {
            return createStructuredErrorResponse(
                `No fixtures found for gameweek ${gameweekId}.`,
                'NOT_FOUND' 
                // No specific suggestions usually needed here beyond checking the GW ID.
            );
        }

        // Initialize with the base type, will be reassigned if teams are cached
        let processedFixtures: Fixture[] | EnrichedFixture[] = gameweekFixtures;

        if (cachedTeams) {
            const teams: Team[] = JSON.parse(cachedTeams);
            // This map operation now explicitly returns EnrichedFixture[]
            const tempEnrichedFixtures: EnrichedFixture[] = gameweekFixtures.map(fixture => {
                const homeTeam = teams.find(t => t.id === fixture.home_team_id);
                const awayTeam = teams.find(t => t.id === fixture.away_team_id);
                
                return {
                    ...fixture,
                    home_team_name: homeTeam?.name || `Team ${fixture.home_team_id}`,
                    away_team_name: awayTeam?.name || `Team ${fixture.away_team_id}`,
                    formatted_kickoff: fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleString() : 'TBD'
                };
            });
            processedFixtures = tempEnrichedFixtures;
        }

        const dataTimestamp = new Date().toISOString();
        let responseText = `FIXTURES_FOR_GAMEWEEK ${gameweekId}:\n`;

        if (cachedTeams) {
            // Assert that processedFixtures is EnrichedFixture[] in this block
            const fixtureLines = (processedFixtures as EnrichedFixture[]).map(fixture => {
                const homeTeamName = fixture.home_team_name; // Now type-safe
                const awayTeamName = fixture.away_team_name; // Now type-safe
                // The kickoffDisplay is recalculated for specific formatting, which is fine.
                // fixture.formatted_kickoff contains the result from the first enrichment.
                const kickoffDisplay = fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'TBD';
                
                let scoreLine = "";
                if (fixture.finished) {
                    scoreLine = ` ${fixture.team_h_score ?? '-'} - ${fixture.team_a_score ?? '-'}`;
                }

                return `- ${homeTeamName} vs ${awayTeamName}${scoreLine} (${kickoffDisplay})`;
            });
            responseText += fixtureLines.join('\n');
        } else {
            // Here, processedFixtures is Fixture[]
            (processedFixtures as Fixture[]).forEach(fixture => {
                const kickoff = fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : 'TBD';
                responseText += `- Team ${fixture.home_team_id} vs Team ${fixture.away_team_id} (${kickoff})\n`;
            });
            responseText += "\n(Team names unavailable - team data cache missing)\n";
        }

        responseText += `\n\nData timestamp: ${dataTimestamp}`;

        return {
            content: [{ type: 'text' as const, text: responseText }],
        };
    } catch (error) {
        console.error('Error getting fixtures:', error);
        
        // Check for validation errors specifically
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors.map(e => `${e.path.join('.')} - ${e.message}`).join('; ');
            return createStructuredErrorResponse(
                `Invalid input: ${errorMessages}`,
                'VALIDATION_ERROR',
                ['Please provide a valid positive integer for gameweekId.']
            );
        }
        
        return createStructuredErrorResponse(
            error instanceof Error ? error.message : 'An unknown error occurred while fetching fixtures.',
            'TOOL_EXECUTION_ERROR'
        );
    }
}
