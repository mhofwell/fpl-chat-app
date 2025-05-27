// src/tools/fpl/top-scorers.ts
import redis from '../../lib/redis/redis-client';
import { Player } from '../../types/fpl';

export async function getTopScorers(
    { limit = 10, position }: 
    { limit?: number; position?: string },
    _extra: any
) {
    try {
        const cachedData = await redis.get('fpl:players');
        if (!cachedData) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Players data not found in cache',
                    },
                ],
                isError: true,
            };
        }

        let players: Player[] = JSON.parse(cachedData);
        
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
        
        // Get top scorers
        const topScorers = players.slice(0, limit);
        
        // Get team information
        const teams = JSON.parse(await redis.get('fpl:teams') || '[]');
        
        // Format the response
        let response = `Top ${limit} Goal Scorers${position ? ` (${position})` : ''}:\n\n`;
        
        topScorers.forEach((player, index) => {
            const team = teams.find((t: any) => t.id === player.team_id);
            response += `${index + 1}. ${player.full_name} (${player.web_name})\n`;
            response += `   Team: ${team?.name || 'Unknown'}\n`;
            response += `   Goals: ${player.goals_scored || 0}\n`;
            response += `   Assists: ${player.assists || 0}\n`;
            response += `   Minutes: ${player.minutes || 0}\n`;
            response += `   Total Points: ${player.total_points || 0}\n\n`;
        });
        
        // Add note about data freshness
        const gameweekData = await redis.get('fpl:gameweeks');
        if (gameweekData) {
            const gameweeks = JSON.parse(gameweekData);
            const currentGw = gameweeks.find((gw: any) => gw.is_current);
            if (currentGw) {
                response += `\nData current as of Gameweek ${currentGw.id}`;
            }
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