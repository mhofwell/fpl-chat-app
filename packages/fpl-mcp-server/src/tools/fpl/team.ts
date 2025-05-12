// src/tools/fpl/team.ts
import redis from '../../lib/redis/redis-client';
import { Team, Player, Fixture } from 'fpl-domain.types';
import { fuzzyMatch } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
interface GetTeamParams {
    teamQuery: string;
    includeFixtures?: boolean;
    includePlayers?: boolean;
    includeRawData?: boolean;
    // Future considerations based on enhancement plan:
    // period?: string; 
    // includeForm?: boolean; 
}

export async function getTeam(
    params: GetTeamParams,
    _extra: any
) {
    const { teamQuery, includeFixtures = true, includePlayers = false, includeRawData = false } = params;
    const dataTimestamp = new Date().toISOString();

    try {
        const [teamsCached, playersCached, fixturesCached] = await Promise.all([
            redis.get('fpl:teams'),
            redis.get('fpl:players'), // Needed for includePlayers
            redis.get('fpl:fixtures'), // Needed for includeFixtures
        ]);

        if (!teamsCached) {
            return createStructuredErrorResponse('Teams data not found in cache.', 'CACHE_ERROR', ['Ensure data synchronization jobs are running.']);
        }
        
        const allTeams: Team[] = JSON.parse(teamsCached);
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
            return createStructuredErrorResponse(`Team "${effectiveTeamQuery}" not found.`, 'NOT_FOUND', ['Check spelling or try a different team name/ID.']);
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
        responseText += `Code: ${foundTeam.code}\n`;

        responseText += "\nKEY_STATS:\n";
        responseText += `Played: ${foundTeam.played ?? 'N/A'}\n`;
        responseText += `Points: ${foundTeam.points ?? 'N/A'}\n`;
        responseText += `Position: ${foundTeam.position ?? 'N/A'}\n`;
        responseText += `Wins: ${foundTeam.win ?? 'N/A'}\n`;
        responseText += `Losses: ${foundTeam.loss ?? 'N/A'}\n`;
        responseText += `Draws: ${foundTeam.draw ?? 'N/A'}\n`;
        responseText += `Form: ${foundTeam.form || 'N/A'}\n`; // Simple form string
        responseText += `Strength: ${foundTeam.strength ?? 'N/A'}\n`;
        responseText += `Strength Overall Home: ${foundTeam.strength_overall_home ?? 'N/A'}\n`;
        responseText += `Strength Overall Away: ${foundTeam.strength_overall_away ?? 'N/A'}\n`;
        responseText += `Strength Attack Home: ${foundTeam.strength_attack_home ?? 'N/A'}\n`;
        responseText += `Strength Attack Away: ${foundTeam.strength_attack_away ?? 'N/A'}\n`;
        responseText += `Strength Defence Home: ${foundTeam.strength_defence_home ?? 'N/A'}\n`;
        responseText += `Strength Defence Away: ${foundTeam.strength_defence_away ?? 'N/A'}\n`;

        const rawDataForOutput: any = { team: foundTeam };


        if (includePlayers && playersCached) {
            responseText += "\nKEY_PLAYERS:\n";
            const allPlayers: Player[] = JSON.parse(playersCached);
            const teamPlayers = allPlayers
                .filter(p => p.team_id === foundTeam.id)
                .sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0)) // Sort by total points desc
                .slice(0, 5); // Top 5

            if (teamPlayers.length > 0) {
                teamPlayers.forEach(p => {
                    responseText += `- ${p.full_name} (${p.position || 'N/A'}) - Points: ${p.total_points ?? 0}, Cost: £${(p.now_cost ?? 0)/10}m\n`;
                });
                rawDataForOutput.key_players = teamPlayers;
            } else {
                responseText += "- No key players data available for this team.\n";
            }
        } else if (includePlayers && !playersCached) {
            responseText += "\nKEY_PLAYERS:\n- Player data currently unavailable in cache.\n";
        }

        if (includeFixtures && fixturesCached && teamsCached) { // teamsCached needed again for opponent names
            responseText += "\nUPCOMING_FIXTURES:\n";
            const allFixtures: Fixture[] = JSON.parse(fixturesCached);
            const allTeamsForFixtures: Team[] = JSON.parse(teamsCached); // re-parse or pass `allTeams`

            const upcomingTeamFixtures = allFixtures
                .filter(f => (f.home_team_id === foundTeam.id || f.away_team_id === foundTeam.id) && !f.finished)
                .sort((a, b) => (a.gameweek_id ?? 0) - (b.gameweek_id ?? 0) || (new Date(a.kickoff_time || 0).getTime() - new Date(b.kickoff_time || 0).getTime()))
                .slice(0, 5); // Next 5

            if (upcomingTeamFixtures.length > 0) {
                upcomingTeamFixtures.forEach(fixture => {
                    const isHome = fixture.home_team_id === foundTeam.id;
                    const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
                    const opponent = allTeamsForFixtures.find(t => t.id === opponentId);
                    const venue = isHome ? '(H)' : '(A)';
                    const difficulty = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;
                    responseText += `- GW${fixture.gameweek_id}: vs ${opponent?.short_name || `Team ${opponentId}`} ${venue} (Diff: ${difficulty ?? 'N/A'})\n`;
                });
                rawDataForOutput.upcoming_fixtures = upcomingTeamFixtures;
            } else {
                responseText += "- No upcoming fixtures found for this team.\n";
            }
        } else if (includeFixtures && (!fixturesCached || !teamsCached)) {
            responseText += "\nUPCOMING_FIXTURES:\n- Fixture or full team data currently unavailable in cache.\n";
        }
        
        responseText += `\nData timestamp: ${dataTimestamp}`;

        if (includeRawData) {
            responseText += '\n\nRAW_DATA:\n' + JSON.stringify(rawDataForOutput, null, 2);
        }

        return {
            content: [{ type: 'text' as const, text: responseText.trim() }], // Trim leading/trailing whitespace
        };

    } catch (error) {
        console.error('Error in getTeam tool:', error);
        const err = error as Error;
        return createStructuredErrorResponse(
            err.message || 'An unknown error occurred while fetching team data.',
            'TOOL_EXECUTION_ERROR'
        );
    }
}