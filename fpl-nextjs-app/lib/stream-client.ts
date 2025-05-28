// lib/stream-client.ts
'use client';

import { StreamChunk } from '@/types/streaming';

/**
 * Client-side streaming function that calls the server action
 */
export async function* streamChatClient(
    message: string,
    sessionId?: string
): AsyncGenerator<StreamChunk, void, unknown> {
    try {
        // Call the streaming endpoint directly
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message, sessionId }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body reader available');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                // Decode the chunk and add to buffer
                buffer += decoder.decode(value, { stream: true });
                
                // Process complete lines from buffer
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const chunk = JSON.parse(line);
                            // Skip 'done' signals
                            if (chunk.type === 'done') continue;
                            yield chunk as StreamChunk;
                        } catch (parseError) {
                            console.error('Failed to parse chunk:', parseError, line);
                        }
                    }
                }
            }
            
            // Process any remaining data in buffer
            if (buffer.trim()) {
                try {
                    const chunk = JSON.parse(buffer) as StreamChunk;
                    yield chunk;
                } catch (parseError) {
                    console.error('Failed to parse final chunk:', parseError, buffer);
                }
            }
        } finally {
            reader.releaseLock();
        }
    } catch (error) {
        console.error('Streaming error:', error);
        yield { 
            type: 'error', 
            content: error instanceof Error ? error.message : 'Unknown streaming error' 
        };
    }
}