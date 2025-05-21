// src/tools/fpl/fixture-difficulty.ts
import { Team } from '@fpl-chat-app/types';
import { fuzzyMatch } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
import { FPLApiError, fetchFromFPL } from '../../lib/utils/fpl-api-helpers';

interface FixtureDifficultyParams {
    teamQuery: string;
    range?: number;
    position?: string;
    includeRawData?: boolean;
}

// Team disambiguation helper
interface FindTeamResult {
    exactMatch?: Team;
    fuzzyMatches?: Team[];
    notFound?: boolean;
    query: string;
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

export async function getFixtureDifficulty(
    params: FixtureDifficultyParams,
    _context: any
) {
    const { 
        teamQuery, 
        range = 5,
        position,
        includeRawData = false
    } = params;
    
    // Validate parameters
    if (!teamQuery) {
        return createStructuredErrorResponse(
            'Team query is required.',
            'VALIDATION_ERROR',
            ['Provide a team name or ID to analyze fixture difficulty']
        );
    }
    
    if (position && !['GKP', 'DEF', 'MID', 'FWD'].includes(position)) {
        return createStructuredErrorResponse(
            'Invalid position. Must be one of: GKP, DEF, MID, FWD',
            'VALIDATION_ERROR'
        );
    }
    
    const dataTimestamp = new Date().toISOString();
    
    try {
        // Fetch data
        const bootstrapData = await fetchFromFPL('/bootstrap-static/');
        const fixturesData = await fetchFromFPL('/fixtures/');
        
        // Extract teams
        const allTeams: Team[] = bootstrapData.teams.map((t: any) => ({
            id: t.id,
            name: t.name,
            short_name: t.short_name,
            strength: t.strength,
            strength_overall_home: t.strength_overall_home,
            strength_overall_away: t.strength_overall_away,
            strength_attack_home: t.strength_attack_home,
            strength_attack_away: t.strength_attack_away,
            strength_defence_home: t.strength_defence_home,
            strength_defence_away: t.strength_defence_away
        }));
        
        // Find team by query
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
        
        const team = teamResult.exactMatch!;
        
        // Get current gameweek
        const currentGameweek = bootstrapData.events.find((e: any) => e.is_current);
        const currentGameweekId = currentGameweek ? currentGameweek.id : undefined;
        
        // Filter fixtures for the team
        const teamFixtures = fixturesData
            .filter((f: any) => 
                (f.team_h === team.id || f.team_a === team.id) && 
                !f.finished && 
                f.event !== null
            )
            .map((f: any) => {
                const isHome = f.team_h === team.id;
                const opponentId = isHome ? f.team_a : f.team_h;
                const opponent = allTeams.find(t => t.id === opponentId);
                const difficultyRating = isHome ? f.team_h_difficulty : f.team_a_difficulty;
                
                // Get more detailed difficulty based on position
                let detailedDifficulty = difficultyRating;
                if (position) {
                    if (position === 'DEF' || position === 'GKP') {
                        // For defenders and goalkeepers, difficulty depends on opponent's attack strength
                        if (isHome) {
                            detailedDifficulty = opponent ? opponent.strength_attack_away : difficultyRating;
                        } else {
                            detailedDifficulty = opponent ? opponent.strength_attack_home : difficultyRating;
                        }
                    } else if (position === 'MID' || position === 'FWD') {
                        // For midfielders and forwards, difficulty depends on opponent's defense strength
                        if (isHome) {
                            detailedDifficulty = opponent ? opponent.strength_defence_away : difficultyRating;
                        } else {
                            detailedDifficulty = opponent ? opponent.strength_defence_home : difficultyRating;
                        }
                    }
                }
                
                return {
                    gameweek: f.event,
                    kickoff_time: f.kickoff_time,
                    opponent: opponent ? {
                        id: opponent.id,
                        name: opponent.name,
                        short_name: opponent.short_name
                    } : { id: opponentId, name: `Team ${opponentId}`, short_name: `T${opponentId}` },
                    isHome,
                    difficulty: difficultyRating,
                    detailedDifficulty
                };
            })
            .sort((a: any, b: any) => a.gameweek - b.gameweek)
            .slice(0, range);
        
        // Calculate fixture difficulty ratings
        const totalDifficulty = teamFixtures.reduce((sum: number, f: any) => sum + f.difficulty, 0);
        const totalDetailedDifficulty = teamFixtures.reduce((sum: number, f: any) => sum + f.detailedDifficulty, 0);
        const avgDifficulty = teamFixtures.length > 0 ? (totalDifficulty / teamFixtures.length).toFixed(2) : 'N/A';
        const avgDetailedDifficulty = teamFixtures.length > 0 ? (totalDetailedDifficulty / teamFixtures.length).toFixed(2) : 'N/A';
        
        // Count fixtures by difficulty
        const difficultyCount = {
            easy: teamFixtures.filter((f: any) => f.difficulty <= 2).length,
            medium: teamFixtures.filter((f: any) => f.difficulty === 3).length,
            hard: teamFixtures.filter((f: any) => f.difficulty >= 4).length
        };
        
        // Determine best run of fixtures
        let bestRunStart = 0;
        let bestRunLength = 0;
        let bestRunScore = Infinity;
        
        for (let i = 0; i < teamFixtures.length - 2; i++) { // At least 3 fixtures in a run
            for (let j = i + 2; j < Math.min(i + 6, teamFixtures.length); j++) { // Max 5 fixture run
                const runLength = j - i + 1;
                const runFixtures = teamFixtures.slice(i, j + 1);
                const runScore = runFixtures.reduce((sum: number, f: any) => sum + f.difficulty, 0) / runLength;
                
                if (runScore < bestRunScore) {
                    bestRunScore = runScore;
                    bestRunStart = i;
                    bestRunLength = runLength;
                }
            }
        }
        
        const bestRun = bestRunLength > 0 ? teamFixtures.slice(bestRunStart, bestRunStart + bestRunLength) : [];
        
        // Build response
        let responseText = `FIXTURE_DIFFICULTY_ANALYSIS:\n`;
        responseText += `Team: ${team.name} (${team.short_name})\n`;
        responseText += `Next ${teamFixtures.length} fixtures difficulty rating: ${avgDifficulty}/5\n`;
        
        if (position) {
            responseText += `Position-specific difficulty (${position}): ${avgDetailedDifficulty}/5\n`;
        }
        
        responseText += `\nFIXTURE_BREAKDOWN:\n`;
        responseText += `Easy fixtures (≤ 2): ${difficultyCount.easy}\n`;
        responseText += `Medium fixtures (3): ${difficultyCount.medium}\n`;
        responseText += `Hard fixtures (≥ 4): ${difficultyCount.hard}\n`;
        
        // List upcoming fixtures
        responseText += `\nUPCOMING_FIXTURES:\n`;
        teamFixtures.forEach((fixture: any, idx: number) => {
            const fixtureDate = fixture.kickoff_time ? new Date(fixture.kickoff_time).toLocaleDateString() : 'TBD';
            const venueMark = fixture.isHome ? '(H)' : '(A)';
            const difficultyMark = fixture.difficulty <= 2 ? '✓' : fixture.difficulty >= 4 ? '✗' : '-';
            
            responseText += `GW${fixture.gameweek}: ${fixture.opponent.short_name} ${venueMark} - Difficulty: ${fixture.difficulty}/5 ${difficultyMark}`;
            
            if (position) {
                responseText += ` (${position}: ${fixture.detailedDifficulty}/5)`;
            }
            
            responseText += ` - ${fixtureDate}\n`;
        });
        
        // Best run of fixtures
        if (bestRun.length > 0) {
            responseText += `\nBEST_RUN_OF_FIXTURES:\n`;
            responseText += `GW${bestRun[0].gameweek}-${bestRun[bestRun.length-1].gameweek} (Avg: ${bestRunScore.toFixed(2)}/5):\n`;
            
            bestRun.forEach((fixture: any) => {
                const venueMark = fixture.isHome ? '(H)' : '(A)';
                responseText += `- GW${fixture.gameweek}: ${fixture.opponent.short_name} ${venueMark} - ${fixture.difficulty}/5\n`;
            });
        }
        
        // Team strength data
        responseText += `\nTEAM_STRENGTH_DATA:\n`;
        responseText += `Overall: ${team.strength}/5\n`;
        responseText += `Home: ${team.strength_overall_home}/5, Away: ${team.strength_overall_away}/5\n`;
        responseText += `Attack (H): ${team.strength_attack_home}/5, Attack (A): ${team.strength_attack_away}/5\n`;
        responseText += `Defence (H): ${team.strength_defence_home}/5, Defence (A): ${team.strength_defence_away}/5\n`;
        
        responseText += `\nData timestamp: ${dataTimestamp}`;
        
        // Include raw data if requested
        if (includeRawData) {
            const rawData = {
                team,
                fixtures: teamFixtures,
                analysis: {
                    avgDifficulty,
                    difficultyCount,
                    bestRun: bestRun.map((f: any) => ({
                        gameweek: f.gameweek,
                        opponent: f.opponent.short_name,
                        isHome: f.isHome,
                        difficulty: f.difficulty
                    }))
                }
            };
            responseText += '\n\nRAW_DATA:\n' + JSON.stringify(rawData, null, 2);
        }
        
        return {
            content: [{ type: 'text' as const, text: responseText.trim() }]
        };
        
    } catch (error) {
        console.error('Error in getFixtureDifficulty tool:', error);
        
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
            (error as Error).message || 'An unknown error occurred while analyzing fixture difficulty.',
            'EXECUTION_ERROR'
        );
    }
}