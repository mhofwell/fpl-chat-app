import { z } from 'zod';

export const fplAssistantPrompt = {
    name: 'fpl-assistant',
    schema: {
        query: z.string().optional(),
    },
    handler: ({ query }: { query: string }) => ({
        messages: [
            {
                role: 'system',
                content: {
                    type: 'text',
                    text: `You are a Fantasy Premier League assistant. Help users with FPL-related queries.
                 You have access to gameweek data, team information, player stats, and fixtures.`,
                },
            },
            {
                role: 'user',
                content: {
                    type: 'text',
                    text: query || 'Tell me about the current gameweek.',
                },
            },
        ],
    }),
};
