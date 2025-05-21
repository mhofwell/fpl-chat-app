// src/tools/fpl/player-data.ts
import { Player, Team } from '@fpl-chat-app/types';
import { PlayerDetailResponse, FplPlayerHistory, FplDetailedPlayerFixture } from '@fpl-chat-app/types';
import '../../types/extensions'; // Import type extensions
import { fuzzyMatch } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
import { FPLApiError, fetchFromFPL } from '../../lib/utils/fpl-api-helpers';
import { McpToolContext, McpToolResponse } from '../../types/mcp-types';

// Define the expected structure for parameters
interface PlayerDataParams {
    playerQuery?: string;
    teamId?: number;
    teamName?: string;
    position?: string;
    includeHistory?: boolean;
    includeFixtures?: boolean;
    includeRawData?: boolean;
}

// Player status mapping
const playerStatusMap: { [key: string]: string } = {
    'a': 'Available',
    'd': 'Doubtful', // FPL API: chance_of_playing_this_round/next_round for more detail (e.g. 75%, 25%)
    'i': 'Injured',
    's': 'Suspended',
    'u': 'Unavailable', // e.g. left club, on loan
    'n': 'News / Not available for selection' // Typically means left club / loan / other reasons
};

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

// Function to convert element_type to position string
function elementTypeToPosition(elementType: number): string {
    const positionMap: Record<number, string> = {
        1: 'GKP',
        2: 'DEF',
        3: 'MID',
        4: 'FWD'
    };
    return positionMap[elementType] || 'Unknown';
}

export async function getPlayerData(
    params: PlayerDataParams, 
    _context: McpToolContext
): Promise<McpToolResponse> {
    const { 
        playerQuery, 
        teamId, 
        teamName, 
        position, 
        includeHistory = false,
        includeFixtures = false,
        includeRawData = false 
    } = params;
    
    const dataTimestamp = new Date().toISOString();

    // Validate that at least one search parameter is provided
    if (!playerQuery && !teamId && !teamName && !position) {
        return createStructuredErrorResponse('At least one search parameter is required.', 'VALIDATION_ERROR', [
            'Provide playerQuery to search by name or ID',
            'Or filter by teamId, teamName, or position'
        ]);
    }

    try {
        // Fetch bootstrap data directly from FPL API
        const bootstrapData = await fetchFromFPL('/bootstrap-static/');
        
        // Extract teams and players from bootstrap data
        const allTeams: Team[] = bootstrapData.teams.map((t: any) => ({
            id: t.id,
            name: t.name,
            short_name: t.short_name,
            code: t.code
        }));
        
        const allPlayers: Player[] = bootstrapData.elements.map((p: any) => ({
            id: p.id,
            full_name: `${p.first_name} ${p.second_name}`,
            web_name: p.web_name,
            team_id: p.team,
            position: elementTypeToPosition(p.element_type),
            status: p.status,
            news: p.news,
            chance_of_playing_next_round: p.chance_of_playing_next_round,
            chance_of_playing_this_round: p.chance_of_playing_this_round,
            now_cost: p.now_cost,
            selected_by_percent: p.selected_by_percent,
            total_points: p.total_points,
            goals_scored: p.goals_scored,
            assists: p.assists,
            bonus: p.bonus,
            clean_sheets: p.clean_sheets,
            form: p.form,
            minutes: p.minutes,
            yellow_cards: p.yellow_cards,
            red_cards: p.red_cards,
            saves: p.saves,
            penalties_saved: p.penalties_saved,
            penalties_missed: p.penalties_missed
        }));
        
        // Filter players based on parameters
        let filteredPlayers = [...allPlayers];
        
        // Filter by team ID if provided
        if (teamId !== undefined) {
            filteredPlayers = filteredPlayers.filter(p => p.team_id === teamId);
        }
        
        // Filter by team name if provided
        if (teamName !== undefined && !teamId) {
            const searchedTeam = allTeams.find(t => 
                t.name.toLowerCase().includes(teamName.toLowerCase()) || 
                (t.short_name && t.short_name.toLowerCase().includes(teamName.toLowerCase()))
            );
            
            if (searchedTeam) {
                filteredPlayers = filteredPlayers.filter(p => p.team_id === searchedTeam.id);
            } else {
                // No matching team found
                return createStructuredErrorResponse(`Team "${teamName}" not found.`, 'NOT_FOUND', [
                    'Check team name spelling',
                    'Try using the team ID instead'
                ]);
            }
        }
        
        // Filter by position if provided
        if (position) {
            const validPositions = ['GKP', 'DEF', 'MID', 'FWD'];
            if (!validPositions.includes(position)) {
                return createStructuredErrorResponse(
                    `Invalid position. Must be one of: ${validPositions.join(', ')}`,
                    'VALIDATION_ERROR'
                );
            }
            filteredPlayers = filteredPlayers.filter(p => p.position === position);
        }
        
        // Further filter by player query if provided
        let potentialPlayers: Player[] = [];
        if (playerQuery !== undefined) {
            const numericQuery = parseInt(playerQuery);
            if (!isNaN(numericQuery)) {
                // If playerQuery is numeric, treat as ID
                potentialPlayers = filteredPlayers.filter(p => p.id === numericQuery);
            } else {
                // Otherwise search by name
                potentialPlayers = filteredPlayers.filter(p => 
                    fuzzyMatchPlayerName(p.full_name, p.web_name || '', playerQuery) ||
                    fuzzyMatch(p.full_name, playerQuery)
                );
            }
        } else {
            potentialPlayers = filteredPlayers;
        }
        
        // Handle no matching players
        if (potentialPlayers.length === 0) {
            return createStructuredErrorResponse(
                'No players found matching your criteria.',
                'NOT_FOUND',
                ['Check player name/ID spelling', 'Try broader search criteria']
            );
        }
        
        // Handle multiple matching players
        if (potentialPlayers.length > 1) {
            const limit = 5;
            const disambiguationText = `DISAMBIGUATION_REQUIRED:\nYour query matched ${potentialPlayers.length} players. Please specify one:\n\n${potentialPlayers.slice(0, limit).map((p, idx) => {
                const team = allTeams.find(t => t.id === p.team_id);
                return `CANDIDATE_${idx + 1}:\nName: ${p.full_name} (${team?.short_name || 'Unknown'} - ${p.position})\nFPL ID: ${p.id}`;
            }).join('\n\n')}\n\nTo get specific player data, please use the FPL ID or a more precise name.\n\nData timestamp: ${dataTimestamp}`;
            
            return {
                content: [{ type: 'text' as const, text: disambiguationText }],
                isError: true
            };
        }
        
        // Found exactly one player
        const player = potentialPlayers[0];
        const team = allTeams.find(t => t.id === player.team_id);
        
        // Fetch additional player details if needed
        let playerDetailData: PlayerDetailResponse | null = null;
        if (includeHistory || includeFixtures) {
            try {
                playerDetailData = await fetchFromFPL(`/element-summary/${player.id}/`);
            } catch (detailError) {
                console.warn(`Could not fetch detailed data for player ${player.id}:`, detailError);
                // Continue with basic player data if detail fetch fails
            }
        }
        
        // Build the response
        let responseText = `PLAYER_INFO:\n`;
        responseText += `Name: ${player.full_name}\n`;
        responseText += `Position: ${player.position}\n`;
        responseText += `Team: ${team?.name || 'Unknown'} (${team?.short_name || 'Unknown'})\n`;
        responseText += `FPL ID: ${player.id}\n`;
        
        // Stats section
        responseText += `\nSEASON_STATS:\n`;
        responseText += `Goals: ${player.goals_scored || 0}\n`;
        responseText += `Assists: ${player.assists || 0}\n`;
        responseText += `Minutes: ${player.minutes || 0}\n`;
        responseText += `Yellow Cards: ${player.yellow_cards || 0}\n`;
        responseText += `Red Cards: ${player.red_cards || 0}\n`;
        
        if (player.position === 'GKP') {
            responseText += `Saves: ${player.saves || 0}\n`;
            responseText += `Penalties Saved: ${player.penalties_saved || 0}\n`;
        }
        
        if (player.position === 'GKP' || player.position === 'DEF') {
            responseText += `Clean Sheets: ${player.clean_sheets || 0}\n`;
        }
        
        // FPL data section
        responseText += `\nFPL_DATA:\n`;
        responseText += `Points: ${player.total_points || 0}\n`;
        responseText += `Price: £${(player.now_cost || 0) / 10}m\n`;
        responseText += `Selected By: ${player.selected_by_percent || 0}%\n`;
        responseText += `Form: ${player.form || '0.0'}\n`;
        responseText += `Bonus Points: ${player.bonus || 0}\n`;
        
        // Availability section
        responseText += `\nAVAILABILITY:\n`;
        const statusText = playerStatusMap[player.status || 'a'] || 'Unknown';
        responseText += `Status: ${statusText}\n`;
        
        if (player.chance_of_playing_next_round !== undefined && player.chance_of_playing_next_round !== null && player.chance_of_playing_next_round < 100) {
            responseText += `Chance Next GW: ${player.chance_of_playing_next_round}%\n`;
        }
        
        if (player.news) {
            responseText += `News: ${player.news}\n`;
        }
        
        // Include fixtures if requested and available
        if (includeFixtures && playerDetailData?.fixtures?.length) {
            responseText += `\nUPCOMING_FIXTURES (Next 5):\n`;
            const fixtures = playerDetailData.fixtures.slice(0, 5);
            fixtures.forEach((fixture: FplDetailedPlayerFixture) => {
                const opponent = allTeams.find(t => t.id === (fixture.is_home ? fixture.team_a : fixture.team_h));
                const venue = fixture.is_home ? '(H)' : '(A)';
                responseText += `- GW${fixture.event}: vs ${opponent?.short_name || 'Unknown'} ${venue} - Diff: ${fixture.difficulty}\n`;
            });
        }
        
        // Include history if requested and available
        if (includeHistory && playerDetailData?.history?.length) {
            responseText += `\nRECENT_PERFORMANCE (Last 5 GWs):\n`;
            const recentGames = playerDetailData.history
                .sort((a: FplPlayerHistory, b: FplPlayerHistory) => b.round - a.round) // Most recent first
                .slice(0, 5);
                
            recentGames.forEach((game: FplPlayerHistory) => {
                const opponent = allTeams.find(t => t.id === (game.was_home ? game.opponent_team : game.opponent_team));
                const result = game.was_home ? 
                    `${game.team_h_score}-${game.team_a_score}` : 
                    `${game.team_a_score}-${game.team_h_score}`;
                    
                responseText += `- GW${game.round} vs ${opponent?.short_name || 'Unknown'} (${game.was_home ? 'H' : 'A'}): `;
                responseText += `${result}, ${game.minutes}mins, ${game.total_points}pts`;
                
                const stats = [];
                if (game.goals_scored) stats.push(`${game.goals_scored}g`);
                if (game.assists) stats.push(`${game.assists}a`);
                if (game.clean_sheets) stats.push('CS');
                if (game.yellow_cards) stats.push('YC');
                if (game.red_cards) stats.push('RC');
                if (game.saves && player.position === 'GKP') stats.push(`${game.saves}sv`);
                
                if (stats.length) {
                    responseText += ` (${stats.join(', ')})`;
                }
                
                responseText += `\n`;
            });
        }
        
        responseText += `\nData timestamp: ${dataTimestamp}`;
        
        // Include raw data if requested
        if (includeRawData) {
            const rawData = {
                player,
                team,
                details: playerDetailData
            };
            responseText += `\n\nRAW_DATA:\n${JSON.stringify(rawData, null, 2)}`;
        }
        
        return {
            content: [{ type: 'text' as const, text: responseText.trim() }]
        };
        
    } catch (error) {
        console.error('Error in getPlayerData tool:', error);
        
        if (error instanceof FPLApiError) {
            if (error.statusCode === 503 || error.statusCode === 502) {
                return createStructuredErrorResponse(
                    'The FPL API is currently unavailable. Please try again in a few minutes.',
                    'API_ERROR',
                    ['Try again later']
                );
            }
        }
        
        const err = error as Error;
        return createStructuredErrorResponse(
            err.message || 'An unknown error occurred while fetching player data.',
            'TOOL_EXECUTION_ERROR'
        );
    }
}