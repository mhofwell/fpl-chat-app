// src/tools/fpl/team-data.ts
import { Team, Player, Fixture } from '@fpl-chat-app/types';
import { fuzzyMatch } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
import { FPLApiError, fetchFromFPL } from '../../lib/utils/fpl-api-helpers';

interface TeamDataParams {
    teamQuery: string;
    includeFixtures?: boolean;
    includePlayers?: boolean;
    includeForm?: boolean;
    includeRawData?: boolean;
}

export async function getTeamData(
    params: TeamDataParams,
    _context: any
) {
    const { 
        teamQuery, 
        includeFixtures = true, 
        includePlayers = false, 
        includeForm = false,
        includeRawData = false 
    } = params;
    
    const dataTimestamp = new Date().toISOString();

    try {
        // Fetch data directly from FPL API
        const bootstrapData = await fetchFromFPL('/bootstrap-static/');
        const fixturesData = includeFixtures ? await fetchFromFPL('/fixtures/') : null;
        
        // Process bootstrap data to get teams and players
        const allTeams: Team[] = bootstrapData.teams.map((t: any) => ({
            id: t.id,
            name: t.name,
            short_name: t.short_name,
            code: t.code,
            played: t.played,
            points: t.points,
            position: t.position,
            win: t.win,
            loss: t.loss,
            draw: t.draw,
            form: t.form,
            strength: t.strength,
            strength_overall_home: t.strength_overall_home,
            strength_overall_away: t.strength_overall_away,
            strength_attack_home: t.strength_attack_home,
            strength_attack_away: t.strength_attack_away,
            strength_defence_home: t.strength_defence_home,
            strength_defence_away: t.strength_defence_away
        }));

        // Find matching teams based on query
        let potentialTeams: Team[] = [];
        const effectiveTeamQuery = teamQuery.trim();

        if (!isNaN(parseInt(effectiveTeamQuery, 10))) {
            const teamIdNum = parseInt(effectiveTeamQuery, 10);
            potentialTeams = allTeams.filter(t => t.id === teamIdNum);
        } else {
            const lowerQuery = effectiveTeamQuery.toLowerCase();
            potentialTeams = allTeams.filter(t => 
                t.name.toLowerCase().includes(lowerQuery) ||
                (t.short_name && t.short_name.toLowerCase() === lowerQuery) ||
                fuzzyMatch(t.name, effectiveTeamQuery)
            );
        }

        if (potentialTeams.length === 0) {
            return createStructuredErrorResponse(
                `Team "${effectiveTeamQuery}" not found.`, 
                'NOT_FOUND', 
                ['Check spelling or try a different team name/ID.']
            );
        }

        if (potentialTeams.length > 1) {
            const limit = 5;
            const disambiguationText = `DISAMBIGUATION_REQUIRED:\nYour query matched ${potentialTeams.length} teams. Please specify one:\n\n${potentialTeams.slice(0, limit).map((t, idx) => 
                `CANDIDATE_${idx + 1}:\nName: ${t.name} (${t.short_name})\nFPL ID: ${t.id}`
            ).join('\n\n')}\n\nTo get specific team data, please use the FPL ID or a more precise name.\n\nData timestamp: ${dataTimestamp}`;
            return { 
                content: [{ type: 'text' as const, text: disambiguationText }],
                isError: true
            };
        }

        const foundTeam = potentialTeams[0];
        let responseText = "TEAM_INFO:\n";
        responseText += `Name: ${foundTeam.name}\n`;
        responseText += `Short Name: ${foundTeam.short_name}\n`;
        responseText += `FPL ID: ${foundTeam.id}\n`;
        responseText += `Position: ${foundTeam.position ?? 'N/A'}\n`;

        responseText += "\nSEASON_STATS:\n";
        responseText += `Played: ${foundTeam.played ?? 'N/A'}\n`;
        responseText += `Points: ${foundTeam.points ?? 'N/A'}\n`;
        responseText += `Wins: ${foundTeam.win ?? 'N/A'}\n`;
        responseText += `Losses: ${foundTeam.loss ?? 'N/A'}\n`;
        responseText += `Draws: ${foundTeam.draw ?? 'N/A'}\n`;
        responseText += `Form: ${foundTeam.form || 'N/A'}\n`;

        responseText += "\nSTRENGTH_RATINGS:\n";
        responseText += `Overall: ${foundTeam.strength ?? 'N/A'}\n`;
        responseText += `Home: ${foundTeam.strength_overall_home ?? 'N/A'}, Away: ${foundTeam.strength_overall_away ?? 'N/A'}\n`;
        responseText += `Attack (H): ${foundTeam.strength_attack_home ?? 'N/A'}, Attack (A): ${foundTeam.strength_attack_away ?? 'N/A'}\n`;
        responseText += `Defence (H): ${foundTeam.strength_defence_home ?? 'N/A'}, Defence (A): ${foundTeam.strength_defence_away ?? 'N/A'}\n`;

        const rawDataForOutput: any = { team: foundTeam };

        // Process player data if requested
        if (includePlayers) {
            // Map elements to players
            const allPlayers: Player[] = bootstrapData.elements.map((p: any) => ({
                id: p.id,
                full_name: `${p.first_name} ${p.second_name}`,
                web_name: p.web_name,
                team_id: p.team,
                position: ['GKP', 'DEF', 'MID', 'FWD'][p.element_type - 1] || 'Unknown',
                total_points: p.total_points,
                goals_scored: p.goals_scored,
                assists: p.assists,
                clean_sheets: p.clean_sheets,
                now_cost: p.now_cost,
                selected_by_percent: p.selected_by_percent,
                form: p.form
            }));
            
            const teamPlayers = allPlayers
                .filter(p => p.team_id === foundTeam.id)
                .sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0)); // Sort by total points desc
            
            if (teamPlayers.length > 0) {
                // Group players by position
                const playersByPosition: Record<string, Player[]> = {
                    'GKP': teamPlayers.filter(p => p.position === 'GKP'),
                    'DEF': teamPlayers.filter(p => p.position === 'DEF'),
                    'MID': teamPlayers.filter(p => p.position === 'MID'),
                    'FWD': teamPlayers.filter(p => p.position === 'FWD')
                };
                
                responseText += "\nKEY_PLAYERS:\n";
                
                // Display top players by position
                for (const [position, players] of Object.entries(playersByPosition)) {
                    if (players.length > 0) {
                        responseText += `${position}:\n`;
                        // Take top 3 for each position
                        players.slice(0, 3).forEach(p => {
                            responseText += `- ${p.full_name} - Points: ${p.total_points ?? 0}, £${(p.now_cost ?? 0)/10}m`;
                            
                            // Add more stats
                            const stats = [];
                            if (p.goals_scored && p.goals_scored > 0) stats.push(`${p.goals_scored}g`);
                            if (p.assists && p.assists > 0) stats.push(`${p.assists}a`);
                            if (p.clean_sheets && p.clean_sheets > 0) stats.push(`${p.clean_sheets}cs`);
                            
                            if (stats.length > 0) {
                                responseText += ` (${stats.join(', ')})`;
                            }
                            
                            responseText += `\n`;
                        });
                    }
                }
                
                rawDataForOutput.players = teamPlayers;
            } else {
                responseText += "\nKEY_PLAYERS:\n- No player data available for this team.\n";
            }
        }

        // Process fixture data if requested
        if (includeFixtures && fixturesData) {
            // Convert API fixtures to our internal format
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
                team_a_score: f.team_a_score
            }));

            // Get recent and upcoming fixtures
            const teamFixtures = allFixtures
                .filter(f => f.home_team_id === foundTeam.id || f.away_team_id === foundTeam.id)
                .sort((a, b) => (new Date(a.kickoff_time || 0).getTime() - new Date(b.kickoff_time || 0).getTime()));
            
            const recentFixtures = teamFixtures
                .filter(f => f.finished)
                .reverse() // Most recent first
                .slice(0, 3);
                
            const upcomingFixtures = teamFixtures
                .filter(f => !f.finished)
                .slice(0, 5); // Next 5
                
            if (recentFixtures.length > 0) {
                responseText += "\nRECENT_RESULTS:\n";
                recentFixtures.forEach(fixture => {
                    const isHome = fixture.home_team_id === foundTeam.id;
                    const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
                    const opponent = allTeams.find(t => t.id === opponentId);
                    const venue = isHome ? '(H)' : '(A)';
                    const result = isHome 
                        ? `${fixture.team_h_score}-${fixture.team_a_score}`
                        : `${fixture.team_a_score}-${fixture.team_h_score}`;
                        
                    responseText += `- GW${fixture.gameweek_id}: vs ${opponent?.short_name || `Team ${opponentId}`} ${venue} - Result: ${result}\n`;
                });
                rawDataForOutput.recent_fixtures = recentFixtures;
            }

            if (upcomingFixtures.length > 0) {
                responseText += "\nUPCOMING_FIXTURES:\n";
                upcomingFixtures.forEach(fixture => {
                    const isHome = fixture.home_team_id === foundTeam.id;
                    const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
                    const opponent = allTeams.find(t => t.id === opponentId);
                    const venue = isHome ? '(H)' : '(A)';
                    const difficulty = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;
                    
                    // Format date if available
                    let dateStr = '';
                    if (fixture.kickoff_time) {
                        const date = new Date(fixture.kickoff_time);
                        dateStr = ` - ${date.toLocaleDateString()}`;
                    }
                    
                    responseText += `- GW${fixture.gameweek_id}: vs ${opponent?.short_name || `Team ${opponentId}`} ${venue} (Diff: ${difficulty ?? 'N/A'})${dateStr}\n`;
                });
                rawDataForOutput.upcoming_fixtures = upcomingFixtures;
            }
            
            if (recentFixtures.length === 0 && upcomingFixtures.length === 0) {
                responseText += "\nFIXTURES:\n- No fixture data found for this team.\n";
            }
        } else if (includeFixtures) {
            responseText += "\nUPCOMING_FIXTURES:\n- Fixture data currently unavailable.\n";
        }
        
        // Process form data if requested
        if (includeForm) {
            // Form would be calculated from recent fixtures, could include goals for/against, 
            // points per game, etc. This could be expanded in the future.
            responseText += "\nFORM_ANALYSIS:\n";
            responseText += `- Current Form: ${foundTeam.form || 'N/A'}\n`;
            responseText += `- Home Strength: ${foundTeam.strength_overall_home || 'N/A'}/5\n`;
            responseText += `- Away Strength: ${foundTeam.strength_overall_away || 'N/A'}/5\n`;
            
            // Some additional insights based on available data
            if (foundTeam.played && foundTeam.played > 0 && foundTeam.points) {
                const ppg = (foundTeam.points / foundTeam.played).toFixed(2);
                responseText += `- Points Per Game: ${ppg}\n`;
            }
        }
        
        responseText += `\nData timestamp: ${dataTimestamp}`;

        if (includeRawData) {
            responseText += '\n\nRAW_DATA:\n' + JSON.stringify(rawDataForOutput, null, 2);
        }

        return {
            content: [{ type: 'text' as const, text: responseText.trim() }]
        };

    } catch (error) {
        console.error('Error in getTeamData tool:', error);
        
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
            err.message || 'An unknown error occurred while fetching team data.',
            'TOOL_EXECUTION_ERROR'
        );
    }
}