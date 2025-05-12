// src/tools/fpl/gameweek.ts
import redis from '../../lib/redis/redis-client';
import { Gameweek, Fixture, Team } from 'fpl-domain.types';

// Local helper for structured error response (or use shared one)
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
    type?: 'current' | 'next' | 'previous';
    includeFixtures?: boolean;
    includeRawData?: boolean;
}

export async function getGameweek(
    params: GetGameweekParams,
    _extra: any
) {
    const {
        gameweekId,
        type, // Renamed from effectiveType for clarity
        includeFixtures = true, // Defaulting to true as per Zod schema
        includeRawData = false,
    } = params;
    const dataTimestamp = new Date().toISOString();

    try {
        if (gameweekId && type) {
            return createGameweekErrorResponse(
                "Please provide either 'gameweekId' OR 'type', not both.",
                'VALIDATION_ERROR',
                ["Specify a gameweek by its ID, or use type: 'current', 'next', or 'previous'."]
            );
        }
        if (!gameweekId && !type) {
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
        } else if (type) { // Use the 'type' from params directly
            switch (type) {
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
                    } else {
                        const finishedGameweeks = allGameweeks.filter(gw => gw.finished).sort((a, b) => b.id - a.id);
                        if (finishedGameweeks.length > 0) {
                            targetGameweek = finishedGameweeks[0];
                        } else {
                            return createGameweekErrorResponse('No previous gameweek found.', 'NOT_FOUND', ['The season may not have started.']);
                        }
                    }
                    break;
                // Default case for invalid type is handled by Zod schema, but defensive check is fine
                default:
                    return createGameweekErrorResponse(`Invalid gameweek type specified: ${type}.`, 'VALIDATION_ERROR');
            }
             if (!targetGameweek) {
                return createGameweekErrorResponse(`Could not determine gameweek for type: ${type}.`, 'NOT_FOUND');
            }
        }

        if (!targetGameweek) {
            console.error("Error in getGameweek: targetGameweek is unexpectedly undefined after initial checks.");
            return createGameweekErrorResponse(
                "Could not determine the target gameweek due to an unexpected internal error.",
                'INTERNAL_ERROR'
            );
        }

        let responseText = "GAMEWEEK_INFO:\n";
        const deadline = new Date(targetGameweek.deadline_time);
        const formattedDeadline = deadline.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });

        let status = targetGameweek.is_current ? 'Current' :
                     targetGameweek.is_next ? 'Next' :
                     targetGameweek.finished ? 'Finished' : 'Upcoming';

        responseText += `Name: ${targetGameweek.name} (ID: ${targetGameweek.id})\n`; // Added ID for clarity
        responseText += `Status: ${status}\n`;
        responseText += `Deadline: ${formattedDeadline}\n`;
        responseText += `Finished: ${targetGameweek.finished ? 'Yes' : 'No'}\n`;
        // Consider adding Average Score, Highest Score if available on Gameweek type and deemed useful
        // responseText += `Average Score: ${targetGameweek.average_entry_score ?? 'N/A'}\n`;
        // responseText += `Highest Score: ${targetGameweek.highest_score ?? 'N/A'}\n`;

        let rawDataForOutput: any = { gameweek: targetGameweek };

        if (includeFixtures) {
            responseText += "\nFIXTURES:\n";
            const fixturesData = await redis.get('fpl:fixtures');
            const teamsData = await redis.get('fpl:teams');

            if (fixturesData && teamsData) {
                const allFixtures: Fixture[] = JSON.parse(fixturesData);
                const allTeams: Team[] = JSON.parse(teamsData);
                const gameweekFixtures = allFixtures
                    .filter(f => f.gameweek_id === targetGameweek?.id)
                    .sort((a,b) => new Date(a.kickoff_time || 0).getTime() - new Date(b.kickoff_time || 0).getTime());


                if (gameweekFixtures.length > 0) {
                    gameweekFixtures.forEach(fixture => {
                        const homeTeam = allTeams.find(t => t.id === fixture.home_team_id);
                        const awayTeam = allTeams.find(t => t.id === fixture.away_team_id);
                        const kickoff = fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleString('en-GB', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'TBD';
                        
                        let score = "";
                        if (fixture.finished && typeof fixture.team_h_score === 'number' && typeof fixture.team_a_score === 'number') {
                            score = ` ${fixture.team_h_score} - ${fixture.team_a_score} `;
                        }

                        responseText += `- ${homeTeam?.short_name || `Team ${fixture.home_team_id}`} (H) [Diff: ${fixture.team_h_difficulty ?? 'N/A'}]${score}vs ${awayTeam?.short_name || `Team ${fixture.away_team_id}`} (A) [Diff: ${fixture.team_a_difficulty ?? 'N/A'}] (${kickoff})\n`;
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
            content: [{ type: 'text' as const, text: responseText.trim() }],
        };

    } catch (error) {
        console.error('Error in getGameweek tool:', error);
        const err = error as Error;
        return createGameweekErrorResponse( // Or use shared createStructuredErrorResponse
            err.message || 'An unknown error occurred while fetching gameweek data.',
            'TOOL_EXECUTION_ERROR'
        );
    }
}
