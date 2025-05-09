// src/tools/fpl/player.ts
import redis from '../../lib/redis/redis-client';
import { Player, Team as FplTeamType } from '../../../../../types/fpl-domain.types';
import { PlayerDetailResponse } from '../../../../../types/fpl-api.types';
import { fuzzyMatch } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';

// Define the expected structure for parameters, matching the Zod schema
interface GetPlayerParams {
    playerQuery?: string;
    teamId?: number;
    teamName?: string;
    position?: string;
    includeRawData?: boolean;
}

function fuzzyMatchPlayerName(fullName: string, webName: string, searchTerm: string): boolean {
    if (!searchTerm) return true; 
    const term = searchTerm.toLowerCase();
    const fn = fullName.toLowerCase();
    const wn = webName.toLowerCase();

    if (fn.includes(term) || wn.includes(term)) return true;

    const nameParts = (fn + " " + wn).split(' ').filter(s => s.length > 1); 
    const searchWords = term.split(' ').filter(s => s.length > 0);

    return searchWords.every(sw => nameParts.some(np => np.includes(sw)));
}



export async function getPlayer(
    params: GetPlayerParams,
    _extra: any // _extra is typically used for MCP server context, not used here yet
) {
    const {
        playerQuery,
        teamId,
        teamName,
        position,
        includeRawData = false,
    } = params;
    const dataTimestamp = new Date().toISOString();

    try {
        // Validate at least playerQuery is provided if no other specific identifiers
        if (!playerQuery && !teamId && !teamName && !position) {
            return createStructuredErrorResponse(
                'At least one search parameter (playerQuery, teamId, teamName, or position) must be provided.',
                'VALIDATION_ERROR',
                ['Try specifying a player name or ID using playerQuery.']
            );
        }
        if (
            !playerQuery &&
            (teamId || teamName || position) &&
            !((teamId || teamName) && position)
        ) {
            // If only team or position is provided, it's too broad for getPlayer. Guide to searchPlayers.
            return createStructuredErrorResponse(
                'Searching by only team or only position is too broad for finding a single player. Please provide a player name/ID or combine team/position.',
                'VALIDATION_ERROR',
                [
                    'Try providing a player name or ID via playerQuery.',
                    'Use the "search-players" tool for broader searches by team or position.',
                ]
            );
        }

        const [playersCached, teamsCached] = await Promise.all([
            redis.get('fpl:players'),
            redis.get('fpl:teams'),
        ]);

        if (!playersCached) {
            return createStructuredErrorResponse(
                'Players data not found in cache. Please try again later.',
                'CACHE_ERROR',
                ['Ensure data synchronization jobs are running.']
            );
        }
        if (!teamsCached) {
            return createStructuredErrorResponse(
                'Teams data not found in cache. Please try again later.',
                'CACHE_ERROR',
                ['Ensure data synchronization jobs are running.']
            );
        }

        const allPlayers: Player[] = JSON.parse(playersCached);
        const allTeams: FplTeamType[] = JSON.parse(teamsCached);

        let potentialPlayers: Player[] = [...allPlayers];
        const effectivePlayerQuery = playerQuery?.trim();

        if (effectivePlayerQuery && !isNaN(parseInt(effectivePlayerQuery, 10))) {
            const playerIdNum = parseInt(effectivePlayerQuery, 10);
            potentialPlayers = potentialPlayers.filter(p => p.id === playerIdNum);
        } 
        else if (effectivePlayerQuery) {
            const lowerQuery = effectivePlayerQuery.toLowerCase();
            potentialPlayers = potentialPlayers.filter(p => 
                p.full_name.toLowerCase().includes(lowerQuery) ||
                p.web_name.toLowerCase().includes(lowerQuery) ||
                fuzzyMatchPlayerName(p.full_name, p.web_name, effectivePlayerQuery)
            );
        }

        if (teamId) {
            potentialPlayers = potentialPlayers.filter(p => p.team_id === teamId);
        } 
        else if (teamName) {
            const lowerTeamName = teamName.toLowerCase().trim();
            const matchedTeams = allTeams.filter(t => 
                t.name.toLowerCase().includes(lowerTeamName) || 
                t.short_name.toLowerCase() === lowerTeamName ||
                fuzzyMatch(t.name, lowerTeamName)
            );
            if (matchedTeams.length > 0) {
                const matchedTeamIds = matchedTeams.map(t => t.id);
                potentialPlayers = potentialPlayers.filter(p => matchedTeamIds.includes(p.team_id));
            } else {
                potentialPlayers = [];
            }
        }

        if (position) {
            const lowerPosition = position.toLowerCase().trim();
            potentialPlayers = potentialPlayers.filter(p => p.position?.toLowerCase() === lowerPosition);
        }
        
        if (potentialPlayers.length === 0) {
            return createStructuredErrorResponse(
                `No player found matching the specified criteria.`,
                'NOT_FOUND',
                ['Try refining your search terms (player name/ID, team, position).', 'Check spelling.']
            );
        }

        if (potentialPlayers.length > 1) {
            const limit = 5;
            if (potentialPlayers.length > limit) {
                return createStructuredErrorResponse(
                    `Query resulted in too many matches (${potentialPlayers.length}). Please be more specific.`,
                    'AMBIGUOUS_QUERY',
                    ['Try adding more criteria like team name, position, or use a specific FPL player ID.']
                );
            }

            const disambiguationText = `DISAMBIGUATION_REQUIRED:\nYour query matched ${potentialPlayers.length} players. Please specify one:\nData timestamp: ${dataTimestamp}\n\n${potentialPlayers.slice(0, limit).map((p, idx) => {
                const team = allTeams.find(t => t.id === p.team_id);
                return `CANDIDATE_${idx + 1}:\nName: ${p.full_name} (${p.web_name})\nTeam: ${team?.name || 'Unknown'}\nPosition: ${p.position || 'N/A'}\nFPL ID: ${p.id}`;
            }).join('\n\n')}\n\nTo get specific player data, please use the FPL ID or refine your query.`;
            return { 
                content: [{ type: 'text' as const, text: disambiguationText }],
                isError: true
            };
        }
        
        const foundPlayer = potentialPlayers[0];
        const playerTeam = allTeams.find(
            (t: any) => t.id === foundPlayer!.team_id
        );

        // Get detailed player information (current season gameweek history, past seasons)
        const playerDetailsCached = await redis.get(
            `fpl:player:${foundPlayer!.id}:detail`
        );
        let playerDetails: PlayerDetailResponse | null = null;
        if (playerDetailsCached) {
            playerDetails = JSON.parse(playerDetailsCached);
        }

        // --- Structured Text Response (To be implemented in next step) ---
        let responseText = `PLAYER_INFO:\nName: ${foundPlayer!.full_name} (${
            foundPlayer!.web_name
        })\nTeam: ${playerTeam?.name || 'Unknown Team'}\nPosition: ${
            foundPlayer!.position || 'N/A'
        }\nFPL ID: ${foundPlayer!.id}\n`;

        responseText += "\nKEY_STATS:\n";
        responseText += `- Selected by: ${foundPlayer!.selected_by_percent || 'N/A'}%\n`;
        responseText += `- Form (Overall): ${foundPlayer!.form || 'N/A'}\n`;
        responseText += `- Total Points (This Season): ${foundPlayer!.total_points || 0}\n`;
        responseText += `- Points Per Game (This Season): ${foundPlayer!.points_per_game || 'N/A'}\n`;
        
        if (playerDetails?.history && playerDetails.history.length > 0) {
            const currentSeasonHistory = playerDetails.history;
            let goals = 0;
            let assists = 0;
            let minutes = 0;
            let cleanSheets = 0;
            let bonusPoints = 0;
            
            currentSeasonHistory.forEach(gwStat => {
                goals += gwStat.goals_scored;
                assists += gwStat.assists;
                minutes += gwStat.minutes;
                cleanSheets += gwStat.clean_sheets;
                bonusPoints += gwStat.bonus;
            });
            responseText += `- Goals (This Season): ${goals}\n`;
            responseText += `- Assists (This Season): ${assists}\n`;
            responseText += `- Minutes Played (This Season): ${minutes}\n`;
            if (foundPlayer.position === 'GKP' || foundPlayer.position === 'DEF') {
                responseText += `- Clean Sheets (This Season): ${cleanSheets}\n`;
            }
            responseText += `- Bonus Points (This Season): ${bonusPoints}\n`;
        }

        responseText += "\nUPCOMING_FIXTURES:\n";
        if (playerDetails?.fixtures && playerDetails.fixtures.length > 0) {
            const nextFixturesToDisplay = playerDetails.fixtures.slice(0, 3); 
            if (nextFixturesToDisplay.length > 0) {
                responseText += nextFixturesToDisplay.map(fix => {
                    const opponentTeamId = fix.is_home ? fix.team_a : fix.team_h;
                    const opponentTeam = allTeams.find(t => t.id === opponentTeamId);
                    const venue = fix.is_home ? '(H)' : '(A)';
                    return `- GW ${fix.event}: ${opponentTeam?.short_name || 'N/A'} ${venue} (Difficulty: ${fix.difficulty})`;
                }).join('\n');
            } else {
                responseText += "- No upcoming fixtures listed for this player.\n";
            }
        } else {
            responseText += "- Upcoming fixture data not available.\n";
        }
        
        responseText += "\n\nSTRATEGIC_NOTES:\n";
        if (foundPlayer.selected_by_percent) {
            const selectionPercent = parseFloat(foundPlayer.selected_by_percent);
            if (selectionPercent > 25) {
                responseText += "- Highly owned player.\n";
            } else if (selectionPercent < 5 && selectionPercent > 0) { // Ensure it's not 0 before calling it differential
                responseText += "- Potential differential pick.\n";
            }
        }
        if (playerDetails?.history && playerDetails.history.length > 0) {
            const recentHistory = playerDetails.history.slice(-5); 
            const recentPoints = recentHistory.reduce((sum, gw) => sum + gw.total_points, 0);
            const averageRecentPoints = recentHistory.length > 0 ? recentPoints / recentHistory.length : 0;
            if (averageRecentPoints > 5) {
                 responseText += "- In good recent form (avg " + averageRecentPoints.toFixed(1) + " pts over last " + recentHistory.length + " GWs).\n";
            } else if (averageRecentPoints < 2 && recentHistory.length >=3) {
                 responseText += "- In poor recent form (avg " + averageRecentPoints.toFixed(1) + " pts over last " + recentHistory.length + " GWs).\n";
            }
        }
        // Basic check for player status (news) - assuming 'news' field exists on 'foundPlayer' from FPL API
        // and that it's populated in the Player type if available.
        // If `foundPlayer.news` (from FplElement) is not empty, it might indicate injury/suspension.
        // The `Player` type in `fpl.ts` does not have `news` or `status` yet. If we want this, we'd add it.
        // For now, we'll skip direct injury notes unless `status` or `news` is added to Player type.

        // If no specific notes were added, provide a default.
        if (responseText.endsWith("STRATEGIC_NOTES:\n")) {
            responseText += "- Standard player. Check recent performance and upcoming fixtures for more insights.\n";
        }

        responseText += `\nData timestamp: ${dataTimestamp}`;

        if (includeRawData) {
            const rawData = {
                player: {
                    ...foundPlayer,
                    team_name: playerTeam?.name || 'Unknown Team',
                },
                details: playerDetails, // Contains history and history_past
            };
            responseText +=
                '\n\nRAW_DATA:\n' + JSON.stringify(rawData, null, 2);
        }

        return {
            content: [{ type: 'text' as const, text: responseText }],
        };
    } catch (error) {
        console.error('Error in getPlayer tool:', error);
        const err = error as Error;
        return createStructuredErrorResponse(
            err.message || 'An unknown error occurred while fetching player data.',
            'TOOL_EXECUTION_ERROR',
            ['Please try again. If the error persists, contact support.']
        );
    }
}
