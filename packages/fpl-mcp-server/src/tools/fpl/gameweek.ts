// src/tools/fpl/gameweek.ts
import redis from '../../lib/redis/redis-client';
import { Gameweek, Fixture, Team } from '../../../../../types/fpl-domain.types';

// Helper for structured error response
function createGameweekErrorResponse(message: string, type: string = 'GENERIC_ERROR', suggestions?: string[]) {
    const dataTimestamp = new Date().toISOString();
    let text = `ERROR:\nType: ${type}\nMessage: ${message}`;
    if (suggestions && suggestions.length > 0) {
        text += `\n\nSUGGESTIONS:\n- ${suggestions.join('\n- ')}`;
    }
    text += `\n\nData timestamp: ${dataTimestamp}`;
    return {
        content: [{ type: 'text' as const, text }],
        isError: true,
    };
}

interface GetGameweekParams {
    gameweekId?: number;
    type?: 'current' | 'next' | 'previous'; // Added 'previous' to align with plan
    includeFixtures?: boolean;
    includeRawData?: boolean;
}

export async function getGameweek(
    params: GetGameweekParams,
    _extra: any
) {
    const {
        gameweekId,
        type,
        includeFixtures = false,
        includeRawData = false,
    } = params;
    const dataTimestamp = new Date().toISOString();

    // Determine actual type if aliases are used (e.g. map getCurrent to type='current')
    let effectiveType = type;
    // For backward compatibility with potential direct calls if getCurrentGameweek uses this:
    if ((params as any).getCurrent) effectiveType = 'current';
    if ((params as any).getNext) effectiveType = 'next';


    try {
        // Parameter validation (simplified for now, can be expanded in Zod schema later)
        if (gameweekId && effectiveType) {
            return createGameweekErrorResponse(
                "Please provide either 'gameweekId' OR 'type', not both.",
                'VALIDATION_ERROR',
                ["Specify a gameweek by its ID, or use type: 'current', 'next', or 'previous'."]
            );
        }
        if (!gameweekId && !effectiveType) {
             return createGameweekErrorResponse(
                "You must specify a gameweek, e.g., by ID or by type ('current', 'next', 'previous').",
                'VALIDATION_ERROR',
                ["Try 'type: \"current\"' to get the current gameweek."]);
        }

        const cachedGameweeks = await redis.get('fpl:gameweeks');
        if (!cachedGameweeks) {
            return createGameweekErrorResponse(
                'Gameweek data not found in cache. FPL data might be updating.',
                'CACHE_ERROR',
                ['Please try again in a few moments.']
            );
        }

        const allGameweeks: Gameweek[] = JSON.parse(cachedGameweeks);
        let targetGameweek: Gameweek | undefined;
        let currentGameweekIndex = -1;

        if (allGameweeks.length > 0) {
             currentGameweekIndex = allGameweeks.findIndex(gw => gw.is_current);
        }


        if (gameweekId) {
            targetGameweek = allGameweeks.find((gw) => gw.id === gameweekId);
            if (!targetGameweek) {
                return createGameweekErrorResponse(`Gameweek with ID ${gameweekId} not found.`, 'NOT_FOUND', ['Please check the gameweek ID.']);
            }
        } else if (effectiveType) {
            switch (effectiveType) {
                case 'current':
                    targetGameweek = allGameweeks.find((gw) => gw.is_current);
                    if (!targetGameweek) return createGameweekErrorResponse('Current gameweek not found.', 'NOT_FOUND', ['The FPL season might not have started or is between gameweeks.']);
                    break;
                case 'next':
                    targetGameweek = allGameweeks.find((gw) => gw.is_next);
                    if (!targetGameweek) return createGameweekErrorResponse('Next gameweek not found.', 'NOT_FOUND', ['This might be the last gameweek of the season.']);
                    break;
                case 'previous':
                    if (currentGameweekIndex > 0) {
                        targetGameweek = allGameweeks[currentGameweekIndex - 1];
                    } else if (currentGameweekIndex === 0) {
                         return createGameweekErrorResponse('No previous gameweek available (currently on Gameweek 1).', 'NOT_FOUND');
                    }
                    else {
                        // If no current gameweek, find the last finished one
                        const finishedGameweeks = allGameweeks.filter(gw => gw.finished).sort((a, b) => b.id - a.id);
                        if (finishedGameweeks.length > 0) {
                            targetGameweek = finishedGameweeks[0];
                        } else {
                            return createGameweekErrorResponse('No previous gameweek found.', 'NOT_FOUND', ['The season may not have started.']);
                        }
                    }
                    break;
                default:
                    return createGameweekErrorResponse(`Invalid gameweek type specified: ${effectiveType}.`, 'VALIDATION_ERROR');
            }
             if (!targetGameweek) { // Should be caught by specific cases, but as a fallback
                return createGameweekErrorResponse(`Could not determine gameweek for type: ${effectiveType}.`, 'NOT_FOUND');
            }
        } else {
             // This case should ideally be prevented by Zod schema requiring one identifier
            return createGameweekErrorResponse("No gameweek identifier (ID or type) provided.", "VALIDATION_ERROR");
        }

        let responseText = "GAMEWEEK_INFO:\n";
        const deadline = new Date(targetGameweek.deadline_time);
        const formattedDeadline = deadline.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
        
        let status = targetGameweek.is_current ? 'Current' :
                     targetGameweek.is_next ? 'Next' :
                     targetGameweek.finished ? 'Finished' : 'Upcoming';

        responseText += `Name: ${targetGameweek.name}\n`;
        responseText += `Status: ${status}\n`;
        responseText += `Deadline: ${formattedDeadline}\n`;
        responseText += `Finished: ${targetGameweek.finished ? 'Yes' : 'No'}\n`;

        let rawDataForOutput: any = { gameweek: targetGameweek };

        if (includeFixtures) {
            responseText += "\nFIXTURES:\n";
            const fixturesData = await redis.get('fpl:fixtures');
            const teamsData = await redis.get('fpl:teams'); // For team names

            if (fixturesData && teamsData) {
                const allFixtures: Fixture[] = JSON.parse(fixturesData);
                const allTeams: Team[] = JSON.parse(teamsData);
                const gameweekFixtures = allFixtures.filter(f => f.gameweek_id === targetGameweek?.id);

                if (gameweekFixtures.length > 0) {
                    gameweekFixtures.forEach(fixture => {
                        const homeTeam = allTeams.find(t => t.id === fixture.home_team_id)?.short_name || `Team ${fixture.home_team_id}`;
                        const awayTeam = allTeams.find(t => t.id === fixture.away_team_id)?.short_name || `Team ${fixture.away_team_id}`;
                        const kickoff = fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : 'TBD';
                        // Later: Add difficulty, key match indicators
                        responseText += `- ${homeTeam} vs ${awayTeam} (${kickoff})\n`;
                    });
                    rawDataForOutput.fixtures = gameweekFixtures;
                } else {
                    responseText += "- No fixtures found for this gameweek.\n";
                }
            } else {
                responseText += "- Fixture or team data currently unavailable in cache.\n";
            }
        }

        responseText += `\nData timestamp: ${dataTimestamp}`;

        if (includeRawData) {
            responseText += '\n\nRAW_DATA:\n' + JSON.stringify(rawDataForOutput, null, 2);
        }

        return {
            content: [{ type: 'text' as const, text: responseText }],
        };

    } catch (error) {
        console.error('Error in getGameweek tool:', error);
        const err = error as Error;
        return createGameweekErrorResponse(
            err.message || 'An unknown error occurred while fetching gameweek data.',
            'TOOL_EXECUTION_ERROR'
        );
    }
}

// Keep this for now if it's directly used by the current registration,
// but we aim to move to a single get-gameweek tool registration.
export async function getCurrentGameweek(_args: {}, _extra: any) {
    // Cast _args to GetGameweekParams and set type
    return getGameweek({ type: 'current' } as GetGameweekParams, _extra);
}
