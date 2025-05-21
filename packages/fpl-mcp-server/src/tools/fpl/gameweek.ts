// src/tools/fpl/gameweek.ts
import { Gameweek, Fixture, Team } from '@fpl-chat-app/types';
import '../../types/extensions'; // Import type extensions
import { FPLApiError, fetchFromFPL } from '../../lib/utils/fpl-api-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
import { McpToolContext, McpToolResponse } from '../../types/mcp-types';

interface GetGameweekParams {
    gameweekId?: number;
    type?: 'current' | 'next' | 'previous';
    includeFixtures?: boolean;
    includeRawData?: boolean;
}

export async function getGameweek(
    params: GetGameweekParams,
    _context: McpToolContext
): Promise<McpToolResponse> {
    const {
        gameweekId,
        type,
        includeFixtures = true,
        includeRawData = false
    } = params;
    
    // Need either a gameweek ID or a type
    if (gameweekId === undefined && type === undefined) {
        return createStructuredErrorResponse(
            'You must specify either a gameweek ID or type (current, next, previous).',
            'VALIDATION_ERROR',
            ['Provide gameweekId parameter with a number between 1-38', 'Or use type parameter with one of: current, next, previous']
        );
    }
    
    if (gameweekId !== undefined && (gameweekId < 1 || gameweekId > 38)) {
        return createStructuredErrorResponse(
            `Invalid gameweek ID: ${gameweekId}. Must be between 1 and 38.`,
            'VALIDATION_ERROR',
            ['Provide a gameweek ID between 1-38']
        );
    }
    
    if (type !== undefined && !['current', 'next', 'previous'].includes(type)) {
        return createStructuredErrorResponse(
            `Invalid type: ${type}. Must be one of: current, next, previous.`,
            'VALIDATION_ERROR',
            ['Use one of these types: current, next, previous']
        );
    }
    
    const dataTimestamp = new Date().toISOString();
    
    try {
        // Fetch data directly from FPL API
        const bootstrapData = await fetchFromFPL('/bootstrap-static/');
        const fixturesData = includeFixtures ? await fetchFromFPL('/fixtures/') : null;
        
        // Extract gameweeks and teams from bootstrap data
        const allGameweeks = bootstrapData.events as Gameweek[];
        const allTeams = bootstrapData.teams as Team[];
        
        // Find the appropriate gameweek
        let targetGameweek: Gameweek | undefined;
        
        if (gameweekId !== undefined) {
            // Find by explicit ID
            targetGameweek = allGameweeks.find(gw => gw.id === gameweekId);
            
            if (!targetGameweek) {
                return createStructuredErrorResponse(
                    `Gameweek ${gameweekId} not found.`,
                    'NOT_FOUND',
                    ['Check if the gameweek ID is correct', 'Try using type=current instead']
                );
            }
        } else if (type !== undefined) {
            // Find by type (current, next, previous)
            const currentGameweek = allGameweeks.find(gw => gw.is_current);
            
            if (!currentGameweek) {
                return createStructuredErrorResponse(
                    'Could not determine current gameweek.',
                    'DATA_ERROR',
                    ['Try specifying an explicit gameweek ID']
                );
            }
            
            if (type === 'current') {
                targetGameweek = currentGameweek;
            } else if (type === 'next') {
                targetGameweek = allGameweeks.find(gw => gw.id === currentGameweek.id + 1);
                
                if (!targetGameweek) {
                    return createStructuredErrorResponse(
                        'No next gameweek available (current gameweek may be the last one).',
                        'NOT_FOUND',
                        ['Try specifying an explicit gameweek ID']
                    );
                }
            } else if (type === 'previous') {
                targetGameweek = allGameweeks.find(gw => gw.id === currentGameweek.id - 1);
                
                if (!targetGameweek) {
                    return createStructuredErrorResponse(
                        'No previous gameweek available (current gameweek may be the first one).',
                        'NOT_FOUND',
                        ['Try specifying an explicit gameweek ID']
                    );
                }
            }
        }
        
        if (!targetGameweek) {
            return createStructuredErrorResponse(
                'Could not determine target gameweek.',
                'INTERNAL_ERROR',
                ['Try specifying an explicit gameweek ID']
            );
        }
        
        // Format response
        let responseText = `GAMEWEEK_INFO:\n`;
        
        const typeStr = targetGameweek.is_current ? 'Current' : 
                        targetGameweek.is_next ? 'Next' : 
                        targetGameweek.is_previous ? 'Previous' : '';
        
        responseText += `Gameweek: ${targetGameweek.id}${typeStr ? ` (${typeStr})` : ''}\n`;
        responseText += `Name: ${targetGameweek.name}\n`;
        responseText += `Deadline: ${new Date(targetGameweek.deadline_time).toUTCString()}\n`;
        responseText += `Status: ${targetGameweek.finished ? 'Finished' : targetGameweek.is_current ? 'In Progress' : 'Upcoming'}\n`;
        
        if (targetGameweek.average_entry_score) {
            responseText += `Average Score: ${targetGameweek.average_entry_score}\n`;
        }
        
        if (targetGameweek.highest_score) {
            responseText += `Highest Score: ${targetGameweek.highest_score}\n`;
        }
        
        if (targetGameweek.chip_plays && targetGameweek.chip_plays.length > 0) {
            responseText += `\nCHIP_PLAYS:\n`;
            targetGameweek.chip_plays.forEach(chip => {
                responseText += `- ${chip.chip_name}: ${chip.num_played} teams\n`;
            });
        }
        
        // Add fixtures if requested
        if (includeFixtures && fixturesData) {
            // Filter fixtures for target gameweek
            const gameweekFixtures = fixturesData.filter((f: any) => f.event === targetGameweek.id);
            
            if (gameweekFixtures.length > 0) {
                responseText += `\nFIXTURES:\n`;
                
                gameweekFixtures.forEach((fixture: any) => {
                    const homeTeam = allTeams.find(t => t.id === fixture.team_h);
                    const awayTeam = allTeams.find(t => t.id === fixture.team_a);
                    
                    if (!homeTeam || !awayTeam) {
                        return; // Skip if teams not found
                    }
                    
                    let fixtureStr = `- ${homeTeam.name} (H) vs ${awayTeam.name} (A)`;
                    
                    // Add kickoff time if available
                    if (fixture.kickoff_time) {
                        const kickoff = new Date(fixture.kickoff_time);
                        fixtureStr += ` - ${kickoff.toUTCString()}`;
                    }
                    
                    // Add score if finished
                    if (fixture.finished && fixture.team_h_score !== null && fixture.team_a_score !== null) {
                        fixtureStr += ` - ${fixture.team_h_score}-${fixture.team_a_score}`;
                        
                        if (fixture.stats && fixture.stats.length > 0) {
                            // Get goal scorers if available
                            const goals = fixture.stats.find((s: any) => s.identifier === 'goals');
                            if (goals && (goals.h.length > 0 || goals.a.length > 0)) {
                                fixtureStr += ' (';
                                
                                if (goals.h.length > 0) {
                                    fixtureStr += goals.h.map((g: any) => `${g.name} ${g.value}`).join(', ');
                                }
                                
                                if (goals.h.length > 0 && goals.a.length > 0) {
                                    fixtureStr += '; ';
                                }
                                
                                if (goals.a.length > 0) {
                                    fixtureStr += goals.a.map((g: any) => `${g.name} ${g.value}`).join(', ');
                                }
                                
                                fixtureStr += ')';
                            }
                        }
                    } else {
                        // Add difficulty ratings for upcoming fixtures
                        fixtureStr += ` - Difficulty: ${homeTeam.short_name} ${fixture.team_h_difficulty}, ${awayTeam.short_name} ${fixture.team_a_difficulty}`;
                    }
                    
                    responseText += `${fixtureStr}\n`;
                });
            } else {
                responseText += `\nFIXTURES: No fixtures found for gameweek ${targetGameweek.id}.\n`;
            }
        }
        
        responseText += `\nData timestamp: ${dataTimestamp}`;
        
        // Include raw data if requested
        if (includeRawData) {
            const rawData = {
                gameweek: targetGameweek,
                fixtures: includeFixtures ? fixturesData.filter((f: any) => f.event === targetGameweek.id) : null
            };
            responseText += `\n\nRAW_DATA:\n${JSON.stringify(rawData, null, 2)}`;
        }
        
        return {
            content: [{ type: 'text' as const, text: responseText.trim() }]
        };
        
    } catch (error) {
        console.error('Error in getGameweek tool:', error);
        
        if (error instanceof FPLApiError) {
            if (error.statusCode === 503 || error.statusCode === 502) {
                return createStructuredErrorResponse(
                    'The FPL API is currently unavailable. Please try again in a few minutes.',
                    'API_ERROR',
                    ['Try again later']
                );
            }
        }
        
        // Generic error response
        return createStructuredErrorResponse(
            (error as Error).message || 'Unknown error occurred while fetching gameweek data.',
            'EXECUTION_ERROR',
            ['Try again later', 'Consider using a different parameter']
        );
    }
}