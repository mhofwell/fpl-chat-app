// app/actions/chat-stream.ts
'use server';

import { Anthropic } from '@anthropic-ai/sdk';
import { getMcpClient, callMcpTool as mcpCallTool, listMcpTools } from '@/lib/mcp/client';

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || '',
});

// Don't cache tools to ensure fresh data for each session
// let cachedTools: any[] | null = null;

/**
 * Get tools schema from MCP server
 */
async function getToolsForClaude(sessionId?: string): Promise<any[]> {
    try {
        const tools = await listMcpTools(sessionId);
        console.log('Available MCP tools:', tools.map(t => t.name));
        
        // Convert MCP tool format to Claude's expected format
        const formattedTools = tools.map(tool => ({
            name: tool.name,
            description: tool.description || `Tool: ${tool.name}`,
            input_schema: tool.inputSchema || {
                type: 'object' as const,
                properties: {},
                required: [],
            },
        }));
        
        return formattedTools;
    } catch (error) {
        console.error('Failed to fetch tools from MCP server:', error);
        // Fallback to hardcoded tools if MCP server is unavailable
        return getFallbackTools();
    }
}

/**
 * Fallback tools definition in case MCP server is unavailable
 */
function getFallbackTools() {
    return [
    {
        name: 'get-player',
        description: 'Get information about an FPL player',
        input_schema: {
            type: 'object' as const,
            properties: {
                playerId: {
                    type: 'number',
                    description: 'ID of the player',
                },
                playerName: {
                    type: 'string',
                    description: 'Name of the player to search for',
                },
                includeRawData: {
                    type: 'boolean',
                    description: 'Whether to include raw JSON data',
                },
            },
            required: [],
        },
    },
    {
        name: 'get-team',
        description: 'Get information about an FPL team',
        input_schema: {
            type: 'object' as const,
            properties: {
                teamId: {
                    type: 'number',
                    description: 'ID of the team',
                },
            },
            required: ['teamId'],
        },
    },
    {
        name: 'get-gameweek',
        description: 'Get information about an FPL gameweek',
        input_schema: {
            type: 'object' as const,
            properties: {
                gameweekId: {
                    type: 'number',
                    description: 'ID of the gameweek',
                },
                getCurrent: {
                    type: 'boolean',
                    description: 'Get current gameweek',
                },
                getNext: {
                    type: 'boolean',
                    description: 'Get next gameweek',
                },
                includeFixtures: {
                    type: 'boolean',
                    description: 'Include fixtures in response',
                },
            },
            required: [],
        },
    },
    {
        name: 'get-gameweek-fixtures',
        description: 'Get fixtures for a specific gameweek',
        input_schema: {
            type: 'object' as const,
            properties: {
                gameweekId: {
                    type: 'number',
                    description: 'ID of the gameweek',
                },
            },
            required: ['gameweekId'],
        },
    },
    {
        name: 'get-top-scorers',
        description: 'Get the top goal scorers in the Premier League',
        input_schema: {
            type: 'object' as const,
            properties: {
                limit: {
                    type: 'number',
                    description: 'Number of top scorers to return (default: 10)',
                },
                position: {
                    type: 'string',
                    description: 'Filter by position (GKP, DEF, MID, FWD)',
                },
            },
            required: [],
        },
    },
    ];
}

// System prompt for Claude
const CLAUDE_SYSTEM_PROMPT = `You are a Fantasy Premier League (FPL) expert assistant. Help users with FPL-related queries using your extensive knowledge and the available tools.
When asked about players, teams, fixtures, or gameweeks, use the appropriate tools to get accurate data.
Keep responses concise but informative.

AVAILABLE TOOLS:
- get-player: Get information about a specific FPL player. Parameters: playerId, playerName, includeRawData.
- get-team: Get information about an FPL team. Parameters: teamId (required).
- get-gameweek: Get information about an FPL gameweek. Parameters: gameweekId, getCurrent, getNext, includeFixtures.
- get-gameweek-fixtures: Get fixtures for a specific gameweek. Parameters: gameweekId (required).
- get-top-scorers: Get the top goal scorers in the Premier League. Parameters: limit, position.

TOOL SELECTION STRATEGY:
1. For "top scorers", "leading scorers", "most goals" questions: use get-top-scorers
2. For specific player info: use get-player
3. For team info: use get-team (need team ID)
4. For current/next gameweek info: use get-current-gameweek
5. For gameweek fixtures: use get-gameweek-fixtures

RESPONSE GUIDELINES:
- Always provide context for statistics
- Include strategic FPL insights when relevant
- For player recommendations, consider form, fixtures, and value
- Explain your reasoning for recommendations

Remember that you're advising on Fantasy Premier League (FPL), which is a fantasy sports game based on the English Premier League.`;

/**
 * Initialize or verify MCP session
 */
async function ensureMcpSession(sessionId?: string): Promise<string> {
    try {
        const { sessionId: activeSessionId } = await getMcpClient(sessionId);
        return activeSessionId;
    } catch (error) {
        console.error('Failed to ensure MCP session:', error);
        throw new Error('Failed to connect to FPL data service');
    }
}

/**
 * Handle tool calls through MCP client
 */
async function handleToolCalls(
    toolCalls: Array<{ id: string; name: string; input: Record<string, any> }>,
    sessionId: string
): Promise<{
    results: Array<{
        toolCall: { id: string; name: string; input: Record<string, any> };
        result: any;
    }>;
    sessionId: string;
    errors: Array<{
        toolCall: { id: string; name: string; input: Record<string, any> };
        error: string;
    }>;
}> {
    const results: Array<{
        toolCall: { id: string; name: string; input: Record<string, any> };
        result: any;
    }> = [];
    const errors: Array<{
        toolCall: { id: string; name: string; input: Record<string, any> };
        error: string;
    }> = [];
    
    let currentSessionId = sessionId;

    // Process tool calls sequentially to maintain session consistency
    for (const toolCall of toolCalls) {
        try {
            console.log(`Calling tool: ${toolCall.name} with args:`, toolCall.input);
            
            const response = await mcpCallTool(
                toolCall.name,
                toolCall.input,
                currentSessionId
            );
            
            console.log(`Tool response for ${toolCall.name}:`, response);
            
            // Update session ID if changed
            currentSessionId = response.sessionId;
            
            if (response.error) {
                errors.push({
                    toolCall,
                    error: response.error,
                });
            } else {
                results.push({
                    toolCall,
                    result: response.result,
                });
            }
        } catch (error) {
            console.error('Tool call error:', error);
            errors.push({
                toolCall,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    return { results, sessionId: currentSessionId, errors };
}

export async function* streamChatResponse(
    message: string,
    mcpSessionId?: string
) {
    try {
        console.log('Starting streamChatResponse with:', { message, mcpSessionId });
        
        // Ensure we have a valid MCP session
        let sessionId: string;
        try {
            sessionId = await ensureMcpSession(mcpSessionId);
        } catch (error) {
            console.error('Failed to establish MCP session:', error);
            yield { type: 'error' as const, content: 'Failed to connect to FPL data service. Please try again.' };
            return;
        }
        
        // Yield session info if it's different from what was passed
        if (sessionId !== mcpSessionId) {
            yield { type: 'session' as const, sessionId };
        }
        
        // Get available tools
        let toolsForClaude: any[];
        try {
            toolsForClaude = await getToolsForClaude(sessionId);
        } catch (error) {
            console.error('Failed to get tools:', error);
            // Use fallback tools if we can't get them from the server
            toolsForClaude = getFallbackTools();
        }

        // Call Claude with tools enabled and streaming
        let stream;
        try {
            stream = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                system: CLAUDE_SYSTEM_PROMPT,
                messages: [{ role: 'user' as const, content: message }],
                stream: true,
                tools: toolsForClaude,
                tool_choice: { type: 'auto' },
            });
        } catch (error) {
            console.error('Failed to create Claude stream:', error);
            yield { type: 'error' as const, content: 'Failed to process your request. Please try again.' };
            return;
        }

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
            console.log('Processing tool calls:', toolCalls.map(t => ({ name: t.name, id: t.id })));
            
            // Process tool calls
            const { results, sessionId: updatedSessionId, errors } = await handleToolCalls(
                toolCalls.map((tool) => ({
                    id: tool.id,
                    name: tool.name,
                    input: tool.input as Record<string, any>,
                })),
                sessionId
            );

            // Update our local session ID
            sessionId = updatedSessionId;

            // Format the tool results for the follow-up message
            const toolResults = [
                ...results.map(({ toolCall, result }) => {
                    // Extract text content from MCP tool result format
                    let content = '';
                    if (Array.isArray(result)) {
                        // If result is an array of content items
                        content = result.map(item => {
                            if (typeof item === 'string') return item;
                            if (item?.text) return item.text;
                            if (item?.type === 'text') return item.text || item.content || '';
                            return JSON.stringify(item);
                        }).join('\n');
                    } else if (typeof result === 'string') {
                        content = result;
                    } else if (result?.text) {
                        content = result.text;
                    } else {
                        content = JSON.stringify(result);
                    }
                    
                    console.log(`Tool result for ${toolCall.name}:`, content.substring(0, 100) + '...');
                    
                    return {
                        type: 'tool_result' as const,
                        tool_use_id: toolCall.id,
                        content,
                    };
                }),
                ...errors.map(({ toolCall, error }) => ({
                    type: 'tool_result' as const,
                    tool_use_id: toolCall.id,
                    content: `Error: ${error}`,
                })),
            ];

            // Construct the assistant's tool use turn content array
            const assistantToolUseContent = toolCalls.map((block) => ({
                type: 'tool_use' as const,
                id: block.id,
                name: block.name,
                input: block.input,
            }));
            
            // Show that we got tool results
            if (results.length > 0) {
                yield { type: 'text' as const, content: '\n\n' };
            }
            
            // Send a follow-up message with tool results to get final response
            const finalStream = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                system: CLAUDE_SYSTEM_PROMPT,
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
            
        }
        
        // Yield final session ID if it changed
        if (sessionId !== mcpSessionId) {
            yield { type: 'session' as const, sessionId };
        }
    } catch (error) {
        console.error('Error processing message with Claude:', error);
        yield { type: 'error', content: 'Sorry, I encountered an error while processing your question.' };
    }
}