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

export async function processUserMessage(
    chatId: string | null,
    message: string
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


    try {
        // Call Claude with tools enabled
        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            system: `You are a Fantasy Premier League (FPL) assistant. You have access to tools for retrieving FPL data.
               When asked about players, teams, fixtures, or gameweeks, use the appropriate tools to get accurate data.
               Keep responses concise but informative.`,
            messages: [{ role: 'user' as const, content: message }],
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
            ],
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
                        toolCall.input as Record<string, any>
                    );
                    
                    return {
                        toolCall,
                        result: result.success ? result.result : { error: result.error }
                    };
                })
            );
            
            // Format the tool results as text for the follow-up message
            const toolResultsText = toolResults
                .map(({ toolCall, result }) => 
                    `Results from ${toolCall.name}: ${JSON.stringify(result)}`
                )
                .join('\n\n');
                
            // Send a follow-up message with the tool results
            const finalResponse = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                system: `You are a Fantasy Premier League (FPL) assistant.`,
                messages: [
                    userMessage,
                    { 
                        role: 'user' as const, 
                        content: `I've run the tools you requested. Here are the results:\n\n${toolResultsText}\n\nPlease provide a final response to my original question: "${message}"`
                    }
                ],
            });

            // Extract final answer
            const textBlock = finalResponse.content.find(
                (block): block is TextBlock => block.type === 'text'
            );
            answer = textBlock?.text || '';
        } else {
            // If no tool calls were made, extract the answer from the original response
            const textBlock = response.content.find(
                (block): block is TextBlock => block.type === 'text'
            );
            answer = textBlock?.text || '';
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
        };
    } catch (error) {
        console.error('Error processing message with Claude:', error);
        return {
            success: false,
            chatId,
            answer: 'Sorry, I encountered an error while processing your question.',
        };
    }
}
