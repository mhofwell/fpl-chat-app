import redis from '../../lib/redis/redis-client';
import { Fixture, Team, Player } from 'fpl-domain.types';
// We might need FplFixtureStat and FplFixtureStatValue from fpl-api.types if we parse raw stats
// import { FplFixtureStat, FplFixtureStatValue } from '../../../../../types/fpl-api.types'; 
import { fuzzyMatch } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
interface SearchFixturesParams {
    teamQuery?: string;
    gameweekId?: number;
    difficultyMin?: number;
    difficultyMax?: number;
    sortBy?: 'kickoff_time_asc' | 'kickoff_time_desc' | 'difficulty_desc' | 'difficulty_asc';
    // dateRange?: string;
    includeDetails?: boolean;
    limit?: number;
    includeRawData?: boolean;
}   

// --- ADAPTED/NEW TEAM DISAMBIGUATION HELPER ---
// (Ideally, this would be a shared utility with search-players.ts)
interface FindTeamResultForFixtures {
    exactMatch?: Team;
    fuzzyMatches?: Team[]; // For disambiguation
    notFound?: boolean;
    query: string; // Keep track of which part of the query this result is for
}

function findAndDisambiguateTeamQuery(queryPart: string, allTeams: Team[]): FindTeamResultForFixtures {
    const resultBase = { query: queryPart };
    if (!queryPart) return { ...resultBase, notFound: true };
    const trimmedQuery = queryPart.trim().toLowerCase();
    if (!trimmedQuery) return { ...resultBase, notFound: true };

    const exactShortNameMatch = allTeams.find(t => t.short_name.toLowerCase() === trimmedQuery);
    if (exactShortNameMatch) return { ...resultBase, exactMatch: exactShortNameMatch };
    const exactFullNameMatch = allTeams.find(t => t.name.toLowerCase() === trimmedQuery);
    if (exactFullNameMatch) return { ...resultBase, exactMatch: exactFullNameMatch };

    let potentialMatches = allTeams.filter(t => fuzzyMatch(t.name, trimmedQuery));
    if (potentialMatches.length === 0) {
        potentialMatches = allTeams.filter(t => fuzzyMatch(t.short_name, trimmedQuery));
    }
    
    if (potentialMatches.length === 1) {
        return { ...resultBase, exactMatch: potentialMatches[0] };
    } else if (potentialMatches.length > 1) {
        const directShortNameAmongFuzzy = potentialMatches.find(t => t.short_name.toLowerCase() === trimmedQuery);
        if (directShortNameAmongFuzzy) return { ...resultBase, exactMatch: directShortNameAmongFuzzy };
        const directFullNameAmongFuzzy = potentialMatches.find(t => t.name.toLowerCase() === trimmedQuery);
        if (directFullNameAmongFuzzy) return { ...resultBase, exactMatch: directFullNameAmongFuzzy };
        return { ...resultBase, fuzzyMatches: potentialMatches.slice(0, 5) };
    }
    return { ...resultBase, notFound: true };
}
// --- END HELPER ---

// Helper to format detailed fixture stats
function formatFixtureStats(fixture: Fixture, allPlayers: Player[], allTeams: Team[]): string {
    let statsText = "\nKEY_EVENTS:\n";
    let eventsFound = false;

    const getPlayerInfo = (elementId: number): { name: string, teamShortName: string | undefined } => {
        const player = allPlayers.find(p => p.id === elementId);
        const team = player ? allTeams.find(t => t.id === player.team_id) : undefined;
        return {
            name: player?.web_name || `Player ID ${elementId}`,
            teamShortName: team?.short_name
        };
    };

    const processStatType = (
        identifier: string,
        label: string,
        homeEvents: { element: number, value: number }[],
        awayEvents: { element: number, value: number }[],
        valueSuffix: string = ""
    ) => {
        const entries: string[] = [];
        [...homeEvents, ...awayEvents].forEach(event => {
            if (event.value > 0) { // Only include if there's a value
                const player = getPlayerInfo(event.element);
                entries.push(`- ${player.name} (${player.teamShortName || 'N/A'}): ${event.value}${valueSuffix}`);
            }
        });
        if (entries.length > 0) {
            statsText += `\n${label.toUpperCase()}:\n${entries.join('\n')}\n`;
            eventsFound = true;
        }
    };
    
    fixture.stats?.forEach(statGroup => {
        switch (statGroup.identifier) {
            case 'goals_scored':
                processStatType('goals_scored', 'Goals Scored', statGroup.h, statGroup.a, statGroup.h.reduce((s,c)=>s+c.value,0) + statGroup.a.reduce((s,c)=>s+c.value,0) > 1 ? " goals" : " goal");
                break;
            case 'assists':
                processStatType('assists', 'Assists', statGroup.h, statGroup.a, statGroup.h.reduce((s,c)=>s+c.value,0) + statGroup.a.reduce((s,c)=>s+c.value,0) > 1 ? " assists" : " assist");
                break;
            case 'own_goals':
                processStatType('own_goals', 'Own Goals', statGroup.h, statGroup.a);
                break;
            case 'penalties_saved':
                processStatType('penalties_saved', 'Penalties Saved', statGroup.h, statGroup.a);
                break;
            case 'penalties_missed':
                processStatType('penalties_missed', 'Penalties Missed', statGroup.h, statGroup.a);
                break;
            case 'yellow_cards':
                processStatType('yellow_cards', 'Yellow Cards', statGroup.h, statGroup.a);
                break;
            case 'red_cards':
                processStatType('red_cards', 'Red Cards', statGroup.h, statGroup.a);
                break;
            case 'saves': // Often many saves, could be verbose. Maybe only if significant or for GKs involved.
                // processStatType('saves', 'Saves', statGroup.h, statGroup.a, " saves");
                break;
            case 'bonus':
                processStatType('bonus', 'Bonus Points', statGroup.h, statGroup.a, " BPS");
                break;
            // 'bps' (raw BPS scores) can be very long. Usually 'bonus' is sufficient.
            // case 'bps':
            //     // Handle BPS if needed, perhaps top 3 per team.
            //     break;
        }
    });

    if (!eventsFound) {
        statsText += "- No specific key events (goals, assists, cards, bonus) were recorded for this match in the available data.\n";
    }
    return statsText;
}

export async function searchFixtures(
    params: SearchFixturesParams,
    _extra: any
) {
    const {
        teamQuery,
        gameweekId,
        difficultyMin,
        difficultyMax,
        sortBy = 'kickoff_time_asc',
        includeDetails = true,
        limit = 10,
        includeRawData = false,
    } = params;
    const dataTimestamp = new Date().toISOString();
    let userNotes: string[] = []; // For collecting notes like "Team not found"

    try {
        // Fetch players if includeDetails is true, as they are needed for parsing fixture.stats
        const [fixturesCached, teamsCached, playersCached] = await Promise.all([
            redis.get('fpl:fixtures'),
            redis.get('fpl:teams'),
            includeDetails ? redis.get('fpl:players') : Promise.resolve(null) // Fetch players only if needed
        ]);

        if (!fixturesCached || !teamsCached) {
            return createStructuredErrorResponse('Core fixtures or teams data not found in cache.', 'CACHE_ERROR', ['Ensure FPL data sync is active.']);
        }
        if (includeDetails && !playersCached) {
             return createStructuredErrorResponse('Players data not found in cache (required for detailed fixture stats).', 'CACHE_ERROR', ['Ensure FPL data sync is active.']);
        }

        const allFixtures: Fixture[] = JSON.parse(fixturesCached);
        const allTeams: Team[] = JSON.parse(teamsCached);
        const allPlayers: Player[] = playersCached ? JSON.parse(playersCached) : [];

        let filteredFixtures = [...allFixtures];
        let perspectiveTeamId: number | null = null; // For difficulty sorting from a specific team's view

        if (teamQuery) {
            const normalizedQuery = teamQuery.trim().toLowerCase();
            const vsSeparators = /\s+(vs|versus|-)\s+/i;
            const queryParts = normalizedQuery.split(vsSeparators);

            let team1Result: FindTeamResultForFixtures | null = null;
            let team2Result: FindTeamResultForFixtures | null = null;

            if (queryParts.length === 3) { // "teamA vs teamB"
                team1Result = findAndDisambiguateTeamQuery(queryParts[0], allTeams);
                team2Result = findAndDisambiguateTeamQuery(queryParts[2], allTeams);

                // Check for disambiguation needs first
                const disambiguationNeeded = [team1Result, team2Result].filter(r => r?.fuzzyMatches && r.fuzzyMatches.length > 0);
                if (disambiguationNeeded.length > 0) {
                    let disambiguationText = `DISAMBIGUATION_REQUIRED:\n`;
                    disambiguationNeeded.forEach(r => {
                        disambiguationText += `Team name "${r!.query}" is ambiguous. Did you mean:\n`;
                        r!.fuzzyMatches!.forEach(team => {
                            disambiguationText += `- ${team.name} (${team.short_name})\n`;
                        });
                    });
                    disambiguationText += `\nPlease clarify the team name(s).\n\nData timestamp: ${dataTimestamp}`;
                    return { content: [{ type: 'text' as const, text: disambiguationText }], isError: true };
                }

                const team1 = team1Result.exactMatch;
                const team2 = team2Result.exactMatch;

                if (team1 && team2) {
                    filteredFixtures = filteredFixtures.filter(f =>
                        (f.home_team_id === team1.id && f.away_team_id === team2.id) ||
                        (f.home_team_id === team2.id && f.away_team_id === team1.id)
                    );
                } else {
                    // Handle if one or both teams not found in "vs" query
                    let notFoundMessages: string[] = [];
                    if (team1Result.notFound) notFoundMessages.push(`Team "${queryParts[0]}" not found.`);
                    if (team2Result.notFound) notFoundMessages.push(`Team "${queryParts[2]}" not found.`);
                    if (notFoundMessages.length > 0) {
                         return createStructuredErrorResponse(
                            `Could not identify one or both teams for "vs" query: ${notFoundMessages.join(' ')}`,
                            'TEAM_NOT_FOUND',
                            ['Please check team spellings.']
                        );
                    }
                }
            } else { // Single team query
                team1Result = findAndDisambiguateTeamQuery(normalizedQuery, allTeams);

                if (team1Result.exactMatch) {
                    perspectiveTeamId = team1Result.exactMatch.id;
                    filteredFixtures = filteredFixtures.filter(f => f.home_team_id === perspectiveTeamId || f.away_team_id === perspectiveTeamId);
                } else if (team1Result.fuzzyMatches && team1Result.fuzzyMatches.length > 0) {
                    let disambiguationText = `DISAMBIGUATION_REQUIRED:\nTeam name "${team1Result.query}" is ambiguous. Did you mean:\n`;
                    team1Result.fuzzyMatches.forEach(team => {
                        disambiguationText += `- ${team.name} (${team.short_name})\n`;
                    });
                    disambiguationText += `\nPlease clarify the team name.\n\nData timestamp: ${dataTimestamp}`;
                    return { content: [{ type: 'text' as const, text: disambiguationText }], isError: true };
                } else { // team1Result.notFound
                    if (teamQuery && !gameweekId && !difficultyMin && !difficultyMax ) {
                        return createStructuredErrorResponse(`Could not identify team: "${teamQuery}".`, 'TEAM_NOT_FOUND', ['Please check team spelling.']);
                    } else {
                        userNotes.push(`Note: Team "${teamQuery}" was not found. Results are based on other filters.`);
                    }
                }
            }
        }
        
        if (gameweekId) {
            filteredFixtures = filteredFixtures.filter(f => f.gameweek_id === gameweekId);
        }
        
        // New Difficulty Filtering Logic
        if (typeof difficultyMin === 'number') {
            filteredFixtures = filteredFixtures.filter(f =>
                (f.team_h_difficulty !== undefined && f.team_h_difficulty >= difficultyMin) ||
                (f.team_a_difficulty !== undefined && f.team_a_difficulty >= difficultyMin)
            );
        }

        if (typeof difficultyMax === 'number') {
            filteredFixtures = filteredFixtures.filter(f =>
                (f.team_h_difficulty !== undefined && f.team_h_difficulty <= difficultyMax) ||
                (f.team_a_difficulty !== undefined && f.team_a_difficulty <= difficultyMax)
            );
        }
        
        // --- Sorting Logic ---
        filteredFixtures.sort((a, b) => {
            switch (sortBy) {
                case 'difficulty_desc':
                case 'difficulty_asc':
                    let aDifficulty: number | undefined;
                    let bDifficulty: number | undefined;

                    if (perspectiveTeamId) { // Sort from the perspective of the queried team
                        aDifficulty = (a.home_team_id === perspectiveTeamId) ? a.team_h_difficulty : (a.away_team_id === perspectiveTeamId ? a.team_a_difficulty : undefined);
                        bDifficulty = (b.home_team_id === perspectiveTeamId) ? b.team_h_difficulty : (b.away_team_id === perspectiveTeamId ? b.team_a_difficulty : undefined);
                    } else { // Sort by the maximum difficulty in the match if no specific team perspective
                        aDifficulty = Math.max(a.team_h_difficulty || 0, a.team_a_difficulty || 0);
                        bDifficulty = Math.max(b.team_h_difficulty || 0, b.team_a_difficulty || 0);
                    }
                    // Treat undefined difficulty as neutral (e.g., 0 or 3) or push to end, here using 0
                    aDifficulty = aDifficulty ?? 0; 
                    bDifficulty = bDifficulty ?? 0;

                    return sortBy === 'difficulty_desc' ? bDifficulty - aDifficulty : aDifficulty - bDifficulty;
                
                case 'kickoff_time_desc':
                    return new Date(b.kickoff_time || 0).getTime() - new Date(a.kickoff_time || 0).getTime();
                
                case 'kickoff_time_asc': // Default
                default:
                    const gwDiff = (a.gameweek_id ?? 0) - (b.gameweek_id ?? 0);
                    if (gwDiff !== 0) return gwDiff;
                    return new Date(a.kickoff_time || 0).getTime() - new Date(b.kickoff_time || 0).getTime();
            }
        });

        if (filteredFixtures.length === 0 && userNotes.length === 0) {
            return createStructuredErrorResponse('No fixtures found matching your criteria.', 'NOT_FOUND');
        }
        if (filteredFixtures.length === 0 && userNotes.length > 0) {
            let noteResponse = "NOTE:\n" + userNotes.join("\n") + "\n\nNo fixtures found matching the remaining criteria.";
            noteResponse += `\n\nData timestamp: ${dataTimestamp}`;
            return { content: [{ type: 'text' as const, text: noteResponse }], isError: false };
        }

        // --- Response Formatting Logic (to be implemented) ---
        let responseText = "";

        if (filteredFixtures.length === 1 && includeDetails && filteredFixtures[0].finished) {
            const fixture = filteredFixtures[0];
            const homeTeam = allTeams.find(t => t.id === fixture.home_team_id);
            const awayTeam = allTeams.find(t => t.id === fixture.away_team_id);

            responseText = `FIXTURE_DETAILS:\n`;
            responseText += `Match: ${homeTeam?.name || 'N/A'} vs ${awayTeam?.name || 'N/A'}\n`;
            responseText += `Gameweek: ${fixture.gameweek_id || 'N/A'}\n`;
            responseText += `Kickoff: ${fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleString() : 'N/A'}\n`;
            responseText += `Score: ${homeTeam?.short_name || 'N/A'} ${fixture.team_h_score ?? '-'} : ${fixture.team_a_score ?? '-'} ${awayTeam?.short_name || 'N/A'}\n`;
            responseText += `Status: ${fixture.finished ? 'Finished' : (fixture.started ? 'Ongoing' : 'Upcoming')}\n`;
            
            if (allPlayers.length > 0) { // Ensure we have player data to parse stats meaningfully
                responseText += formatFixtureStats(fixture, allPlayers, allTeams);
            } else {
                responseText += "\nKEY_EVENTS:\n- Detailed player event data unavailable (player list not loaded).\n"
            }

        } else {
            responseText = `FIXTURE_SEARCH_RESULTS:\nFound ${filteredFixtures.length} fixtures${filteredFixtures.length > limit ? ` (showing first ${limit})` : ''}:\n\n`;
            const limitedResults = filteredFixtures.slice(0, limit);
            limitedResults.forEach(fixture => {
                const homeTeam = allTeams.find(t => t.id === fixture.home_team_id);
                const awayTeam = allTeams.find(t => t.id === fixture.away_team_id);
                responseText += `Match: ${homeTeam?.name || 'N/A'} vs ${awayTeam?.name || 'N/A'}\n`;
                responseText += `Gameweek: ${fixture.gameweek_id || 'N/A'}\n`;
                responseText += `Kickoff: ${fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleString() : 'N/A'}\n`;
                if (fixture.finished) {
                    responseText += `Score: ${homeTeam?.short_name || 'N/A'} ${fixture.team_h_score ?? '-'} : ${fixture.team_a_score ?? '-'} ${awayTeam?.short_name || 'N/A'}\n`;
                } else {
                    responseText += `Status: ${fixture.started ? 'Ongoing' : 'Upcoming'}\n`;
                }
                responseText += `Difficulty (H-A): ${fixture.team_h_difficulty || 'N/A'}-${fixture.team_a_difficulty || 'N/A'}\n\n`;
            });
            if (filteredFixtures.length > limit) {
                responseText += `\n... and ${filteredFixtures.length - limit} more.\n`;
            }
        }

        responseText += `\nData timestamp: ${dataTimestamp}`;
        
        if (includeRawData) {
            const rawOutput = filteredFixtures.length === 1 && includeDetails && filteredFixtures[0].finished
                ? { ...filteredFixtures[0], parsed_stats: filteredFixtures[0].stats } // Use filteredFixtures[0] directly
                : filteredFixtures.slice(0, limit);
            responseText += '\n\nRAW_DATA:\n' + JSON.stringify(rawOutput, null, 2);
        }

        return {
            content: [{ type: 'text' as const, text: responseText }],
        };

    } catch (error) {
        console.error('Error in searchFixtures tool:', error);
        const err = error as Error;
        return createStructuredErrorResponse(
            err.message || 'An unknown error occurred while searching fixtures.',
            'TOOL_EXECUTION_ERROR'
        );
    }
}
