// src/resources/fpl/players.ts
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import redis from '../../lib/redis/redis-client';
import { Player } from '../../types/fpl';

export const playersResource = {
    name: 'fpl-players',
    template: new ResourceTemplate('fpl://players/{playerId?}', {
        list: undefined,
    }),
    handler: async (uri: URL, variables: { playerId?: string }) => {
        try {
            const cachedData = await redis.get('fpl:players');
            if (!cachedData) {
                return {
                    contents: [
                        {
                            uri: uri.href,
                            text: 'Players data not available',
                        },
                    ],
                };
            }

            console.log('variables', variables);

            const players: Player[] = JSON.parse(cachedData);

            // If playerId is provided, return specific player
            if (variables.playerId) {
                const player = players.find(
                    (p) => p.id === parseInt(variables.playerId!)
                );
                if (!player) {
                    return {
                        contents: [
                            {
                                uri: uri.href,
                                text: `Player with ID ${variables.playerId} not found`,
                            },
                        ],
                    };
                }

                return {
                    contents: [
                        {
                            uri: uri.href,
                            text: JSON.stringify(player, null, 2),
                        },
                    ],
                };
            }

            // Otherwise return a list of all players (shortened version)
            return {
                contents: [
                    {
                        uri: uri.href,
                        text: JSON.stringify(
                            players.map((p) => ({
                                id: p.id,
                                first_name: p.first_name,
                                second_name: p.second_name,
                                team_id: p.team_id,
                                position: p.element_type,
                            })),
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            console.error('Error fetching players:', error);
            return {
                contents: [
                    {
                        uri: uri.href,
                        text: `Error: ${
                            error instanceof Error
                                ? error.message
                                : 'Unknown error'
                        }`,
                    },
                ],
            };
        }
    },
};
