// src/tools/fpl/top-scorers.ts
import redis from '../../lib/redis/redis-client';

export async function getTopScorers(
    { limit = 10, position }: 
    { limit?: number; position?: string },
    _extra: any
) {
    try {
        // Get player data from bootstrap-static which has season totals
        let players: any[] = [];
        
        // First try bootstrap-static endpoint which has complete season stats
        const bootstrapData = await redis.get('fpl:bootstrap-static');
        if (bootstrapData) {
            const bootstrap = JSON.parse(bootstrapData);
            if (bootstrap.elements && Array.isArray(bootstrap.elements)) {
                console.log(`Found ${bootstrap.elements.length} players in bootstrap data`);
                players = bootstrap.elements;
            }
        }
        
        // Fallback to players cache if bootstrap data not available
        if (players.length === 0) {
            console.log('No bootstrap data found, trying players cache');
            const cachedData = await redis.get('fpl:players');
            if (!cachedData) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: 'Players data not found in cache. Please ensure FPL data is synced.',
                        },
                    ],
                    isError: true,
                };
            }
            players = JSON.parse(cachedData);
        }
        
        console.log(`Total players in cache: ${players.length}`);
        
        // Filter by position if specified
        if (position) {
            const positionMap: Record<string, number> = {
                'GKP': 1,
                'DEF': 2,
                'MID': 3,
                'FWD': 4
            };
            
            const elementType = positionMap[position.toUpperCase()];
            if (elementType) {
                players = players.filter(p => p.element_type === elementType);
            }
        }
        
        // Sort by goals scored (descending)
        players.sort((a, b) => (b.goals_scored || 0) - (a.goals_scored || 0));
        
        // Log top player to check data quality
        const topPlayer = players[0];
        console.log('Top player check:', {
            name: topPlayer?.web_name,
            goals: topPlayer?.goals_scored,
            assists: topPlayer?.assists,
            points: topPlayer?.total_points,
            team: topPlayer?.team
        });
        
        // Get top scorers (filter to only those with goals > 0)
        const topScorers = players
            .filter(p => (p.goals_scored || 0) > 0)
            .slice(0, limit);
        
        // If no one has scored yet
        if (topScorers.length === 0) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'No players have scored goals yet this season. The season may have just started or the data needs to be refreshed.',
                    },
                ],
            };
        }
        
        // Get team information
        const teams = JSON.parse(await redis.get('fpl:teams') || '[]');
        
        // Format the response
        let response = `Top ${limit} Goal Scorers${position ? ` (${position})` : ''}:\n\n`;
        
        topScorers.forEach((player, index) => {
            const team = teams.find((t: any) => t.id === (player.team || player.team_id));
            const fullName = player.first_name && player.second_name 
                ? `${player.first_name} ${player.second_name}`
                : player.full_name || player.web_name;
            response += `${index + 1}. ${fullName} (${player.web_name})\n`;
            response += `   Team: ${team?.name || 'Unknown'}\n`;
            response += `   Goals: ${player.goals_scored || 0}\n`;
            response += `   Assists: ${player.assists || 0}\n`;
            response += `   Minutes: ${player.minutes || 0}\n`;
            response += `   Total Points: ${player.total_points || 0}\n\n`;
        });
        
        // Add note about data freshness
        try {
            const gameweekData = await redis.get('fpl:gameweeks');
            if (gameweekData) {
                const gameweeks = JSON.parse(gameweekData);
                const currentGw = gameweeks.find((gw: any) => gw.is_current) || 
                                gameweeks.find((gw: any) => gw.is_next);
                if (currentGw) {
                    response += `\nData current as of Gameweek ${currentGw.id}`;
                }
            }
        } catch (error) {
            console.error('Error getting gameweek info:', error);
        }

        return {
            content: [
                {
                    type: 'text' as const,
                    text: response,
                },
            ],
        };
    } catch (error) {
        console.error('Error getting top scorers:', error);
        return {
            content: [
                {
                    type: 'text' as const,
                    text: `Error: ${
                        error instanceof Error ? error.message : 'Unknown error'
                    }`,
                },
            ],
            isError: true,
        };
    }
}