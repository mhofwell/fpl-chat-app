// In resources/fpl/teams.ts
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import redis from '../../lib/redis/redis-client';
import { Team } from '../../../../../types/fpl-domain.types';

export const teamsResource = {
  name: 'fpl-teams',
  template: new ResourceTemplate('fpl://teams/{teamId?}', { list: undefined }),
  handler: async (uri: URL, variables: { teamId?: string }) => {
        try {
            const cachedData = await redis.get('fpl:teams');
            if (!cachedData) {
                return {
                    contents: [
                        {
                            uri: uri.href,
                            text: 'Teams data not available',
                        },
                    ],
                };
            }

            const teams: Team[] = JSON.parse(cachedData);

            // If teamId is provided, return specific team
            if (variables.teamId) {
                const team = teams.find(
                    (t) => t.id === parseInt(variables.teamId!)
                );
                if (!team) {
                    return {
                        contents: [
                            {
                                uri: uri.href,
                                text: `Team with ID ${variables.teamId} not found`,
                            },
                        ],
                    };
                }

                return {
                    contents: [
                        {
                            uri: uri.href,
                            text: JSON.stringify(team, null, 2),
                        },
                    ],
                };
            }

            // Otherwise return a list of all teams
            return {
                contents: [
                    {
                        uri: uri.href,
                        text: JSON.stringify(
                            teams.map((t) => ({ id: t.id, name: t.name })),
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            console.error('Error fetching teams:', error);
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
