// src/tools/fpl/fixture-data.ts
import { Fixture, Team, Player } from '@fpl-chat-app/types';
import '../../types/extensions'; // Import type extensions 
import { fuzzyMatch } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
import { FPLApiError, fetchFromFPL } from '../../lib/utils/fpl-api-helpers';
import { FplFixtureStat } from '@fpl-chat-app/types/fpl-api';

interface FixtureDataParams {
    teamQuery?: string;
    gameweekId?: number;
    range?: 'next' | 'previous' | number;
    difficultyMin?: number;
    difficultyMax?: number;
    sortBy?: 'kickoff_time_asc' | 'kickoff_time_desc' | 'difficulty_desc' | 'difficulty_asc';
    includeStats?: boolean;
    limit?: number;
    includeRawData?: boolean;
}   

// Team disambiguation helper
interface FindTeamResult {
    exactMatch?: Team;
    fuzzyMatches?: Team[]; // For disambiguation
    notFound?: boolean;
    query: string; // Keep track of which part of the query this result is for
}

function findAndDisambiguateTeamQuery(queryPart: string, allTeams: Team[]): FindTeamResult {
    const resultBase = { query: queryPart };
    if (!queryPart) return { ...resultBase, notFound: true };
    const trimmedQuery = queryPart.trim().toLowerCase();
    if (!trimmedQuery) return { ...resultBase, notFound: true };

    const exactShortNameMatch = allTeams.find((t: Team) => t.short_name?.toLowerCase() === trimmedQuery);
    if (exactShortNameMatch) return { ...resultBase, exactMatch: exactShortNameMatch };
    const exactFullNameMatch = allTeams.find((t: Team) => t.name.toLowerCase() === trimmedQuery);
    if (exactFullNameMatch) return { ...resultBase, exactMatch: exactFullNameMatch };

    let potentialMatches = allTeams.filter(t => fuzzyMatch(t.name, trimmedQuery));
    if (potentialMatches.length === 0) {
        potentialMatches = allTeams.filter(t => t.short_name && fuzzyMatch(t.short_name, trimmedQuery));
    }

    if (potentialMatches.length === 1) {
        return { ...resultBase, exactMatch: potentialMatches[0] };
    } else if (potentialMatches.length > 1) {
        return { ...resultBase, fuzzyMatches: potentialMatches };
    } else {
        return { ...resultBase, notFound: true };
    }
}

export async function getFixtureData(
    params: FixtureDataParams,
    _context: any
) {
    const { 
        teamQuery, 
        gameweekId, 
        range,
        difficultyMin, 
        difficultyMax, 
        sortBy = 'kickoff_time_asc',
        includeStats = false,
        limit = 10,
        includeRawData = false
    } = params;
    
    // At least one parameter should be provided
    if (!teamQuery && !gameweekId && !range && difficultyMin === undefined && difficultyMax === undefined) {
        return createStructuredErrorResponse(
            'At least one search parameter must be provided.',
            'VALIDATION_ERROR',
            [
                'Provide teamQuery to search for a specific team',
                'Provide gameweekId to filter by gameweek',
                'Provide range to get next/previous fixtures',
                'Or set difficultyMin/difficultyMax for fixtures with those ratings'
            ]
        );
    }
    
    const dataTimestamp = new Date().toISOString();
    
    try {
        // Fetch data directly from FPL API
        const bootstrapData = await fetchFromFPL('/bootstrap-static/');
        const fixturesData = await fetchFromFPL('/fixtures/');
        
        // Get player data if needed for match details
        let playersData = null;
        if (includeStats) {
            playersData = bootstrapData.elements;
        }

        // Extract teams from bootstrap data
        const allTeams = bootstrapData.teams.map((t: any) => ({
            id: t.id,
            name: t.name,
            short_name: t.short_name,
            strength: t.strength,
            code: t.code
        }));
        
        // Parse team names if provided
        let targetTeams: Team[] = [];
        
        if (teamQuery) {
            // Check if query is in "Team1 vs Team2" format
            const vsMatch = teamQuery.toLowerCase().match(/^(.+?)\s+(?:v|vs|versus)\s+(.+?)$/i);
            
            if (vsMatch) {
                // Handle team1 vs team2 format
                const team1Result = findAndDisambiguateTeamQuery(vsMatch[1], allTeams);
                const team2Result = findAndDisambiguateTeamQuery(vsMatch[2], allTeams);
                
                // Handle disambiguation or not found cases
                if (team1Result.fuzzyMatches && team1Result.fuzzyMatches.length > 1) {
                    return createStructuredErrorResponse(
                        `Multiple matches for team "${team1Result.query}". Please be more specific.`,
                        'DISAMBIGUATION_REQUIRED',
                        team1Result.fuzzyMatches.slice(0, 5).map(t => `${t.name} (${t.short_name})`)
                    );
                }
                
                if (team2Result.fuzzyMatches && team2Result.fuzzyMatches.length > 1) {
                    return createStructuredErrorResponse(
                        `Multiple matches for team "${team2Result.query}". Please be more specific.`,
                        'DISAMBIGUATION_REQUIRED',
                        team2Result.fuzzyMatches.slice(0, 5).map(t => `${t.name} (${t.short_name})`)
                    );
                }
                
                if (team1Result.notFound) {
                    return createStructuredErrorResponse(
                        `Team "${team1Result.query}" not found.`,
                        'NOT_FOUND',
                        ['Check team name spelling', 'Try using just the team name without "vs"']
                    );
                }
                
                if (team2Result.notFound) {
                    return createStructuredErrorResponse(
                        `Team "${team2Result.query}" not found.`,
                        'NOT_FOUND',
                        ['Check team name spelling', 'Try using just the team name without "vs"']
                    );
                }
                
                // Success case - we have both teams
                targetTeams = [team1Result.exactMatch!, team2Result.exactMatch!];
            } else {
                // Single team query
                const teamResult = findAndDisambiguateTeamQuery(teamQuery, allTeams);
                
                if (teamResult.fuzzyMatches && teamResult.fuzzyMatches.length > 1) {
                    return createStructuredErrorResponse(
                        `Multiple matches for team "${teamResult.query}". Please be more specific.`,
                        'DISAMBIGUATION_REQUIRED',
                        teamResult.fuzzyMatches.slice(0, 5).map(t => `${t.name} (${t.short_name})`)
                    );
                }
                
                if (teamResult.notFound) {
                    return createStructuredErrorResponse(
                        `Team "${teamResult.query}" not found.`,
                        'NOT_FOUND',
                        ['Check team name spelling']
                    );
                }
                
                // Success case - we have the team
                targetTeams = [teamResult.exactMatch!];
            }
        }
        
        // Convert fixtures to our expected format
        const allFixtures: Fixture[] = fixturesData.map((f: any) => ({
            id: f.id,
            gameweek_id: f.event,
            home_team_id: f.team_h,
            away_team_id: f.team_a,
            kickoff_time: f.kickoff_time,
            finished: f.finished,
            team_h_difficulty: f.team_h_difficulty,
            team_a_difficulty: f.team_a_difficulty,
            team_h_score: f.team_h_score,
            team_a_score: f.team_a_score,
            stats: f.stats
        }));
        
        // Get current gameweek
        const currentGameweek = bootstrapData.events.find((e: any) => e.is_current);
        const currentGameweekId = currentGameweek ? currentGameweek.id : undefined;
        
        // Filter fixtures based on parameters
        let filteredFixtures = [...allFixtures];
        
        // Filter by team if provided
        if (targetTeams.length > 0) {
            if (targetTeams.length === 1) {
                // Single team
                const teamId = targetTeams[0].id;
                filteredFixtures = filteredFixtures.filter(f => 
                    f.home_team_id === teamId || f.away_team_id === teamId
                );
            } else if (targetTeams.length === 2) {
                // Team vs Team
                const team1Id = targetTeams[0].id;
                const team2Id = targetTeams[1].id;
                filteredFixtures = filteredFixtures.filter(f => 
                    (f.home_team_id === team1Id && f.away_team_id === team2Id) ||
                    (f.home_team_id === team2Id && f.away_team_id === team1Id)
                );
            }
        }
        
        // Filter by gameweek if provided
        if (gameweekId !== undefined) {
            filteredFixtures = filteredFixtures.filter(f => f.gameweek_id === gameweekId);
        }
        
        // Filter by range if provided
        if (range !== undefined) {
            if (range === 'next' && currentGameweekId) {
                // Next fixtures (current gameweek and future)
                filteredFixtures = filteredFixtures.filter(f => 
                    (f.gameweek_id && f.gameweek_id >= currentGameweekId && !f.finished) ||
                    // Include upcoming fixtures without a gameweek if they haven't finished
                    (f.gameweek_id === undefined && !f.finished)
                );
            } else if (range === 'previous' && currentGameweekId) {
                // Previous fixtures (before current gameweek or finished)
                filteredFixtures = filteredFixtures.filter(f => 
                    (f.gameweek_id && f.gameweek_id < currentGameweekId) || f.finished
                );
            } else if (typeof range === 'number' && currentGameweekId) {
                // Specific number of fixtures (next N or previous N)
                if (range > 0) {
                    // Next N fixtures
                    filteredFixtures = filteredFixtures
                        .filter(f => !f.finished)
                        .sort((a, b) => {
                            if (!a.kickoff_time && !b.kickoff_time) return 0;
                            if (!a.kickoff_time) return 1;
                            if (!b.kickoff_time) return -1;
                            return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
                        })
                        .slice(0, range);
                } else if (range < 0) {
                    // Previous N fixtures
                    filteredFixtures = filteredFixtures
                        .filter(f => f.finished)
                        .sort((a, b) => {
                            if (!a.kickoff_time && !b.kickoff_time) return 0;
                            if (!a.kickoff_time) return 1;
                            if (!b.kickoff_time) return -1;
                            return new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime();
                        })
                        .slice(0, Math.abs(range));
                }
            }
        }
        
        // Filter by difficulty if provided
        if (difficultyMin !== undefined) {
            filteredFixtures = filteredFixtures.filter(f => 
                (f.team_h_difficulty !== undefined && f.team_h_difficulty >= difficultyMin) || 
                (f.team_a_difficulty !== undefined && f.team_a_difficulty >= difficultyMin)
            );
        }
        
        if (difficultyMax !== undefined) {
            filteredFixtures = filteredFixtures.filter(f => 
                (f.team_h_difficulty === undefined || f.team_h_difficulty <= difficultyMax) && 
                (f.team_a_difficulty === undefined || f.team_a_difficulty <= difficultyMax)
            );
        }
        
        // Sort fixtures
        if (sortBy === 'kickoff_time_asc') {
            filteredFixtures.sort((a, b) => {
                if (!a.kickoff_time && !b.kickoff_time) return 0;
                if (!a.kickoff_time) return 1;
                if (!b.kickoff_time) return -1;
                return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
            });
        } else if (sortBy === 'kickoff_time_desc') {
            filteredFixtures.sort((a, b) => {
                if (!a.kickoff_time && !b.kickoff_time) return 0;
                if (!a.kickoff_time) return 1;
                if (!b.kickoff_time) return -1;
                return new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime();
            });
        } else if (sortBy === 'difficulty_desc') {
            filteredFixtures.sort((a, b) => {
                const maxDiffA = Math.max(a.team_h_difficulty || 0, a.team_a_difficulty || 0);
                const maxDiffB = Math.max(b.team_h_difficulty || 0, b.team_a_difficulty || 0);
                return maxDiffB - maxDiffA;
            });
        } else if (sortBy === 'difficulty_asc') {
            filteredFixtures.sort((a, b) => {
                const maxDiffA = Math.max(a.team_h_difficulty || 0, a.team_a_difficulty || 0);
                const maxDiffB = Math.max(b.team_h_difficulty || 0, b.team_a_difficulty || 0);
                return maxDiffA - maxDiffB;
            });
        }
        
        // Handle no matches
        if (filteredFixtures.length === 0) {
            return {
                content: [{ 
                    type: 'text' as const, 
                    text: `No fixtures found matching your criteria.\n\nData timestamp: ${dataTimestamp}` 
                }]
            };
        }
        
        // Limit results
        const limitedFixtures = filteredFixtures.slice(0, limit);
        
        // Prepare response
        let responseText = '';
        
        // Show extended detail view for a single fixture if requested
        const singleFixtureWithDetails = limitedFixtures.length === 1 && includeStats && limitedFixtures[0].finished;
        
        if (singleFixtureWithDetails) {
            // Detailed view for a single finished fixture
            const fixture = limitedFixtures[0];
            const homeTeam = allTeams.find((t: Team) => t.id === fixture.home_team_id);
            const awayTeam = allTeams.find((t: Team) => t.id === fixture.away_team_id);
            
            responseText = `FIXTURE_DETAILS:\n`;
            responseText += `Match: ${homeTeam?.name || 'Unknown'} vs ${awayTeam?.name || 'Unknown'}\n`;
            responseText += `Gameweek: ${fixture.gameweek_id || 'N/A'}\n`;
            responseText += fixture.kickoff_time ? `Played: ${new Date(fixture.kickoff_time).toUTCString()}\n` : '';
            responseText += `Score: ${fixture.team_h_score || 0} - ${fixture.team_a_score || 0}\n`;
            
            // Add stats if available
            if (fixture.stats && Array.isArray(fixture.stats) && fixture.stats.length > 0 && playersData) {
                // Helper to find player name by ID
                const findPlayerName = (id: number) => {
                    const player = playersData.find((p: any) => p.id === id);
                    return player ? `${player.first_name} ${player.second_name}` : `Player ${id}`;
                };
                
                // Map of stats to display
                const statCategories = [
                    { id: 'goals', label: 'Goals' },
                    { id: 'assists', label: 'Assists' },
                    { id: 'bonus', label: 'Bonus Points' },
                    { id: 'yellow_cards', label: 'Yellow Cards' },
                    { id: 'red_cards', label: 'Red Cards' }
                ];
                
                responseText += `\nMATCH_STATS:\n`;
                
                statCategories.forEach(cat => {
                    const statData = fixture.stats?.find((s: any) => s.identifier === cat.id);
                    if (statData && (statData.h.length > 0 || statData.a.length > 0)) {
                        responseText += `${cat.label}:\n`;
                        
                        if (statData.h.length > 0) {
                            responseText += `- ${homeTeam?.name || 'Home'}: `;
                            responseText += statData.h.map((entry: any) => 
                                `${findPlayerName(entry.element)} (${entry.value})`
                            ).join(', ');
                            responseText += '\n';
                        }
                        
                        if (statData.a.length > 0) {
                            responseText += `- ${awayTeam?.name || 'Away'}: `;
                            responseText += statData.a.map((entry: any) => 
                                `${findPlayerName(entry.element)} (${entry.value})`
                            ).join(', ');
                            responseText += '\n';
                        }
                    }
                });
            }
        } else {
            // List view for multiple fixtures
            responseText = `FIXTURES_FOUND: ${filteredFixtures.length}\n`;
            responseText += `Showing ${limitedFixtures.length} of ${filteredFixtures.length} fixtures\n\n`;
            
            limitedFixtures.forEach((fixture, idx) => {
                const homeTeam = allTeams.find((t: Team) => t.id === fixture.home_team_id);
                const awayTeam = allTeams.find((t: Team) => t.id === fixture.away_team_id);
                
                responseText += `${idx + 1}. `;
                
                if (fixture.gameweek_id) {
                    responseText += `GW${fixture.gameweek_id}: `;
                }
                
                responseText += `${homeTeam?.name || `Team ${fixture.home_team_id}`} vs ${awayTeam?.name || `Team ${fixture.away_team_id}`}`;
                
                // Add kickoff time if available
                if (fixture.kickoff_time) {
                    const kickoff = new Date(fixture.kickoff_time);
                    responseText += ` (${kickoff.toUTCString()})`;
                }
                
                // Add score for finished matches
                if (fixture.finished && fixture.team_h_score !== null && fixture.team_a_score !== null) {
                    responseText += ` - Score: ${fixture.team_h_score}-${fixture.team_a_score}`;
                } else {
                    // Add difficulty ratings for upcoming matches
                    responseText += ` - Difficulty: ${homeTeam?.short_name || 'H'} ${fixture.team_h_difficulty || 'N/A'}, ${awayTeam?.short_name || 'A'} ${fixture.team_a_difficulty || 'N/A'}`;
                }
                
                responseText += '\n';
            });
        }
        
        responseText += `\nData timestamp: ${dataTimestamp}`;
        
        // Include raw data if requested
        if (includeRawData) {
            const rawData = {
                fixtures: limitedFixtures,
                teams: targetTeams.length > 0 ? targetTeams : allTeams.filter((t: Team) => 
                    limitedFixtures.some(f => f.home_team_id === t.id || f.away_team_id === t.id)
                )
            };
            responseText += `\n\nRAW_DATA:\n${JSON.stringify(rawData, null, 2)}`;
        }
        
        return {
            content: [{ type: 'text' as const, text: responseText.trim() }]
        };
        
    } catch (error) {
        console.error('Error in getFixtureData tool:', error);
        
        if (error instanceof FPLApiError) {
            if (error.statusCode === 503 || error.statusCode === 502) {
                return createStructuredErrorResponse(
                    'The FPL API is currently unavailable. Please try again in a few minutes.',
                    'API_ERROR',
                    ['Try again later']
                );
            }
        }
        
        return createStructuredErrorResponse(
            (error as Error).message || 'An unknown error occurred while searching fixtures.',
            'EXECUTION_ERROR'
        );
    }
}