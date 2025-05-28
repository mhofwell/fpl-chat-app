// app/actions/stream-wrapper.ts
'use server';

import { streamChatResponse } from './chat-stream';

/**
 * Wrapper to convert the async generator to a serializable format for client consumption
 */
export async function streamChatResponseAction(
    message: string,
    mcpSessionId?: string
) {
    // Create a readable stream that can be consumed by the client
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
        async start(controller) {
            try {
                for await (const chunk of streamChatResponse(message, mcpSessionId)) {
                    // Encode each chunk as JSON and send it
                    const data = JSON.stringify(chunk) + '\n';
                    controller.enqueue(encoder.encode(data));
                }
                controller.close();
            } catch (error) {
                console.error('Stream error:', error);
                const errorChunk = JSON.stringify({ 
                    type: 'error', 
                    content: 'An error occurred while processing your request.' 
                }) + '\n';
                controller.enqueue(encoder.encode(errorChunk));
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
        },
    });
}