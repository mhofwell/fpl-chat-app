import Anthropic from '@anthropic-ai/sdk';

// Export tools so they can be imported in route.ts
export const toolsForClaude = [
    {
        type: 'custom',
        name: 'get_player_info',
        description:
            'Use this tool whenever a user asks about a player\'s stats, information, or data. Extract the player name from the user\'s message and pass it as the name parameter. Example: "how is Salah doing" → name: "Salah"',
        input_schema: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description:
                        "The player name extracted from the user's message. Pass the name exactly as mentioned by the user.",
                },
            },
            required: ['name'],
        },
    },
];

// Dynamic context that can be updated with current season data
export const getFPLContext = () => {
    const currentDate = new Date().toLocaleDateString('en-GB');

    // This could be fetched from your FPL API or database
    // For now, using static data, replace with actual API calls.
    const seasonContext = {
        season: '2024/25',
        currentGameweek: 15,
        topScorers: 'Haaland (12 goals), Salah (10 goals), Watkins (8 goals)',
        topAssists: 'Salah (8), Saka (7), Palmer (6)',
        injuredPlayers: 'Alisson (out 6 weeks), Martinelli (doubtful)',
        upcomingDeadline: 'Sat 7 Dec, 11:00 GMT',
        priceChanges: 'Haaland (£10.5m → £11.0m), Salah (£10.0m → £10.5m)',
        topTransfers: 'Haaland (12m), Salah (10m), Watkins (8m)',
    };

    return `Current FPL Context (as of ${currentDate}):
- Season: ${seasonContext.season}
- Current Gameweek: ${seasonContext.currentGameweek}
- Top Scorers: ${seasonContext.topScorers}
- Top Assists: ${seasonContext.topAssists}
- Key Injuries: ${seasonContext.injuredPlayers}
- Next Deadline: ${seasonContext.upcomingDeadline}
- Price Changes: ${seasonContext.priceChanges}
- Transfer Trends: ${seasonContext.topTransfers}`;
};

// Export system prompt with dynamic context
export const CLAUDE_SYSTEM_PROMPT = `You are a Fantasy Premier League (FPL) expert assistant. Help users with FPL-related queries using your extensive knowledge and the available tools.

When asked about players, teams, fixtures, or gameweeks, use the appropriate tools to get accurate data.
Keep responses concise but informative.

AVAILABLE TOOLS:
- get_player_info: Retrieves detailed information about a specific FPL player. Key parameters: name (required).

TOOL SELECTION STRATEGY:
1. Specific player info: get_player_info.

RESPONSE GUIDELINES:
- Always provide context for statistics (e.g., "8 goals (3rd highest among midfielders)").
- Include strategic FPL insights when relevant.
- For player recommendations, consider form, fixtures, and value.
- Explain your reasoning for recommendations.
- When appropriate, suggest alternatives or considerations.
- Do not talk about the tool you used to answer the question.
- When you get a response from a tool call, do not simply return the data from the tool, use the data to talk to the user in a natural way.

Remember that you're advising on Fantasy Premier League (FPL), which is a fantasy sports game based on the English Premier League.`;

// Export model constant
export const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';

// Initialize and export anthropic client
export const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
});

// Helper function to create Claude stream with all parameters
export const createClaudeStream = async (message: string) => {
    const createParams: any = {
        model: CLAUDE_MODEL,
        messages: [
            {
                role: 'user',
                content: message,
            },
        ],
        system: CLAUDE_SYSTEM_PROMPT,
        tools: toolsForClaude,
        tool_choice: { type: 'auto' },
        stream: true,
        max_tokens: 1024,
    };

    return await anthropic.messages.create(createParams);
};
