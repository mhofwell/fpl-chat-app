// app/actions/chat.ts
'use server';

import { Anthropic } from '@anthropic-ai/sdk';
import { TextBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources';
// we will need to use the supabase client to store the chat history lets do this later
//
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
//
import { callMcpTool } from './mcp-tools';

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || '',
});

// Recommended tools array for packages/fpl-nextjs-app/app/actions/chat.ts

const toolsForClaude = [
    {
        name: 'get-player',
        description: 'Retrieves detailed information about a specific FPL player using their name, FPL ID, or other criteria. Can also filter by team and position.',
        input_schema: {
            type: 'object' as const,
            properties: {
                playerQuery: {
                    type: 'string',
                    description: "Player's name (full or partial), FPL ID, or a descriptive query."
                },
                teamId: {
                    type: 'number',
                    description: 'Optional: FPL ID of the team to filter by.'
                },
                teamName: {
                    type: 'string',
                    description: 'Optional: Name of the team to filter by (supports fuzzy matching if teamId is not provided).'
                },
                position: {
                    type: 'string',
                    description: 'Optional: Player position to filter by (e.g., GKP, DEF, MID, FWD).'
                },
                includeRawData: {
                    type: 'boolean',
                    description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
                }
            },
            required: ['playerQuery'] // playerQuery is non-optional in MCP tool
        }
    },
    {
        name: 'get-team',
        description: 'Retrieves detailed information about a specific FPL team using its name or FPL ID.',
        input_schema: {
            type: 'object' as const,
            properties: {
                teamQuery: {
                    type: 'string',
                    description: "Team's name (full or partial, supports fuzzy matching) or exact FPL team ID."
                },
                includeFixtures: {
                    type: 'boolean',
                    description: 'Optional: Include upcoming fixtures for the team. Defaults to true.'
                },
                includePlayers: {
                    type: 'boolean',
                    description: 'Optional: Include a list of key players for the team. Defaults to false.'
                },
                includeRawData: {
                    type: 'boolean',
                    description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
                }
            },
            required: ['teamQuery']
        }
    },
    {
        name: 'get-gameweek',
        description: 'Retrieves information about an FPL gameweek, specified by ID or type (current, next, previous). Can include fixtures.',
        input_schema: {
            type: 'object' as const,
            properties: {
                gameweekId: {
                    type: 'number',
                    description: 'Optional: ID of the gameweek to retrieve.'
                },
                type: {
                    type: 'string',
                    enum: ['current', 'next', 'previous'],
                    description: 'Optional: Specify gameweek by type (current, next, or previous).'
                },
                includeFixtures: {
                    type: 'boolean',
                    description: 'Optional: Whether to include fixtures for the gameweek. Defaults to true.'
                },
                includeRawData: {
                    type: 'boolean',
                    description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
                }
            },
            required: [] // User must provide gameweekId OR type. Claude needs to understand this. Or, make one required if it simplifies.
                       // For now, let Claude decide. The MCP tool can handle if neither is provided.
        }
    },
    {
        name: 'search-players',
        description: 'Searches for FPL players based on various criteria like name, team, position, price, points, and allows sorting.',
        input_schema: {
            type: 'object' as const,
            properties: {
                query: {
                    type: 'string',
                    description: "Optional: Player's name (partial match supported)."
                },
                teamName: {
                    type: 'string',
                    description: 'Optional: Team name to filter by (partial match supported).'
                },
                position: {
                    type: 'string',
                    enum: ['GKP', 'DEF', 'MID', 'FWD'],
                    description: 'Optional: Filter by player position.'
                },
                minPrice: {
                    type: 'number',
                    description: 'Optional: Minimum price (e.g., 5.5 for £5.5m).'
                },
                maxPrice: {
                    type: 'number',
                    description: 'Optional: Maximum price (e.g., 10.0 for £10.0m).'
                },
                minTotalPoints: {
                    type: 'integer', // Assuming Zod's .int() maps to integer
                    description: 'Optional: Minimum total points.'
                },
                sortBy: {
                    type: 'string',
                    enum: ['total_points_desc', 'now_cost_asc', 'now_cost_desc', 'form_desc', 'selected_by_percent_desc', 'price_rise_desc', 'price_rise_asc'],
                    description: "Optional: Stat to sort players by and direction. Defaults to 'total_points_desc'."
                },
                limit: {
                    type: 'integer', // Assuming Zod's .int().positive() maps to integer
                    description: 'Optional: Number of results to return. Defaults to 10.'
                },
                includeRawData: {
                    type: 'boolean',
                    description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
                }
            },
            required: [] // All parameters are optional for broad searches.
        }
    },
    {
        name: 'search-fixtures',
        description: 'Searches for FPL fixtures based on criteria like team(s), gameweek, difficulty, and allows sorting. Can provide details for past matches.',
        input_schema: {
            type: 'object' as const,
            properties: {
                teamQuery: {
                    type: 'string',
                    description: "Optional: One or two team names (e.g., 'Arsenal', or 'Liverpool vs Man City'). Supports partial/fuzzy matching."
                },
                gameweekId: {
                    type: 'integer', // Assuming Zod's .int().positive()
                    description: 'Optional: Filter by a specific gameweek ID.'
                },
                difficultyMin: {
                    type: 'integer', // Assuming Zod's .int().min(1).max(5)
                    description: 'Optional: Minimum FPL difficulty rating (1-5).'
                },
                difficultyMax: {
                    type: 'integer', // Assuming Zod's .int().min(1).max(5)
                    description: 'Optional: Maximum FPL difficulty rating (1-5).'
                },
                sortBy: {
                    type: 'string',
                    enum: ['kickoff_time_asc', 'kickoff_time_desc', 'difficulty_desc', 'difficulty_asc'],
                    description: "Optional: Sort order for the fixtures. Defaults to 'kickoff_time_asc'."
                },
                includeDetails: {
                    type: 'boolean',
                    description: 'Optional: If a single specific past match is found, include detailed stats. Defaults to true.'
                },
                limit: {
                    type: 'integer', // Assuming Zod's .int().positive()
                    description: 'Optional: Maximum number of fixtures to return. Defaults to 10.'
                },
                includeRawData: {
                    type: 'boolean',
                    description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
                }
            },
            required: [] // All parameters are optional.
        }
    },
    {
        name: 'compare-entities',
        description: 'Compares two FPL entities (players or teams) side-by-side on various metrics.',
        input_schema: {
            type: 'object' as const,
            properties: {
                entity1Query: {
                    type: 'string',
                    description: 'Name or FPL ID of the first player or team.'
                },
                entity2Query: {
                    type: 'string',
                    description: 'Name or FPL ID of the second player or team.'
                },
                entityType: {
                    type: 'string',
                    enum: ['player', 'team'],
                    description: "The type of entities to compare ('player' or 'team')."
                },
                includeRawData: {
                    type: 'boolean',
                    description: 'Optional: Whether to include raw JSON data in the response. Defaults to false.'
                }
            },
            required: ['entity1Query', 'entity2Query', 'entityType']
        }
    }
    // Note: The 'echo' tool from MCP server is not included here as it's likely for testing.
    // The 'get-gameweek-fixtures' tool from chat.ts is removed as its functionality
    // is covered by 'get-gameweek' with includeFixtures=true or 'search-fixtures'.
];

export async function processUserMessage(
    chatId: string | null,
    message: string,
    mcpSessionId?: string
) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Create or get chat ID
    if (!chatId) {
        if (user) {
            // Authenticated user: Create chat in database
            const { data, error } = await supabase
                .from('chats')
                .insert({
                    user_id: user.id,
                    title: `Chat ${new Date().toLocaleDateString()}`,
                })
                .select()
                .single();

            if (error) throw error;
            chatId = data.id;
        } else {
            // Anonymous user: Generate client-side ID
            chatId = `anon-${uuidv4()}`;
        }
    }

    // Store user message
    if (user && chatId) {
        await supabase.from('messages').insert({
            chat_id: chatId,
            content: message,
            role: 'user',
        });
    }

    let updatedSessionId = mcpSessionId;

    try {
        // Call Claude with tools enabled
        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            system: `You are a Fantasy Premier League (FPL) expert assistant. Help users with FPL-related queries using your extensive knowledge and the available tools.
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

Remember that you're advising on Fantasy Premier League (FPL), which is a fantasy sports game based on the English Premier League.`,
            messages: [{ role: 'user' as const, content: message }],
            tools: toolsForClaude,
            tool_choice: { type: 'auto' },
        });

        // Check if the response includes any tool calls
        const toolCalls = response.content.filter(
            (block): block is ToolUseBlock => block.type === 'tool_use'
        );

        let answer = '';

        if (toolCalls.length > 0) {
            // Process tool calls and create a new message
            const userMessage = { role: 'user' as const, content: message };
            
            // Run the tools and get their results
            const toolResults = await Promise.all(
                toolCalls.map(async (toolCall) => {
                    const result = await callMcpTool(
                        toolCall.name,
                        toolCall.input as Record<string, any>,
                        updatedSessionId
                    );
                    
                    // Update the session ID if we received a new one
                    if (result.sessionId) {
                        updatedSessionId = result.sessionId;
                    }
                    
                    return {
                        toolCall,
                        result: result.success ? result.result : { error: result.error }
                    };
                })
            );
            
            // Format the tool results as text for the follow-up message
            // Construct the content array for the assistant's tool use turn
            const assistantToolUseContent: any[] = response.content.map(block => {
                if (block.type === 'tool_use') {
                    return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
                }
                return block; // Should primarily be tool_use blocks if toolCalls.length > 0
            }).filter(block => block.type === 'tool_use'); // Ensure only tool_use blocks

            // Construct the user message with tool results
            const userToolResultsContent: any[] = toolResults.map(({ toolCall, result }) => ({
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: JSON.stringify(result) // Ensure content is a string, Claude API expects string or array of blocks
            }));
                
            // Send a follow-up message with the tool results
            const finalResponse = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1500,
                system: `You are a Fantasy Premier League (FPL) assistant. You have received results from tools you requested. Use these results to answer the user's original question comprehensively.`,
                messages: [
                    userMessage,
                    { 
                        role: 'assistant' as const,
                        content: assistantToolUseContent 
                    },
                    {
                        role: 'user' as const,
                        content: userToolResultsContent
                    }
                ],
            });

            // Extract final answer
            const textBlock = finalResponse.content.find(
                (block): block is TextBlock => block.type === 'text'
            );
            answer = textBlock?.text || 'Could not extract a text response after tool use.';
        } else {
            // If no tool calls were made, extract the answer from the original response
            const textBlock = response.content.find(
                (block): block is TextBlock => block.type === 'text'
            );
            answer = textBlock?.text || 'No tool calls were made, and no direct text response was found.';
        }

        // Store Claude's response for authenticated user
        if (user && chatId && answer) {
            await supabase.from('messages').insert({
                chat_id: chatId,
                content: answer,
                role: 'assistant',
            });
        }

        return {
            success: true,
            chatId,
            answer,
            mcpSessionId: updatedSessionId,
        };
    } catch (error) {
        console.error('Error processing message with Claude:', error);
        let errorMessage = 'Sorry, I encountered an error while processing your question.';
        if (error instanceof Anthropic.APIError) {
            errorMessage = `API Error: ${error.status} ${error.name} - ${error.message}`;
        } else if (error instanceof Error) {
            errorMessage = `Error: ${error.message}`;
        }
        return {
            success: false,
            chatId,
            answer: errorMessage,
            mcpSessionId,
        };
    }
}
