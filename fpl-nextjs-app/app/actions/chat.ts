// app/actions/chat.ts
'use server';

import { Anthropic } from '@anthropic-ai/sdk';
import { TextBlock, ToolUseBlock } from '@anthropic-ai/sdk/resources';
// we will need to use the supabase client to store the chat history lets do this later
//
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
//
import { callMcpTool } from '@/lib/mcp/client';

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || '',
});

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


    let sessionId = mcpSessionId;

    try {
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
        let fullResponse = '';
        const toolCalls: any[] = [];
        
        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                fullResponse += chunk.delta.text;
            } else if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
                toolCalls.push(chunk.content_block);
            }
        }
        
        // If there were tool calls, handle them and get a follow-up response
        if (toolCalls.length > 0) {
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
                        content: result.error ? `Error: ${result.error}` : 
                            (result.result?.[0]?.text || JSON.stringify(result.result) || 'No data returned')
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
            fullResponse = '';
            for await (const chunk of finalStream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                    fullResponse += chunk.delta.text;
                }
            }
        }

        const answer = fullResponse;

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
            mcpSessionId: sessionId,
        };
    } catch (error) {
        console.error('Error processing message with Claude:', error);
        return {
            success: false,
            chatId,
            answer: 'Sorry, I encountered an error while processing your question.',
            mcpSessionId: sessionId,
        };
    }
}
