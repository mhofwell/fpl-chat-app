// src/tools/fpl/team.ts
import redis from '../../lib/redis/redis-client';
import { Team } from '../../../../../types/fpl-domain.types'; 


interface GetTeamParams {
    teamQuery: string;
    includeFixtures?: boolean;
    includePlayers?: boolean;
    includeRawData?: boolean;
}

// Using the existing fuzzyMatch from player.ts, ideally this would be a shared utility
function fuzzyMatch(text: string, searchTerm: string): boolean {
    if (!text || !searchTerm) return false;
    const normalizedText = text.toLowerCase();
    const searchWords = searchTerm.toLowerCase().split(' ').filter(s => s.length > 0);
    
    return searchWords.every(searchWord => normalizedText.includes(searchWord));
}

// Using the existing createErrorResponse from player.ts, ideally this would be a shared utility
function createErrorResponse(message: string, type: string = 'GENERIC_ERROR', suggestions?: string[]) {
    let text = `ERROR:\nType: ${type}\nMessage: ${message}`;
    if (suggestions && suggestions.length > 0) {
        text += `\n\nSUGGESTIONS:\n- ${suggestions.join('\n- ')}`;
    }
    text += `\nData timestamp: ${new Date().toISOString()}`;
    return {
        content: [{ type: 'text' as const, text }],
        isError: true,
    };
}

export async function getTeam(
    params: GetTeamParams,
    _extra: any
) {
    const { teamQuery, includeFixtures = true, includePlayers = false, includeRawData = false } = params;
    const dataTimestamp = new Date().toISOString();

    try {
        const [teamsCached, playersCached, fixturesCached, gameweeksCached] = await Promise.all([
            redis.get('fpl:teams'),
            redis.get('fpl:players'),
            redis.get('fpl:fixtures'), // Assuming this stores FplFixture[] for difficulty
            redis.get('fpl:gameweeks')
        ]);

        if (!teamsCached) {
            return createErrorResponse('Teams data not found in cache.', 'CACHE_ERROR', ['Ensure data synchronization jobs are running.']);
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
            return createErrorResponse(`Team "${effectiveTeamQuery}" not found.`, 'NOT_FOUND', ['Check spelling or try a different team name/ID.']);
        }

        if (potentialTeams.length > 1) {
            const limit = 5;
            if (potentialTeams.length > limit) {
                 return createErrorResponse(
                    `Query "${effectiveTeamQuery}" matched ${potentialTeams.length} teams. Please be more specific.`,
                    'AMBIGUOUS_QUERY',
                    ['Try using the exact FPL team ID if known.']
                );
            }
            const disambiguationText = `DISAMBIGUATION_REQUIRED:\nYour query matched ${potentialTeams.length} teams. Please specify one:\nData timestamp: ${dataTimestamp}\n\n${potentialTeams.slice(0, limit).map((t, idx) => 
                `CANDIDATE_${idx + 1}:\nName: ${t.name} (${t.short_name})\nFPL ID: ${t.id}`
            ).join('\n\n')}\n\nTo get specific team data, please use the FPL ID or a more precise name.`;
            return { content: [{ type: 'text' as const, text: disambiguationText }] };
        }

        const foundTeam = potentialTeams[0];
        let responseText = `