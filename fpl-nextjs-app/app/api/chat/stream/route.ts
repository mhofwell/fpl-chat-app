// app/api/chat/stream/route.ts
import { streamChatResponse } from '@/app/actions/chat-stream';
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { message, sessionId } = await request.json();
        
        if (!message || typeof message !== 'string') {
            return new Response('Invalid message', { status: 400 });
        }

        const encoder = new TextEncoder();
        
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of streamChatResponse(message, sessionId)) {
                        // Encode each chunk as JSON followed by newline
                        const data = JSON.stringify(chunk) + '\n';
                        controller.enqueue(encoder.encode(data));
                    }
                    controller.close();
                } catch (error) {
                    console.error('Stream processing error:', error);
                    const errorChunk = JSON.stringify({ 
                        type: 'error', 
                        content: 'An error occurred while processing your request.' 
                    }) + '\n';
                    controller.enqueue(encoder.encode(errorChunk));
                    controller.close();
                }
            },
            cancel() {
                console.log('Stream cancelled by client');
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error) {
        console.error('API route error:', error);
        return new Response('Internal server error', { status: 500 });
    }
}