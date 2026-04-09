import { NextRequest } from 'next/server';
import { initializeMcpSession, callMcpTool } from '@/app/actions/mcp';
import { createClaudeStream } from '@/lib/claude/claude';
import { handleAnthropicError } from '@/lib/claude/error';
import { ToolCall } from '@/lib/types/fpl-types';


export async function POST(request: NextRequest) {
    try {
        const { message } = await request.json();

        if (!message || typeof message !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Invalid message format' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Initialize MCP session and get tools
                    console.log('Initializing MCP session...');
                    const sessionId = await initializeMcpSession();
                    if (!sessionId) {
                        throw new Error('Failed to initialize MCP session');
                    }

                    const stream = await createClaudeStream(message);

                    // Track current tool use
                    let currentToolCall: ToolCall | null = null;

                    for await (const event of stream as any) {
                        // Debug: Log all event types
                        console.log(
                            'Stream event type:',
                            event.type,
                            event.delta?.type
                        );

                        if (
                            event.type === 'content_block_delta' &&
                            event.delta.type === 'text_delta'
                        ) {
                            const chunk = encoder.encode(
                                `data: ${JSON.stringify({ text: event.delta.text })}\n\n`
                            );
                            controller.enqueue(chunk);
                        } else if (
                            event.type === 'content_block_start' &&
                            event.content_block.type === 'tool_use'
                        ) {
                            // Start tracking this tool call
                            currentToolCall = {
                                id: event.content_block.id,
                                name: event.content_block.name,
                                inputJson: '',
                            };
                            console.log(
                                `Tool use started: ${currentToolCall.name}`
                            );
                        } else if (
                            event.type === 'content_block_delta' &&
                            event.delta.type === 'input_json_delta' &&
                            currentToolCall
                        ) {
                            // Accumulate the JSON input
                            currentToolCall.inputJson +=
                                event.delta.partial_json;
                        } else if (
                            event.type === 'content_block_stop' &&
                            currentToolCall
                        ) {
                            // Parse and execute the tool
                            try {
                                const toolInput = currentToolCall.inputJson
                                    ? JSON.parse(currentToolCall.inputJson)
                                    : {};

                                console.log(
                                    `Executing tool: ${currentToolCall.name} with args:`,
                                    JSON.stringify(toolInput, null, 2)
                                );

                                const toolResult = await callMcpTool(
                                    currentToolCall.name,
                                    toolInput,
                                    sessionId
                                );

                                if (!toolResult.success) {
                                    throw new Error(
                                        toolResult.error ||
                                            'Tool execution failed'
                                    );
                                }

                                const resultText = Array.isArray(
                                    toolResult.result?.content
                                )
                                    ? toolResult.result.content
                                          .map((c: any) => c.text)
                                          .join('\n')
                                    : toolResult.result?.content?.[0]?.text ||
                                      'Tool executed successfully';

                                // Stream the tool result
                                const toolChunk = encoder.encode(
                                    `data: ${JSON.stringify({ text: '\n\n' + resultText })}\n\n`
                                );
                                controller.enqueue(toolChunk);
                            } catch (toolError) {
                                console.error(
                                    'Tool execution error:',
                                    toolError
                                );
                                const errorChunk = encoder.encode(
                                    `data: ${JSON.stringify({ text: '\n\nError executing tool. Please try again.' })}\n\n`
                                );
                                controller.enqueue(errorChunk);
                            } finally {
                                // Reset for next tool
                                currentToolCall = null;
                            }
                        }
                    }

                    controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                    controller.close();
                } catch (error) {
                    console.error('Streaming error:', error);
                    const errorResponse = handleAnthropicError(error);
                    const errorChunk = encoder.encode(
                        `data: ${JSON.stringify(errorResponse)}\n\n`
                    );
                    controller.enqueue(errorChunk);
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            },
        });
    } catch (error) {
        console.error('Request processing error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to process request' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
