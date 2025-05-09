// src/tools/fpl/gameweek.ts
import redis from '../../lib/redis/redis-client';
import { Gameweek, Fixture } from '../../../../../types/fpl-domain.types';

/**
 * Get a specific gameweek by ID, current, next, or all gameweeks
 */
export async function getGameweek(
    { 
        gameweekId, 
        getCurrent = false, 
        getNext = false,
        includeFixtures = false,
        includeRawData = false 
    }: { 
        gameweekId?: number; 
        getCurrent?: boolean; 
        getNext?: boolean;
        includeFixtures?: boolean;
        includeRawData?: boolean;
    },
    _extra: any
) {
    try {
        // Validate parameters
        if (gameweekId && (getCurrent || getNext)) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Please provide either gameweekId OR set getCurrent/getNext to true',
                    },
                ],
                isError: true,
            };
        }

        const cachedData = await redis.get('fpl:gameweeks');
        if (!cachedData)
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Gameweek data not found in cache',
                    },
                ],
                isError: true,
            };

        const gameweeks: Gameweek[] = JSON.parse(cachedData);
        let gameweek: Gameweek | undefined;
        
        // Get specific gameweek based on parameters
        if (gameweekId) {
            gameweek = gameweeks.find((gw) => gw.id === gameweekId);
            if (!gameweek) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `Gameweek with ID ${gameweekId} not found`,
                        },
                    ],
                    isError: true,
                };
            }
        } else if (getCurrent) {
            gameweek = gameweeks.find((gw) => gw.is_current);
            if (!gameweek) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: 'Current gameweek not found',
                        },
                    ],
                    isError: true,
                };
            }
        } else if (getNext) {
            gameweek = gameweeks.find((gw) => gw.is_next);
            if (!gameweek) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: 'Next gameweek not found',
                        },
                    ],
                    isError: true,
                };
            }
        }

        // If no specific gameweek was requested, return all gameweeks
        if (!gameweek) {
            const formattedData = gameweeks.map(gw => ({
                id: gw.id,
                name: gw.name,
                is_current: gw.is_current,
                is_next: gw.is_next,
                deadline_time: gw.deadline_time,
                finished: gw.finished
            }));
            
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: JSON.stringify(formattedData, null, 2),
                    },
                ],
            };
        }

        // Include fixtures if requested
        let fixtures: Fixture[] = [];
        let teams: any[] = []; // Declare teams outside the conditional blocks

        if (includeFixtures) {
            const fixturesData = await redis.get('fpl:fixtures');
            if (fixturesData) {
                const allFixtures: Fixture[] = JSON.parse(fixturesData);
                fixtures = allFixtures.filter(f => f.gameweek_id === gameweek?.id);
                
                // Get teams data
                const teamsData = await redis.get('fpl:teams');
                if (teamsData) {
                    teams = JSON.parse(teamsData);
                }
            }
        }

        // Format response
        const response = {
            gameweek,
            ...(includeFixtures && { fixtures })
        };

        // Create formatted response for chat
        const deadline = new Date(gameweek.deadline_time);
        const formattedDeadline = deadline.toLocaleString();
        const status = gameweek.is_current ? 'Current Gameweek' : 
                       gameweek.is_next ? 'Next Gameweek' : 
                       gameweek.finished ? 'Completed' : 'Upcoming';
                       
        let formattedOutput = `
Gameweek: ${gameweek.name}
Status: ${status}
Deadline: ${formattedDeadline}
Finished: ${gameweek.finished ? 'Yes' : 'No'}
`;

        if (includeFixtures && fixtures.length > 0) {
            formattedOutput += '\nFixtures:\n';
            fixtures.forEach(fixture => {
                const kickoff = fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleString() : 'TBD';
                
                // Use team_h and team_a properties
                const homeTeamId = fixture.team_h;
                const awayTeamId = fixture.team_a;
                
                // Look up team names from teams array
                const homeTeam = teams.find((t: any) => t.id === homeTeamId)?.name || 'Unknown';
                const awayTeam = teams.find((t: any) => t.id === awayTeamId)?.name || 'Unknown';
                
                formattedOutput += `${homeTeam} vs ${awayTeam} (${kickoff})\n`;
            });
        } else if (includeFixtures) {
            formattedOutput += '\nNo fixtures found for this gameweek.';
        }

        return {
            content: [
                {
                    type: 'text' as const,
                    text: includeRawData 
                        ? formattedOutput + '\n\nRaw data:\n' + JSON.stringify(response, null, 2)
                        : formattedOutput,
                },
            ],
        };
    } catch (error) {
        console.error('Error getting gameweek:', error);
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

// For backward compatibility
export async function getCurrentGameweek(_args: {}, _extra: any) {
    return getGameweek({ getCurrent: true }, _extra);
}
