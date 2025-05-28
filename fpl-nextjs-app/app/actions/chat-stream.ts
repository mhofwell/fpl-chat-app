// app/actions/chat-stream.ts
'use server';

import { Anthropic } from '@anthropic-ai/sdk';
import { ToolUseBlock } from '@anthropic-ai/sdk/resources';
import { callMcpTool } from './mcp-tools';

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || '',
});

// Use the same tool definitions from the working chat.ts you provided
const toolsForClaude = [
    {
        name: 'get-player',
        description:
            'Retrieves detailed information about a specific FPL player using their name, FPL ID, or other criteria. Can also filter by team and position.',
        input_schema: {
            type: 'object' as const,
            properties: {
                playerQuery: {
                    type: 'string',
                    description:
                        "Player's name (full or partial), FPL ID, or a descriptive query.",
                },
                teamId: {
                    type: 'number',
                    description: 'Optional: FPL ID of the team to filter by.',
                },
                teamName: {
                    type: 'string',
                    description:
                        'Optional: Name of the team to filter by (supports fuzzy matching if teamId is not provided).',
                },
                position: {
                    type: 'string',
                    description:
                        'Optional: Player position to filter by (e.g., GKP, DEF, MID, FWD).',
                },
                includeRawData: {
                    type: 'boolean',
                    description:
                        'Optional: Whether to include raw JSON data in the response. Defaults to false.',
                },
            },
            required: ['playerQuery'],
        },
    },
    {
        name: 'get-team',
        description:
            'Retrieves detailed information about a specific FPL team using its name or FPL ID.',
        input_schema: {
            type: 'object' as const,
            properties: {
                teamQuery: {
                    type: 'string',
                    description:
                        "Team's name (full or partial, supports fuzzy matching) or exact FPL team ID.",
                },
                includeFixtures: {
                    type: 'boolean',
                    description:
                        'Optional: Include upcoming fixtures for the team. Defaults to true.',
                },
                includePlayers: {
                    type: 'boolean',
                    description:
                        'Optional: Include a list of key players for the team. Defaults to false.',
                },
                includeRawData: {
                    type: 'boolean',
                    description:
                        'Optional: Whether to include raw JSON data in the response. Defaults to false.',
                },
            },
            required: ['teamQuery'],
        },
    },
    {
        name: 'get-gameweek',
        description:
            'Retrieves information about an FPL gameweek, specified by ID or type (current, next, previous). Can include fixtures.',
        input_schema: {
            type: 'object' as const,
            properties: {
                gameweekId: {
                    type: 'number',
                    description: 'Optional: ID of the gameweek to retrieve.',
                },
                type: {
                    type: 'string',
                    enum: ['current', 'next', 'previous'],
                    description:
                        'Optional: Specify gameweek by type (current, next, or previous).',
                },
                includeFixtures: {
                    type: 'boolean',
                    description:
                        'Optional: Whether to include fixtures for the gameweek. Defaults to true.',
                },
                includeRawData: {
                    type: 'boolean',
                    description:
                        'Optional: Whether to include raw JSON data in the response. Defaults to false.',
                },
            },
            required: [],
        },
    },
    {
        name: 'search-players',
        description:
            'Searches for FPL players based on various criteria like name, team, position, price, points, and allows sorting.',
        input_schema: {
            type: 'object' as const,
            properties: {
                query: {
                    type: 'string',
                    description:
                        "Optional: Player's name (partial match supported).",
                },
                teamName: {
                    type: 'string',
                    description:
                        'Optional: Team name to filter by (partial match supported).',
                },
                position: {
                    type: 'string',
                    enum: ['GKP', 'DEF', 'MID', 'FWD'],
                    description: 'Optional: Filter by player position.',
                },
                minPrice: {
                    type: 'number',
                    description:
                        'Optional: Minimum price (e.g., 5.5 for £5.5m).',
                },
                maxPrice: {
                    type: 'number',
                    description:
                        'Optional: Maximum price (e.g., 10.0 for £10.0m).',
                },
                minTotalPoints: {
                    type: 'integer',
                    description: 'Optional: Minimum total points.',
                },
                sortBy: {
                    type: 'string',
                    enum: [
                        'total_points_desc',
                        'now_cost_asc',
                        'now_cost_desc',
                        'form_desc',
                        'selected_by_percent_desc',
                        'price_rise_desc',
                        'price_rise_asc',
                    ],
                    description:
                        "Optional: Stat to sort players by and direction. Defaults to 'total_points_desc'.",
                },
                limit: {
                    type: 'integer',
                    description:
                        'Optional: Number of results to return. Defaults to 10.',
                },
                includeRawData: {
                    type: 'boolean',
                    description:
                        'Optional: Whether to include raw JSON data in the response. Defaults to false.',
                },
            },
            required: [],
        },
    },
    {
        name: 'search-fixtures',
        description:
            'Searches for FPL fixtures based on criteria like team(s), gameweek, difficulty, and allows sorting. Can provide details for past matches.',
        input_schema: {
            type: 'object' as const,
            properties: {
                teamQuery: {
                    type: 'string',
                    description:
                        "Optional: One or two team names (e.g., 'Arsenal', or 'Liverpool vs Man City'). Supports partial/fuzzy matching.",
                },
                gameweekId: {
                    type: 'integer',
                    description: 'Optional: Filter by a specific gameweek ID.',
                },
                difficultyMin: {
                    type: 'integer',
                    description:
                        'Optional: Minimum FPL difficulty rating (1-5).',
                },
                difficultyMax: {
                    type: 'integer',
                    description:
                        'Optional: Maximum FPL difficulty rating (1-5).',
                },
                sortBy: {
                    type: 'string',
                    enum: [
                        'kickoff_time_asc',
                        'kickoff_time_desc',
                        'difficulty_desc',
                        'difficulty_asc',
                    ],
                    description:
                        "Optional: Sort order for the fixtures. Defaults to 'kickoff_time_asc'.",
                },
                includeDetails: {
                    type: 'boolean',
                    description:
                        'Optional: If a single specific past match is found, include detailed stats. Defaults to true.',
                },
                limit: {
                    type: 'integer',
                    description:
                        'Optional: Maximum number of fixtures to return. Defaults to 10.',
                },
                includeRawData: {
                    type: 'boolean',
                    description:
                        'Optional: Whether to include raw JSON data in the response. Defaults to false.',
                },
            },
            required: [],
        },
    },
    {
        name: 'compare-entities',
        description:
            'Compares two FPL entities (players or teams) side-by-side on various metrics.',
        input_schema: {
            type: 'object' as const,
            properties: {
                entity1Query: {
                    type: 'string',
                    description: 'Name or FPL ID of the first player or team.',
                },
                entity2Query: {
                    type: 'string',
                    description: 'Name or FPL ID of the second player or team.',
                },
                entityType: {
                    type: 'string',
                    enum: ['player', 'team'],
                    description:
                        "The type of entities to compare ('player' or 'team').",
                },
                includeRawData: {
                    type: 'boolean',
                    description:
                        'Optional: Whether to include raw JSON data in the response. Defaults to false.',
                },
            },
            required: ['entity1Query', 'entity2Query', 'entityType'],
        },
    },
];

// Use the same comprehensive system prompt
const CLAUDE_SYSTEM_PROMPT = `You are a Fantasy Premier League (FPL) expert assistant. Help users with FPL-related queries using your extensive knowledge and the available tools.
When asked about players, teams, fixtures, or gameweeks, use the appropriate tools to get accurate data.
Keep responses concise but informative.

AVAILABLE TOOLS:
- getPlayer: Retrieves detailed information about a specific FPL player. Key parameters: playerQuery (required), teamId, teamName, position.
- searchPlayers: Searches for FPL players based on criteria like name, team, position, price, points. Key parameters: query, teamName, position, minPrice, maxPrice, minTotalPoints, sortBy, limit.
- getTeam: Retrieves detailed information about an FPL team. Key parameters: teamQuery (required), includeFixtures, includePlayers.
- getGameweek: Retrieves information about an FPL gameweek. Key parameters: gameweekId or type (current, next, previous).
- searchFixtures: Searches for FPL fixtures. Key parameters: teamQuery, gameweekId, difficultyMin/Max, sortBy, limit.
- compareEntities: Compares two FPL entities (players or teams). Key parameters: entity1Query (required), entity2Query (required), entityType (required).

TOOL SELECTION STRATEGY:
1. Specific player info: getPlayer.
2. Ranking/list queries ("who has most...", "best players for...", "players by price/form"): searchPlayers.
3. Team performance/info: getTeam.
4. Gameweek specific info (current, next, past ID): getGameweek.
5. Fixture searches (by team, date range, difficulty, H2H): searchFixtures.
6. Direct comparisons (player vs. player, team vs. team): compareEntities.
7. Complex questions: Consider sequential tool use. If unsure, ask for clarification.

RESPONSE GUIDELINES:
- Always provide context for statistics (e.g., "8 goals (3rd highest among midfielders)").
- Include strategic FPL insights when relevant.
- For player recommendations, consider form, fixtures, and value.
- Explain your reasoning for recommendations.
- When appropriate, suggest alternatives or considerations.

Remember that you're advising on Fantasy Premier League (FPL), which is a fantasy sports game based on the English Premier League.`;

/**
 * Simple MCP session management
 */
async function getOrCreateValidSession(mcpSessionId?: string): Promise<string | undefined> {
    if (mcpSessionId) {
        return mcpSessionId;
    }
    
    // Initialize new session using the existing function
    const { initializeMcpSession } = await import('./mcp-tools');
    return await initializeMcpSession();
}

/**
 * Handle calling tools with robust error handling
 */
async function handleToolCalls(
    toolCalls: Array<{ id: string; name: string; input: Record<string, any> }>,
    mcpSessionId: string
): Promise<{
    results: Array<{
        toolCall: { id: string; name: string; input: Record<string, any> };
        result: any;
    }>;
    newSessionId?: string;
    errors: Array<{
        toolCall: { id: string; name: string; input: Record<string, any> };
        error: string;
    }>;
}> {
    let updatedSessionId = mcpSessionId;
    const results: Array<{
        toolCall: { id: string; name: string; input: Record<string, any> };
        result: any;
    }> = [];
    const errors: Array<{
        toolCall: { id: string; name: string; input: Record<string, any> };
        error: string;
    }> = [];

    // Process each tool call with timeout
    await Promise.all(
        toolCalls.map(async (toolCall) => {
            try {
                // Add timeout wrapper
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('Tool call timeout')), 10000);
                });

                const callPromise = callMcpTool(
                    toolCall.name,
                    toolCall.input,
                    updatedSessionId
                );

                const result = await Promise.race([callPromise, timeoutPromise]);

                // Update the session ID if we received a new one
                if (result.sessionId) {
                    updatedSessionId = result.sessionId;
                }

                if (result.success) {
                    results.push({
                        toolCall,
                        result: result.result,
                    });
                } else {
                    errors.push({
                        toolCall,
                        error: result.error || 'Unknown error',
                    });
                }
            } catch (error) {
                console.error('Tool call error:', error);
                errors.push({
                    toolCall,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        })
    );

    return { results, newSessionId: updatedSessionId, errors };
}

export async function* streamChatResponse(
    message: string,
    mcpSessionId?: string
) {
    let sessionId = mcpSessionId;

    try {
        console.log('Starting streamChatResponse with:', { message, mcpSessionId });
        
        // Get a valid MCP session ID
        sessionId = await getOrCreateValidSession(mcpSessionId);
        if (!sessionId) {
            yield { type: 'error', content: 'Failed to establish a connection with the FPL data service. Please try again later.' };
            return;
        }

        // Yield session info if it's a new session
        if (!mcpSessionId) {
            yield { type: 'session', sessionId };
        }

        // Call Claude with tools enabled and streaming
        const stream = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            system: CLAUDE_SYSTEM_PROMPT,
            messages: [{ role: 'user' as const, content: message }],
            stream: true,
            tools: toolsForClaude,
            tool_choice: { type: 'auto' },
        });

        // Handle streaming response
        const toolCalls: any[] = [];
        
        for await (const chunk of stream) {
            console.log('Received chunk:', chunk.type);
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                yield { type: 'text', content: chunk.delta.text };
            } else if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
                console.log('Found tool call:', chunk.content_block.name);
                toolCalls.push(chunk.content_block);
                yield { type: 'tool_call', toolName: chunk.content_block.name };
            } else if (chunk.type === 'content_block_start') {
                console.log('Content block start:', chunk.content_block.type);
            } else if (chunk.type === 'message_stop') {
                console.log('Message stopped');
            }
        }
        
        console.log('Stream ended, tool calls found:', toolCalls.length);
        
        // If there were tool calls, handle them
        if (toolCalls.length > 0) {
            console.log('Processing tool calls:', toolCalls.length);
            
            // Process tool calls with proper error handling
            const { results, newSessionId, errors } = await handleToolCalls(
                toolCalls.map((tool) => ({
                    id: tool.id,
                    name: tool.name,
                    input: tool.input as Record<string, any>,
                })),
                sessionId
            );

            // Update the session ID if needed
            const updatedSessionId = newSessionId || sessionId;

            // Format the tool results for the follow-up message
            const toolResults = [
                ...results.map(({ toolCall, result }) => ({
                    type: 'tool_result' as const,
                    tool_use_id: toolCall.id,
                    content:
                        typeof result === 'string'
                            ? result
                            : JSON.stringify(result),
                })),
                ...errors.map(({ toolCall, error }) => ({
                    type: 'tool_result' as const,
                    tool_use_id: toolCall.id,
                    content: JSON.stringify({ error }),
                })),
            ];

            // Construct the assistant's tool use turn content array
            const assistantToolUseContent = toolCalls.map((block) => ({
                type: 'tool_use' as const,
                id: block.id,
                name: block.name,
                input: block.input,
            }));
            
            // Send a follow-up message with tool results to get final response
            const finalStream = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                system: `You are a Fantasy Premier League (FPL) assistant. You have received results from tools you requested. Use these results to answer the user's original question comprehensively.`,
                messages: [
                    { role: 'user' as const, content: message },
                    {
                        role: 'assistant' as const,
                        content: assistantToolUseContent,
                    },
                    {
                        role: 'user' as const,
                        content: toolResults
                    }
                ],
                stream: true
            });
            
            // Stream the final response
            for await (const chunk of finalStream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    yield { type: 'text', content: chunk.delta.text };
                }
            }
            
            // Update session ID
            sessionId = updatedSessionId;
        }

        return { sessionId };
    } catch (error) {
        console.error('Error processing message with Claude:', error);
        yield { type: 'error', content: 'Sorry, I encountered an error while processing your question.' };
    }
}