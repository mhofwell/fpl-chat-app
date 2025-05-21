// src/tools/fpl/player-comparison.ts
import { Player, Team } from '@fpl-chat-app/types';
import { PlayerDetailResponse } from '@fpl-chat-app/types';
import '../../types/extensions'; // Import type extensions
import { fuzzyMatch } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
import { FPLApiError, fetchFromFPL } from '../../lib/utils/fpl-api-helpers';

// Player disambiguation helper
interface FindPlayerResult {
    exactMatch?: Player;
    fuzzyMatches?: Player[];
    notFound?: boolean;
    query: string;
}

function findAndDisambiguatePlayers(
    playerQuery: string,
    allPlayers: Player[],
    allTeams: Team[] // Can be used for context in expanded heuristics
): FindPlayerResult {
    const resultBase = { query: playerQuery };
    if (!playerQuery) return { ...resultBase, notFound: true };
    const trimmedQuery = playerQuery.trim().toLowerCase();
    if (!trimmedQuery) return { ...resultBase, notFound: true };

    // Try exact ID match first (numeric query)
    const numericQuery = parseInt(trimmedQuery, 10);
    if (!isNaN(numericQuery)) {
        const exactIdMatch = allPlayers.find(p => p.id === numericQuery);
        if (exactIdMatch) return { ...resultBase, exactMatch: exactIdMatch };
    }

    // Try exact name matches
    const exactFullNameMatch = allPlayers.find(p => 
        p.full_name.toLowerCase() === trimmedQuery
    );
    if (exactFullNameMatch) return { ...resultBase, exactMatch: exactFullNameMatch };

    const exactWebNameMatch = allPlayers.find(p => 
        p.web_name && p.web_name.toLowerCase() === trimmedQuery
    );
    if (exactWebNameMatch) return { ...resultBase, exactMatch: exactWebNameMatch };

    // Try fuzzy matching
    let potentialMatches = allPlayers.filter(p => {
        // Check if full name contains query as substring
        if (p.full_name.toLowerCase().includes(trimmedQuery)) return true;
        
        // Check if web name contains query as substring
        if (p.web_name && p.web_name.toLowerCase().includes(trimmedQuery)) return true;
        
        // Check fuzzy match on full name
        return fuzzyMatch(p.full_name, trimmedQuery);
    });

    if (potentialMatches.length === 1) {
        return { ...resultBase, exactMatch: potentialMatches[0] };
    } else if (potentialMatches.length > 1) {
        return { ...resultBase, fuzzyMatches: potentialMatches };
    } else {
        return { ...resultBase, notFound: true };
    }
}

interface PlayerComparisonParams {
    playerQueries: string[];
    categories?: string[];
    includeFixtures?: boolean;
    includeHistory?: boolean;
    includeRawData?: boolean;
}

export async function comparePlayerData(params: PlayerComparisonParams, _context: any) {
    const { 
        playerQueries, 
        categories = ['points', 'goals', 'assists', 'minutes'],
        includeFixtures = false, 
        includeHistory = false,
        includeRawData = false 
    } = params;
    
    // Validate at least 2 player queries are provided
    if (!playerQueries || playerQueries.length < 2) {
        return createStructuredErrorResponse(
            'At least two players must be provided for comparison.',
            'VALIDATION_ERROR',
            ['Provide at least two playerQueries']
        );
    }
    
    // Maximum number of players to compare
    if (playerQueries.length > 5) {
        return createStructuredErrorResponse(
            'Maximum of 5 players can be compared at once.',
            'VALIDATION_ERROR',
            ['Reduce the number of players to 5 or fewer']
        );
    }
    
    // Validate categories if provided
    const validCategories = [
        'points', 'goals', 'assists', 'minutes', 'clean_sheets', 'bonus', 
        'yellow_cards', 'red_cards', 'saves', 'price', 'form', 'selected'
    ];
    
    const invalidCategories = categories.filter(c => !validCategories.includes(c));
    if (invalidCategories.length > 0) {
        return createStructuredErrorResponse(
            `Invalid categories: ${invalidCategories.join(', ')}`,
            'VALIDATION_ERROR',
            [`Valid categories are: ${validCategories.join(', ')}`]
        );
    }
    
    const dataTimestamp = new Date().toISOString();
    
    try {
        // Fetch data
        const bootstrapData = await fetchFromFPL('/bootstrap-static/');
        
        // Extract teams and players
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
            position: ['GKP', 'DEF', 'MID', 'FWD'][p.element_type - 1] || 'Unknown',
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
            saves: p.saves
        }));
        
        // Find players for comparison
        const playerResults: {player: Player, details?: PlayerDetailResponse}[] = [];
        const notFoundQueries: string[] = [];
        const ambiguousQueries: {query: string, matches: Player[]}[] = [];
        
        // Process each player query
        for (const query of playerQueries) {
            const result = findAndDisambiguatePlayers(query, allPlayers, allTeams);
            
            if (result.exactMatch) {
                // Found exact match
                let playerDetails = undefined;
                
                if (includeFixtures || includeHistory) {
                    try {
                        playerDetails = await fetchFromFPL(`/element-summary/${result.exactMatch.id}/`);
                    } catch (detailError) {
                        console.warn(`Could not fetch details for player ${result.exactMatch.id}:`, detailError);
                    }
                }
                
                playerResults.push({
                    player: result.exactMatch,
                    details: playerDetails
                });
            } else if (result.fuzzyMatches && result.fuzzyMatches.length > 0) {
                // Ambiguous match
                ambiguousQueries.push({
                    query: result.query,
                    matches: result.fuzzyMatches.slice(0, 5) // Limit to 5 suggestions
                });
            } else {
                // Not found
                notFoundQueries.push(result.query);
            }
        }
        
        // Handle error cases
        if (notFoundQueries.length > 0) {
            return createStructuredErrorResponse(
                `Player(s) not found: ${notFoundQueries.join(', ')}`,
                'NOT_FOUND',
                ['Check player name spelling', 'Try using FPL ID instead']
            );
        }
        
        if (ambiguousQueries.length > 0) {
            const suggestions = ambiguousQueries.map(aq => {
                const matchList = aq.matches.map(p => {
                    const team = allTeams.find(t => t.id === p.team_id);
                    return `${p.full_name} (${team?.short_name || 'Unknown'} - ${p.position}, ID: ${p.id})`;
                }).join('\n- ');
                
                return `For "${aq.query}", did you mean one of:\n- ${matchList}`;
            }).join('\n\n');
            
            return createStructuredErrorResponse(
                'Found multiple matches for one or more players. Please be more specific.',
                'DISAMBIGUATION_REQUIRED',
                [suggestions]
            );
        }
        
        // If we have at least 2 players to compare, proceed
        if (playerResults.length < 2) {
            return createStructuredErrorResponse(
                'Not enough valid players to compare.',
                'VALIDATION_ERROR',
                ['Provide at least two valid player names or IDs']
            );
        }
        
        // Build comparison table
        let responseText = 'PLAYER_COMPARISON:\n\n';
        
        // Header row with player names
        const players = playerResults.map(pr => pr.player);
        
        // Basic info table
        responseText += 'PLAYER_INFO:\n';
        responseText += `Name: ${players.map(p => p.full_name).join(' | ')}\n`;
        responseText += `Position: ${players.map(p => p.position).join(' | ')}\n`;
        responseText += `Team: ${players.map(p => {
            const team = allTeams.find(t => t.id === p.team_id);
            return team ? team.short_name : 'Unknown';
        }).join(' | ')}\n`;
        
        // Stats comparison table
        responseText += '\nSTATS_COMPARISON:\n';
        
        // Map category keys to display names and property paths
        const categoryMap: Record<string, {label: string, property: string, formatter?: (val: any) => string}> = {
            'points': {label: 'Points', property: 'total_points'},
            'goals': {label: 'Goals', property: 'goals_scored'},
            'assists': {label: 'Assists', property: 'assists'},
            'minutes': {label: 'Minutes', property: 'minutes'},
            'clean_sheets': {label: 'Clean Sheets', property: 'clean_sheets'},
            'bonus': {label: 'Bonus', property: 'bonus'},
            'yellow_cards': {label: 'Yellow Cards', property: 'yellow_cards'},
            'red_cards': {label: 'Red Cards', property: 'red_cards'},
            'saves': {label: 'Saves', property: 'saves'},
            'price': {label: 'Price', property: 'now_cost', formatter: (val) => `£${(val/10).toFixed(1)}m`},
            'form': {label: 'Form', property: 'form'},
            'selected': {label: 'Selected By', property: 'selected_by_percent', formatter: (val) => `${val}%`}
        };
        
        // Add each requested stat category
        for (const category of categories) {
            const catInfo = categoryMap[category];
            if (!catInfo) continue;
            
            responseText += `${catInfo.label}: ${players.map(p => {
                const val = p[catInfo.property as keyof Player];
                return catInfo.formatter ? catInfo.formatter(val) : val || '0';
            }).join(' | ')}\n`;
        }
        
        // Add statistics per 90 minutes for key stats if available
        if (categories.some(c => ['goals', 'assists', 'points'].includes(c))) {
            responseText += '\nPER_90_MINS:\n';
            
            if (categories.includes('goals')) {
                responseText += `Goals/90: ${players.map(p => {
                    if (!p.minutes || p.minutes < 90) return '0.00';
                    return ((p.goals_scored || 0) / p.minutes * 90).toFixed(2);
                }).join(' | ')}\n`;
            }
            
            if (categories.includes('assists')) {
                responseText += `Assists/90: ${players.map(p => {
                    if (!p.minutes || p.minutes < 90) return '0.00';
                    return ((p.assists || 0) / p.minutes * 90).toFixed(2);
                }).join(' | ')}\n`;
            }
            
            if (categories.includes('points')) {
                responseText += `Points/90: ${players.map(p => {
                    if (!p.minutes || p.minutes < 90) return '0.00';
                    return ((p.total_points || 0) / p.minutes * 90).toFixed(2);
                }).join(' | ')}\n`;
            }
        }
        
        // Include fixture comparison if requested
        if (includeFixtures) {
            responseText += '\nUPCOMING_FIXTURES (Next 3):\n';
            
            const fixtureRows: string[] = [];
            const maxFixtures = 3;
            
            playerResults.forEach((pr, idx) => {
                if (!pr.details?.fixtures) return;
                
                const fixtures = pr.details.fixtures.slice(0, maxFixtures);
                const playerName = players[idx].web_name || players[idx].full_name.split(' ').pop() || '';
                
                fixtures.forEach((fixture, fixIdx) => {
                    const opponent = allTeams.find(t => t.id === (fixture.is_home ? fixture.team_a : fixture.team_h));
                    const venue = fixture.is_home ? '(H)' : '(A)';
                    
                    if (!fixtureRows[fixIdx]) {
                        fixtureRows[fixIdx] = `GW${fixture.event}: `;
                    }
                    
                    fixtureRows[fixIdx] += `${playerName}: ${opponent?.short_name || 'Unknown'} ${venue} (${fixture.difficulty}) | `;
                });
            });
            
            // Add fixture rows to response text
            fixtureRows.forEach(row => {
                responseText += row.slice(0, -3) + '\n'; // Remove trailing ' | '
            });
        }
        
        // Include recent performance if requested
        if (includeHistory) {
            responseText += '\nRECENT_FORM (Last 3 GWs):\n';
            
            const formRows: string[] = [];
            const maxGames = 3;
            
            playerResults.forEach((pr, idx) => {
                if (!pr.details?.history) return;
                
                const recentGames = pr.details.history
                    .sort((a, b) => b.round - a.round) // Most recent first
                    .slice(0, maxGames);
                
                const playerName = players[idx].web_name || players[idx].full_name.split(' ').pop() || '';
                
                recentGames.forEach((game, gameIdx) => {
                    if (!formRows[gameIdx]) {
                        formRows[gameIdx] = `GW${game.round}: `;
                    }
                    
                    // Format performance
                    const opponent = allTeams.find(t => t.id === game.opponent_team);
                    const stats = [];
                    if (game.goals_scored) stats.push(`${game.goals_scored}g`);
                    if (game.assists) stats.push(`${game.assists}a`);
                    if (game.clean_sheets) stats.push('CS');
                    
                    formRows[gameIdx] += `${playerName}: ${game.total_points}pts vs ${opponent?.short_name || 'Unknown'} ${game.was_home ? '(H)' : '(A)'}`;
                    
                    if (stats.length) {
                        formRows[gameIdx] += ` (${stats.join(', ')})`;
                    }
                    
                    formRows[gameIdx] += ' | ';
                });
            });
            
            // Add form rows to response text
            formRows.forEach(row => {
                responseText += row.slice(0, -3) + '\n'; // Remove trailing ' | '
            });
        }
        
        responseText += `\nData timestamp: ${dataTimestamp}`;
        
        // Include raw data if requested
        if (includeRawData) {
            const rawData = {
                players: playerResults.map(pr => ({
                    player: pr.player,
                    team: allTeams.find(t => t.id === pr.player.team_id),
                    fixtures: pr.details?.fixtures?.slice(0, 5),
                    history: pr.details?.history?.slice(0, 5)
                }))
            };
            responseText += '\n\nRAW_DATA:\n' + JSON.stringify(rawData, null, 2);
        }
        
        return {
            content: [{ type: 'text' as const, text: responseText.trim() }]
        };
        
    } catch (error) {
        console.error('Error in comparePlayerData tool:', error);
        
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
            (error as Error).message || 'An unknown error occurred while comparing player data.',
            'EXECUTION_ERROR'
        );
    }
}