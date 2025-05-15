import redis from '../../lib/redis/redis-client';
import { Player, Team } from '@fpl-chat-app/types';
import { fuzzyMatch, findAndDisambiguateTeams } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';

interface SearchPlayersParams {
    query?: string;
    teamName?: string;
    position?: 'GKP' | 'DEF' | 'MID' | 'FWD';
    minPrice?: number;
    maxPrice?: number;
    minTotalPoints?: number;
    minGoals?: number;
    sortBy?: 'total_points_desc' | 'now_cost_asc' | 'now_cost_desc' | 'form_desc' | 'selected_by_percent_desc' | 'price_rise_desc' | 'price_rise_asc' | 'recent_form_desc' | 'last_season_points_desc' | 'goals_desc';
    limit?: number;
    includeRawData?: boolean;
}

const statusMap: { [key: string]: string } = {
    'a': 'Available',
    'd': 'Doubtful',
    'i': 'Injured',
    's': 'Suspended',
    'u': 'Unavailable',
    'n': 'Not Available' // FPL API uses 'n' for "News" / Not available for selection / left club
};

export async function searchPlayers(
    params: SearchPlayersParams,
    _extra: any
) {
    const {
        query,
        teamName,
        position,
        minPrice,
        maxPrice,
        minTotalPoints,
        minGoals,
        sortBy = 'total_points_desc',
        limit = 10,
        includeRawData = false,
    } = params;
    const dataTimestamp = new Date().toISOString();
    let userNotes: string[] = [];

    try {
        // Try to get enriched players first, fall back to basic if not available
        let enrichedCacheKey = 'fpl:players:enriched';
        
        // Get teams first if needed for filtering
        const teamsCached = await redis.get('fpl:teams');
        
        // If we have filters, try to use optimized cache keys
        if (teamName && position && teamsCached) {
            const allTeams: Team[] = JSON.parse(teamsCached);
            const teamSearchResult = findAndDisambiguateTeams(teamName, allTeams);
            if (teamSearchResult.exactMatch) {
                enrichedCacheKey = `fpl:players:enriched:team:${teamSearchResult.exactMatch.id}:pos:${position}`;
            }
        } else if (teamName && teamsCached) {
            const allTeams: Team[] = JSON.parse(teamsCached);
            const teamSearchResult = findAndDisambiguateTeams(teamName, allTeams);
            if (teamSearchResult.exactMatch) {
                enrichedCacheKey = `fpl:players:enriched:team:${teamSearchResult.exactMatch.id}`;
            }
        } else if (position) {
            enrichedCacheKey = `fpl:players:enriched:pos:${position}`;
        }
        
        const [playersCached, enrichedPlayersCached] = await Promise.all([
            redis.get('fpl:players:basic'),
            redis.get(enrichedCacheKey)
        ]);

        // Use enriched data if available, otherwise fall back to basic
        const playersSource = enrichedPlayersCached || playersCached;
        
        if (!playersSource) {
            return createStructuredErrorResponse('Players data not found in cache.', 'CACHE_ERROR', ['Ensure FPL data sync is active.']);
        }
        if (teamName && !teamsCached) {
            return createStructuredErrorResponse('Teams data not found in cache (required for teamName filter).', 'CACHE_ERROR', ['Ensure FPL data sync is active.']);
        }

        let allPlayers: Player[] = JSON.parse(playersSource);
        const isEnriched = !!enrichedPlayersCached;
        const allTeams: Team[] = teamsCached ? JSON.parse(teamsCached) : [];
        
        let teamIdFilter: number | null = null;

        if (teamName) {
            const teamSearchResult = findAndDisambiguateTeams(teamName, allTeams);

            if (teamSearchResult.exactMatch) {
                teamIdFilter = teamSearchResult.exactMatch.id;
            } else if (teamSearchResult.fuzzyMatches && teamSearchResult.fuzzyMatches.length > 0) {
                let disambiguationText = `DISAMBIGUATION_REQUIRED:\nTeam name "${teamName}" is ambiguous. Did you mean:\n`;
                teamSearchResult.fuzzyMatches.forEach(team => {
                    disambiguationText += `- ${team.name} (${team.short_name})\n`;
                });
                disambiguationText += `\nPlease clarify the team name.`;
                disambiguationText += `\n\nData timestamp: ${dataTimestamp}`;
                return { content: [{ type: 'text' as const, text: disambiguationText }], isError: true };
            } else {
                if (!query && !position && minPrice === undefined && maxPrice === undefined && minTotalPoints === undefined) {
                    return createStructuredErrorResponse(`Team "${teamName}" not found.`, 'TEAM_NOT_FOUND', ['Check team spelling.']);
                } else {
                    userNotes.push(`Note: Team "${teamName}" was not found. Results are based on other filters.`);
                }
            }
        }

        // --- Filtering Logic ---
        let filteredPlayers = allPlayers.filter(player => {
            if (query && !(fuzzyMatch(player.web_name, query) || fuzzyMatch(player.first_name || '', query) || fuzzyMatch(player.second_name || '', query))) {
                return false;
            }
            if (teamIdFilter && player.team_id !== teamIdFilter) {
                return false;
            }
            if (position && player.position !== position) {
                return false;
            }
            if (minPrice !== undefined && (player.now_cost === undefined || (player.now_cost / 10) < minPrice)) {
                return false;
            }
            if (maxPrice !== undefined && (player.now_cost === undefined || (player.now_cost / 10) > maxPrice)) {
                return false;
            }
            if (minTotalPoints !== undefined && (player.total_points === undefined || player.total_points < minTotalPoints)) {
                return false;
            }
            if (minGoals !== undefined && (player.goals_scored === undefined || player.goals_scored < minGoals)) {
                return false;
            }
            return true;
        });

        // --- Sorting Logic ---
        filteredPlayers.sort((a, b) => {
            const aVal = (val: any) => val === undefined || val === null ? -Infinity : val;
            const bVal = (val: any) => val === undefined || val === null ? -Infinity : val;
            const parseFloatStat = (stat?: string) => stat ? parseFloat(stat) : -Infinity;

            switch (sortBy) {
                case 'now_cost_asc':
                    return (aVal(a.now_cost) - bVal(b.now_cost));
                case 'now_cost_desc':
                    return (bVal(b.now_cost) - aVal(a.now_cost));
                case 'form_desc':
                    return parseFloatStat(b.form) - parseFloatStat(a.form);
                case 'selected_by_percent_desc':
                    return parseFloatStat(b.selected_by_percent) - parseFloatStat(a.selected_by_percent);
                case 'price_rise_desc':
                    const aPriceRise = (a.now_cost !== undefined && a.cost_change_start !== undefined) ? a.now_cost - a.cost_change_start : -Infinity;
                    const bPriceRise = (b.now_cost !== undefined && b.cost_change_start !== undefined) ? b.now_cost - b.cost_change_start : -Infinity;
                    return bPriceRise - aPriceRise;
                case 'price_rise_asc':
                    const aPriceRiseAsc = (a.now_cost !== undefined && a.cost_change_start !== undefined) ? a.now_cost - a.cost_change_start : Infinity;
                    const bPriceRiseAsc = (b.now_cost !== undefined && b.cost_change_start !== undefined) ? b.now_cost - b.cost_change_start : Infinity;
                    return aPriceRiseAsc - bPriceRiseAsc;
                case 'recent_form_desc':
                    if (isEnriched) {
                        const aRecent = a.current_season_performance?.slice(-5) || [];
                        const bRecent = b.current_season_performance?.slice(-5) || [];
                        const aAvg = aRecent.length > 0 ? aRecent.reduce((sum, gw) => sum + gw.points, 0) / aRecent.length : -Infinity;
                        const bAvg = bRecent.length > 0 ? bRecent.reduce((sum, gw) => sum + gw.points, 0) / bRecent.length : -Infinity;
                        return bAvg - aAvg;
                    }
                    return parseFloatStat(b.form) - parseFloatStat(a.form); // Fallback to regular form
                case 'last_season_points_desc':
                    if (isEnriched) {
                        const aLastSeason = a.previous_season_summary?.total_points ?? -Infinity;
                        const bLastSeason = b.previous_season_summary?.total_points ?? -Infinity;
                        return bLastSeason - aLastSeason;
                    }
                    return 0; // No enriched data, no sorting
                case 'goals_desc':
                    return (bVal(b.goals_scored) - aVal(a.goals_scored));
                case 'total_points_desc':
                default:
                    return (bVal(b.total_points) - aVal(a.total_points));
            }
        });
        
        if (filteredPlayers.length === 0 && userNotes.length === 0) {
            return createStructuredErrorResponse('No players found matching your criteria.', 'NOT_FOUND');
        }
         if (filteredPlayers.length === 0 && userNotes.length > 0) {
             let noteResponse = "NOTE:\n" + userNotes.join("\n") + "\n\nNo players found matching the remaining criteria.";
             noteResponse += `\n\nData timestamp: ${dataTimestamp}`;
             return { content: [{ type: 'text' as const, text: noteResponse }], isError: false };
        }

        // --- Response Formatting ---
        let responseText = "";
        if (userNotes.length > 0) {
            responseText += "NOTE:\n" + userNotes.join("\n") + "\n\n";
        }
        
        responseText += `SEARCH_RESULTS:\nFound ${filteredPlayers.length} players${filteredPlayers.length > limit ? ` (showing first ${limit})` : ''}:\n\n`;
        const limitedResults = filteredPlayers.slice(0, limit);

        limitedResults.forEach(player => {
            const team = allTeams.find(t => t.id === player.team_id);
            responseText += `PLAYER_RESULT:\n`;
            responseText += `Name: ${player.web_name}\n`;
            responseText += `Team: ${team?.name || 'N/A'} (${team?.short_name || 'N/A'})\n`;
            responseText += `Position: ${player.position || 'N/A'}\n`;
            responseText += `Price: £${player.now_cost !== undefined ? (player.now_cost / 10).toFixed(1) : 'N/A'}m\n`;
            responseText += `Form: ${player.form || 'N/A'}\n`;
            responseText += `Total Points: ${player.total_points !== undefined ? player.total_points : 'N/A'}\n`;
            responseText += `Goals Scored: ${player.goals_scored !== undefined ? player.goals_scored : 'N/A'}\n`;
            responseText += `Assists: ${player.assists !== undefined ? player.assists : 'N/A'}\n`;
            responseText += `Selected By: ${player.selected_by_percent || 'N/A'}%\n`;
            const playerStatus = player.status || '';
            responseText += `Status: ${statusMap[playerStatus] || playerStatus || 'N/A'}\n`;
            
            // Add enriched data if available
            if (isEnriched && player.current_season_performance) {
                const recentGames = player.current_season_performance.slice(-5);
                responseText += `Recent Form (last ${recentGames.length} GWs): ${recentGames.map(gw => gw.points).join(', ')}\n`;
            }
            if (isEnriched && player.previous_season_summary) {
                responseText += `Last Season: ${player.previous_season_summary.total_points} pts in ${player.previous_season_summary.minutes} mins\n`;
            }
            responseText += `---\n`;
        });
        
        if (filteredPlayers.length > limit && filteredPlayers.length > limitedResults.length) {
            responseText += `\n... and ${filteredPlayers.length - limitedResults.length} more.\n`;
        }

        responseText += `\nData timestamp: ${dataTimestamp}`;

        if (includeRawData) {
            responseText += '\n\nRAW_DATA:\n' + JSON.stringify(limitedResults.map(p => ({...p, team_name: allTeams.find(t=>t.id===p.team_id)?.name}) ), null, 2);
        }

        return {
            content: [{ type: 'text' as const, text: responseText }],
        };

    } catch (error) {
        console.error('Error in searchPlayers tool:', error);
        const err = error as Error;
        return createStructuredErrorResponse(
            err.message || 'An unknown error occurred while searching players.',
            'TOOL_EXECUTION_ERROR'
        );
    }
}
