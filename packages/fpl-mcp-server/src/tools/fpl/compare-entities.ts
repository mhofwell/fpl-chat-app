import redis from '../../lib/redis/redis-client';
import { Player, Team, Fixture } from '../../../../../types/fpl-domain.types';
import { PlayerDetailResponse, FplFixtureStatValue, FplFixtureStat } from '../../../../../types/fpl-api.types'; // For PlayerDetail & stats
import { fuzzyMatch, findAndDisambiguateTeams, FindTeamResult } from '../../lib/utils/text-helpers';
import { createStructuredErrorResponse } from '../../lib/utils/response-helpers';
// --- PLAYER DISAMBIGUATION HELPER ---
interface FindPlayerResult {
    exactMatch?: Player;
    fuzzyMatches?: Player[];
    notFound?: boolean;
    query: string;
}

export function findAndDisambiguatePlayers(
    playerQuery: string,
    allPlayers: Player[],
    _allTeams: Team[] // allTeams can be used for context if heuristic is expanded
): FindPlayerResult {
    const resultBase = { query: playerQuery };
    if (!playerQuery) return { ...resultBase, notFound: true };
    const trimmedQuery = playerQuery.trim().toLowerCase();
    if (!trimmedQuery) return { ...resultBase, notFound: true };

    if (!isNaN(parseInt(trimmedQuery, 10))) {
        const playerIdNum = parseInt(trimmedQuery, 10);
        const playerById = allPlayers.find(p => p.id === playerIdNum);
        return playerById ? { ...resultBase, exactMatch: playerById } : { ...resultBase, notFound: true };
    }

    const exactWebNameMatch = allPlayers.find(p => p.web_name.toLowerCase() === trimmedQuery);
    if (exactWebNameMatch) return { ...resultBase, exactMatch: exactWebNameMatch };

    const exactFullNameMatch = allPlayers.find(p =>
        ((p.first_name || '') + ' ' + (p.second_name || '')).trim().toLowerCase() === trimmedQuery ||
        (p.full_name && p.full_name.toLowerCase() === trimmedQuery)
    );
    if (exactFullNameMatch) return { ...resultBase, exactMatch: exactFullNameMatch };

    let potentialMatches = allPlayers.filter(p =>
        fuzzyMatch(p.web_name, trimmedQuery) ||
        fuzzyMatch(((p.first_name || '') + ' ' + (p.second_name || '')).trim(), trimmedQuery) ||
        (p.full_name && fuzzyMatch(p.full_name, trimmedQuery))
    );
    
    // Simple heuristic: if query contains words that match a team name, prefer players from that team.
    // This is basic; Claude's NLP would be better at pre-filtering or providing team context.
    const queryWords = trimmedQuery.split(' ');
    const possibleTeamNameInQuery = _allTeams.find(team =>
        queryWords.some(qw =>
            qw.length > 2 && (fuzzyMatch(team.name, qw) || fuzzyMatch(team.short_name, qw))
        )
    );
    if (possibleTeamNameInQuery && potentialMatches.length > 1) {
        const furtherFiltered = potentialMatches.filter(p => p.team_id === possibleTeamNameInQuery.id);
        if (furtherFiltered.length > 0) potentialMatches = furtherFiltered;
    }

    if (potentialMatches.length === 1) return { ...resultBase, exactMatch: potentialMatches[0] };
    
    if (potentialMatches.length > 1) {
        const directWebNameAmongFuzzy = potentialMatches.find(p => p.web_name.toLowerCase() === trimmedQuery);
        if (directWebNameAmongFuzzy) return { ...resultBase, exactMatch: directWebNameAmongFuzzy };
        const directFullNameAmongFuzzy = potentialMatches.find(p =>
             (((p.first_name || '') + ' ' + (p.second_name || '')).trim().toLowerCase() === trimmedQuery) ||
             (p.full_name && p.full_name.toLowerCase() === trimmedQuery)
        );
        if (directFullNameAmongFuzzy) return { ...resultBase, exactMatch: directFullNameAmongFuzzy };
        
        const distinctPlayers = Array.from(new Map(potentialMatches.map(p => [p.id, p])).values());
        return { ...resultBase, fuzzyMatches: distinctPlayers.slice(0, 5) };
    }
    return { ...resultBase, notFound: true };
}

// --- MAIN TOOL INTERFACE AND FUNCTION ---
interface CompareEntitiesParams {
    entity1Query: string;
    entity2Query: string;
    entityType: 'player' | 'team';
    includeRawData?: boolean;
}

export async function compareEntities(params: CompareEntitiesParams, _extra: any) {
    const { entity1Query, entity2Query, entityType, includeRawData = false } = params;
    const dataTimestamp = new Date().toISOString();

    try {
        const [playersCached, teamsCached, fixturesCached, /* gameweeksCached - if needed for GW context */] = await Promise.all([
            redis.get('fpl:players'),
            redis.get('fpl:teams'),
            redis.get('fpl:fixtures'),
        ]);

        if (!teamsCached) return createStructuredErrorResponse('Core teams data not found in cache.', 'CACHE_ERROR', ['Ensure FPL data sync is active.']);
        if (entityType === 'player' && !playersCached) return createStructuredErrorResponse('Core players data not found in cache.', 'CACHE_ERROR', ['Ensure FPL data sync is active.']);
        if (!fixturesCached) return createStructuredErrorResponse('Core fixtures data not found in cache (needed for H2H/upcoming).', 'CACHE_ERROR', ['Ensure FPL data sync is active.']);

        const allPlayers: Player[] = playersCached ? JSON.parse(playersCached) : [];
        const allTeams: Team[] = JSON.parse(teamsCached);
        const allFixtures: Fixture[] = JSON.parse(fixturesCached);

        let entity1: Player | Team | null = null;
        let entity2: Player | Team | null = null;
        let disambiguationMessages: string[] = [];
        let entity1Result: FindPlayerResult | FindTeamResult | null = null;
        let entity2Result: FindPlayerResult | FindTeamResult | null = null;

        if (entityType === 'player') {
            entity1Result = findAndDisambiguatePlayers(entity1Query, allPlayers, allTeams);
            entity2Result = findAndDisambiguatePlayers(entity2Query, allPlayers, allTeams);
        } else { // entityType === 'team'
            entity1Result = findAndDisambiguateTeams(entity1Query, allTeams);
            entity2Result = findAndDisambiguateTeams(entity2Query, allTeams);
        }

        // Process Entity 1
        if (entity1Result.exactMatch) entity1 = entity1Result.exactMatch as Player | Team;
        else if (entity1Result.fuzzyMatches && entity1Result.fuzzyMatches.length > 0) {
            let msg = `For "${(entity1Result as FindPlayerResult | FindTeamResult).query}", please clarify which ${entityType}:\n`;
            entity1Result.fuzzyMatches.forEach(e => {
                if (entityType === 'player') {
                    const p = e as Player; const team = allTeams.find(t => t.id === p.team_id);
                    msg += `- ${p.web_name} (${team?.short_name || 'N/A'}, ${p.position || 'N/A'})\n`;
                } else { const t = e as Team; msg += `- ${t.name} (${t.short_name})\n`; }
            });
            disambiguationMessages.push(msg);
        } else { disambiguationMessages.push(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} 1 ("${entity1Query}") not found.`); }

        // Process Entity 2
        if (entity2Result.exactMatch) entity2 = entity2Result.exactMatch as Player | Team;
        else if (entity2Result.fuzzyMatches && entity2Result.fuzzyMatches.length > 0) {
            let msg = `For "${(entity2Result as FindPlayerResult | FindTeamResult).query}", please clarify which ${entityType}:\n`;
            entity2Result.fuzzyMatches.forEach(e => {
                if (entityType === 'player') {
                    const p = e as Player; const team = allTeams.find(t => t.id === p.team_id);
                    msg += `- ${p.web_name} (${team?.short_name || 'N/A'}, ${p.position || 'N/A'})\n`;
                } else { const t = e as Team; msg += `- ${t.name} (${t.short_name})\n`; }
            });
            disambiguationMessages.push(msg);
        } else { disambiguationMessages.push(`${entityType.charAt(0).toUpperCase() + entityType.slice(1)} 2 ("${entity2Query}") not found.`); }


        if (disambiguationMessages.some(m => m.includes("please clarify"))) {
            let fullDisambiguationText = `DISAMBIGUATION_REQUIRED:\n${disambiguationMessages.filter(m => m.includes("please clarify")).join('\n')}`;
            const notFoundStill = disambiguationMessages.filter(m => m.includes("not found."));
            if (notFoundStill.length > 0) fullDisambiguationText += `\nAdditionally: ${notFoundStill.join(' ')}`;
            fullDisambiguationText += `\n\nPlease clarify the entities to proceed.\n\nData timestamp: ${dataTimestamp}`;
            return { content: [{ type: 'text' as const, text: fullDisambiguationText }], isError: true };
        }
        if (!entity1 || !entity2) { // If we reached here and any entity is null, it means it was "not found" and no disambiguation was possible
            return createStructuredErrorResponse(
                `Could not proceed: ${disambiguationMessages.join(' ')} Ensure both entities are correctly specified.`,
                'ENTITY_NOT_FOUND'
            );
        }

        // --- Entities identified, proceed to fetch details and format comparison ---
        let responseText = "";
        // Initialize rawDataForOutput with basic entity info first
        const rawDataForOutput: any = { 
            entity1Query, 
            entity1: entityType === 'player' ? { ...(entity1 as Player) } : { ...(entity1 as Team) }, // Spread to allow adding details later
            entity2Query, 
            entity2: entityType === 'player' ? { ...(entity2 as Player) } : { ...(entity2 as Team) }, 
            entityType 
        };


        if (entityType === 'player') {
            const p1 = entity1 as Player;
            const p2 = entity2 as Player;
            const team1 = allTeams.find(t => t.id === p1.team_id);
            const team2 = allTeams.find(t => t.id === p2.team_id);

            // --- Fetch PlayerDetailResponse for p1 and p2 ---
            let p1Details: PlayerDetailResponse | null = null;
            let p2Details: PlayerDetailResponse | null = null;

            const p1DetailsCached = await redis.get(`fpl:player:${p1.id}:detail`);
            if (p1DetailsCached) p1Details = JSON.parse(p1DetailsCached);
            
            const p2DetailsCached = await redis.get(`fpl:player:${p2.id}:detail`);
            if (p2DetailsCached) p2Details = JSON.parse(p2DetailsCached);

            if (includeRawData) {
                (rawDataForOutput.entity1 as any).details = p1Details; // Add to raw output
                (rawDataForOutput.entity2 as any).details = p2Details; // Add to raw output
            }

            responseText = `PLAYER_COMPARISON:\nComparing ${p1.web_name} (${team1?.short_name || 'N/A'}) vs ${p2.web_name} (${team2?.short_name || 'N/A'})\n\n`;
            
            const statPad = 18; // Padding for stat labels
            const valPad = 15;  // Padding for values to align columns

            responseText += "STATISTIC".padEnd(statPad) + "| " + p1.web_name.substring(0,valPad-2).padEnd(valPad) + "| " + p2.web_name.substring(0,valPad-2).padEnd(valPad) + "\n";
            responseText += "-".repeat(statPad) + "|-" + "-".repeat(valPad-1) + "|-" + "-".repeat(valPad-1) + "\n";
            
            const formatStat = (label: string, val1: any, val2: any, suffix1 = "", suffix2 = "") => 
                `${label.padEnd(statPad)}| ${(val1 ?? 'N/A').toString().substring(0,valPad-2-suffix1.length)}${suffix1}`.padEnd(statPad + 2 + valPad) + 
                `| ${(val2 ?? 'N/A').toString().substring(0,valPad-2-suffix2.length)}${suffix2}\n`;

            responseText += formatStat("Price", `£${(p1.now_cost ?? 0 / 10).toFixed(1)}`, `£${(p2.now_cost ?? 0 / 10).toFixed(1)}`, "m", "m");
            responseText += formatStat("Total Points", p1.total_points, p2.total_points);
            responseText += formatStat("Form", p1.form, p2.form);
            responseText += formatStat("Goals Scored", p1.goals_scored, p2.goals_scored);
            responseText += formatStat("Assists", p1.assists, p2.assists);
            responseText += formatStat("Selected By", p1.selected_by_percent, p2.selected_by_percent, "%", "%");
            responseText += formatStat("ICT Index", p1.ict_index, p2.ict_index);
            responseText += formatStat("Minutes", p1.minutes, p2.minutes);
            responseText += formatStat("Bonus Points", p1.bonus, p2.bonus);


            // --- Upcoming Fixtures using PlayerDetailResponse ---
            responseText += "\nUPCOMING_FIXTURES (Next 3):\n";
            const formatPlayerFixtures = (playerName: string, details: PlayerDetailResponse | null, label: string) => {
                responseText += `${label} ${playerName}:\n`;
                if (details?.fixtures && details.fixtures.length > 0) {
                    details.fixtures.slice(0, 3).forEach(fix => {
                        const opponentTeamId = fix.is_home ? fix.team_a : fix.team_h;
                        const opponentTeam = allTeams.find(t => t.id === opponentTeamId);
                        const venue = fix.is_home ? '(H)' : '(A)';
                        responseText += `  - GW${fix.event_name?.replace('Gameweek ','') || fix.event}: ${opponentTeam?.short_name || 'N/A'} ${venue} (Diff: ${fix.difficulty})\n`;
                    });
                } else {
                    responseText += "  - Fixture details not available or no upcoming fixtures.\n";
                }
            };
            formatPlayerFixtures(p1.web_name, p1Details, "P1");
            formatPlayerFixtures(p2.web_name, p2Details, "P2");

            // --- Optional: Current Season Detailed Stats (e.g., last 5 GWs) ---
            // This would involve iterating p1Details.history and p2Details.history
            // responseText += "\nRECENT_PERFORMANCE (Last 5 GWs):\n";
            // (Add logic here if desired)

            // --- Optional: Past Season Summary ---
            // This would involve iterating p1Details.history_past and p2Details.history_past
            // responseText += "\nPAST_SEASONS_SUMMARY:\n";
            // (Add logic here if desired)

        } else { // entityType === 'team'
            const t1 = entity1 as Team;
            const t2 = entity2 as Team;
            responseText = `TEAM_COMPARISON:\nComparing ${t1.name} (${t1.short_name}) vs ${t2.name} (${t2.short_name})\n\n`;

            const statPad = 22; // Adjusted for potentially longer labels like "W-D-L Record"
            const valPad = 15; // Adjusted for team short names and stat values
            
            responseText += "STATISTIC".padEnd(statPad) + "| " + t1.short_name.padEnd(valPad) + "| " + t2.short_name.padEnd(valPad) + "\n";
            responseText += "-".repeat(statPad) + "+-" + "-".repeat(valPad) + "+-" + "-".repeat(valPad) + "\n"; // Changed to + for clarity

            const formatTeamStat = (label: string, val1: any, val2: any) => 
                `${label.padEnd(statPad)}| ${val1?.toString().padEnd(valPad) ?? 'N/A'.padEnd(valPad)}| ${val2?.toString().padEnd(valPad) ?? 'N/A'.padEnd(valPad)}\n`;

            responseText += formatTeamStat("League Position", t1.position, t2.position);
            responseText += formatTeamStat("Points", t1.points, t2.points);
            responseText += formatTeamStat("Form", t1.form || "N/A", t2.form || "N/A");
            const t1WDL = `${t1.win || 0}-${t1.draw || 0}-${t1.loss || 0}`;
            const t2WDL = `${t2.win || 0}-${t2.draw || 0}-${t2.loss || 0}`;
            responseText += formatTeamStat("W-D-L Record", t1WDL, t2WDL);
            responseText += formatTeamStat("Overall Strength", t1.strength, t2.strength);
            responseText += formatTeamStat("Strength Attack Home", t1.strength_attack_home, t2.strength_attack_home);
            responseText += formatTeamStat("Strength Attack Away", t1.strength_attack_away, t2.strength_attack_away);
            responseText += formatTeamStat("Strength Defence Home", t1.strength_defence_home, t2.strength_defence_home);
            responseText += formatTeamStat("Strength Defence Away", t1.strength_defence_away, t2.strength_defence_away);
            responseText += formatTeamStat("Played", t1.played, t2.played);


            // --- Head-to-Head (Last 5 Finished) ---
            responseText += "\nHEAD-TO-HEAD (Last 5 Finished Matches):\n";
            const h2hFixtures = allFixtures.filter(f =>
                f.finished &&
                ((f.home_team_id === t1.id && f.away_team_id === t2.id) ||
                 (f.home_team_id === t2.id && f.away_team_id === t1.id))
            ).sort((a, b) => new Date(b.kickoff_time || 0).getTime() - new Date(a.kickoff_time || 0).getTime())
             .slice(0, 5);

            if (h2hFixtures.length > 0) {
                h2hFixtures.forEach(fix => {
                    const homeTeam = allTeams.find(t => t.id === fix.home_team_id);
                    const awayTeam = allTeams.find(t => t.id === fix.away_team_id);
                    const kickoffDate = fix.kickoff_time ? new Date(fix.kickoff_time).toLocaleDateString('en-GB', { year: '2-digit', month: 'short', day: 'numeric' }) : 'Date N/A';
                    responseText += `  - ${kickoffDate} (GW${fix.gameweek_id || 'N/A'}): ${homeTeam?.short_name} ${fix.team_h_score} - ${fix.team_a_score} ${awayTeam?.short_name}\n`;
                });
            } else {
                responseText += "  - No recent head-to-head matches found in available data.\n";
            }

            // --- Upcoming Fixtures (Next 3) ---
            responseText += "\nUPCOMING_FIXTURES (Next 3):\n";
            const formatTeamUpcomingFixtures = (team: Team, label: string) => {
                responseText += `${label} ${team.name} (${team.short_name}):\n`;
                const upcoming = allFixtures.filter(f =>
                    !f.finished && (f.home_team_id === team.id || f.away_team_id === team.id)
                ).sort((a, b) => new Date(a.kickoff_time || Infinity).getTime() - new Date(b.kickoff_time || Infinity).getTime())
                 .slice(0, 3);

                if (upcoming.length > 0) {
                    upcoming.forEach(fix => {
                        const isHome = fix.home_team_id === team.id;
                        const opponentTeamId = isHome ? fix.away_team_id : fix.home_team_id;
                        const opponentTeam = allTeams.find(t => t.id === opponentTeamId);
                        const venue = isHome ? '(H)' : '(A)';
                        const difficulty = isHome ? fix.team_h_difficulty : fix.team_a_difficulty;
                        responseText += `  - GW${fix.gameweek_id || 'N/A'}: ${opponentTeam?.short_name || 'N/A'} ${venue} (Diff: ${difficulty})\n`;
                    });
                } else {
                    responseText += "  - No upcoming fixtures found in available data.\n";
                }
            };
            formatTeamUpcomingFixtures(t1, "Team 1:");
            formatTeamUpcomingFixtures(t2, "Team 2:");
        }

        responseText += `\n\nData timestamp: ${dataTimestamp}`;
        
        const finalResponse: any = { content: [{ type: 'text' as const, text: responseText }] };
        if (includeRawData) {
            finalResponse.rawData = rawDataForOutput;
        }
        return finalResponse;

    } catch (error: any) {
        console.error('Error in compareEntities tool:', error);
        const err = error as Error;
        return createStructuredErrorResponse(
            err.message || 'An unknown error occurred during entity comparison.',
            'TOOL_EXECUTION_ERROR'
        );
    }
}
