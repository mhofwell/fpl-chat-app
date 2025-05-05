// src/tools/fpl/player.ts
import redis from '../../lib/redis/redis-client';
import { Player } from '../../types/fpl';

function fuzzyMatch(name: string, searchTerm: string): boolean {
    const nameWords = name.toLowerCase().split(' ');
    const searchWords = searchTerm.toLowerCase().split(' ');
    
    return searchWords.every(searchWord => 
        nameWords.some(nameWord => nameWord.includes(searchWord) || 
            searchWord.includes(nameWord))
    );
}

export async function getPlayer(
    { playerId, playerName, includeRawData = false }: 
    { playerId?: number; playerName?: string; includeRawData?: boolean },
    _extra: any
) {
    try {
        // Validate at least one parameter is provided
        if (!playerId && !playerName) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Either playerId or playerName must be provided',
                    },
                ],
                isError: true,
            };
        }

        const cachedData = await redis.get('fpl:players');
        if (!cachedData)
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: 'Players data not found in cache',
                    },
                ],
                isError: true,
            };

        const players: Player[] = JSON.parse(cachedData);
        let player;

        if (playerId) {
            player = players.find((p) => p.id === playerId);
        } else if (playerName) {
            // First try exact match (case insensitive)
            player = players.find(
                (p) => 
                    p.web_name.toLowerCase() === playerName.toLowerCase() ||
                    p.full_name.toLowerCase() === playerName.toLowerCase()
            );
            
            // If no exact match, try partial match
            if (!player) {
                player = players.find(
                    (p) => p.full_name.toLowerCase().includes(playerName.toLowerCase())
                );
            }

            // Try fuzzy matching
            if (!player) {
                player = players.find(p => fuzzyMatch(p.full_name, playerName));
            }
        }

        if (!player) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: playerId 
                            ? `Player with ID ${playerId} not found` 
                            : `Player "${playerName}" not found`,
                    },
                ],
                isError: true,
            };
        }

        // Get player details with team information
        const teams = JSON.parse(await redis.get('fpl:teams') || '[]');
        const team = teams.find((t: any) => t.id === player.team_id);
        
        // Enhanced player object with team info
        const enhancedPlayer = {
            ...player,
            team: team?.name || 'Unknown',
        };

        // Get detailed player information if available
        const playerDetailsCached = await redis.get(`fpl:player:${player.id}:detail`);
        let playerDetails = null;
        
        if (playerDetailsCached) {
            playerDetails = JSON.parse(playerDetailsCached);
        }
        
        // Format the response with all available data
        const response = {
            player: {
                ...player,
                team: team?.name || 'Unknown',
            },
            details: playerDetails,
        };

        // Format player data in a more readable way for chat
        const formattedPlayerData = `
Player: ${player.full_name} (${player.web_name})
Team: ${team?.name || 'Unknown'}
Position: ${player.position}
Form: ${player.form || 'N/A'}
Points Per Game: ${player.points_per_game || 'N/A'}
Total Points: ${player.total_points || 'N/A'}
Selected By: ${player.selected_by_percent || 'N/A'}%
`;

        return {
            content: [
                {
                    type: 'text' as const,
                    text: includeRawData 
                        ? formattedPlayerData + '\n\nRaw data:\n' + JSON.stringify(response, null, 2)
                        : formattedPlayerData,
                },
            ],
        };
    } catch (error) {
        console.error('Error getting player:', error);
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
