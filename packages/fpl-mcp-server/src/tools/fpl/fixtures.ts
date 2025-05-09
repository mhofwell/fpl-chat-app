// src/tools/fpl/fixtures.ts
import redis from '../../lib/redis/redis-client';
import { Fixture, Team } from '../../../../../types/fpl-domain.types';
import { z } from 'zod';

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
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Fixtures data not found in cache',
                    },
                ],
                isError: true,
            };
        }

        const fixtures: Fixture[] = JSON.parse(cachedFixtures);
        const gameweekFixtures = fixtures.filter(
            (f) => f.gameweek_id === gameweekId
        );

        if (gameweekFixtures.length === 0) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `No fixtures found for gameweek ${gameweekId}`,
                    },
                ],
                isError: true,
            };
        }

        // Enrich fixture data with team names if available
        let enrichedFixtures = gameweekFixtures;
        if (cachedTeams) {
            const teams: Team[] = JSON.parse(cachedTeams);
            enrichedFixtures = gameweekFixtures.map(fixture => {
                const homeTeam = teams.find(t => t.id === fixture.home_team_id);
                const awayTeam = teams.find(t => t.id === fixture.away_team_id);
                
                return {
                    ...fixture,
                    home_team_name: homeTeam?.name || `Team ${fixture.home_team_id}`,
                    away_team_name: awayTeam?.name || `Team ${fixture.away_team_id}`,
                    formatted_kickoff: new Date(fixture.kickoff_time).toLocaleString()
                };
            });
        }

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(enrichedFixtures, null, 2),
                },
            ],
        };
    } catch (error) {
        console.error('Error getting fixtures:', error);
        
        // Check for validation errors specifically
        if (error instanceof z.ZodError) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Invalid input: ${error.errors.map(e => e.message).join(', ')}`,
                    },
                ],
                isError: true,
            };
        }
        
        return {
            content: [
                {
                    type: 'text' as const,
                    text: `Error: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`,
                },
            ],
            isError: true,
        };
    }
}
