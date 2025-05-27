// app/actions/chat-stream.ts
'use server';

import { Anthropic } from '@anthropic-ai/sdk';
import { callMcpTool } from './mcp-tools';

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || '',
});

export async function* streamChatResponse(
    message: string,
    mcpSessionId?: string
) {
    let sessionId = mcpSessionId;

    try {
        console.log('Starting streamChatResponse with:', { message, mcpSessionId });
        // Call Claude with tools enabled and streaming
        const stream = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            system: `You are a Fantasy Premier League (FPL) assistant. You have access to tools for retrieving FPL data.
               When asked about players, teams, fixtures, or gameweeks, use the appropriate tools to get accurate data.
               Keep responses concise but informative.`,
            messages: [{ role: 'user' as const, content: message }],
            stream: true,
            tools: [
                {
                    name: 'get-player',
                    description: 'Get information about an FPL player',
                    input_schema: {
                        type: 'object',
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
                        type: 'object',
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
                        type: 'object',
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
                        type: 'object',
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
                        type: 'object',
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
            ],
            tool_choice: { type: 'auto' },
        });

        // Handle streaming response
        const toolCalls: any[] = [];
        
        for await (const chunk of stream) {
            console.log('Received chunk:', chunk.type, chunk);
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                yield { type: 'text', content: chunk.delta.text };
            } else if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
                console.log('Found tool call:', chunk.content_block.name);
                toolCalls.push(chunk.content_block);
                yield { type: 'tool_call', toolName: chunk.content_block.name };
            }
        }
        
        // If there were tool calls, handle them and get a follow-up response
        if (toolCalls.length > 0) {
            console.log('Processing tool calls:', toolCalls.length);
            // Run the tools
            const toolResults = await Promise.all(
                toolCalls.map(async (toolCall) => {
                    const result = await callMcpTool(
                        toolCall.name,
                        toolCall.input as Record<string, any>,
                        sessionId
                    );
                    
                    // Update session ID if we got a new one
                    if (result.sessionId && result.sessionId !== sessionId) {
                        sessionId = result.sessionId;
                    }
                    
                    return {
                        type: 'tool_result' as const,
                        tool_use_id: toolCall.id,
                        content: result.success ? result.result?.[0]?.text || 'No data returned' : `Error: ${result.error}`
                    };
                })
            );
            
            // Send a follow-up message with tool results to get final response
            const finalStream = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                system: `You are a Fantasy Premier League (FPL) assistant.`,
                messages: [
                    { role: 'user' as const, content: message },
                    {
                        role: 'assistant' as const,
                        content: [
                            ...toolCalls.map(tc => ({
                                type: 'tool_use' as const,
                                id: tc.id,
                                name: tc.name,
                                input: tc.input
                            })),
                        ]
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

        return { sessionId };
    } catch (error) {
        console.error('Error processing message with Claude:', error);
        yield { type: 'error', content: 'Sorry, I encountered an error while processing your question.' };
    }
}